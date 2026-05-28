import { CardState, CursorLocation } from "../shared/GameUtils";
import { Socket, io } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";

import { isBoardAcceptingMoves, type Move } from "../shared/MoveHandler";
import { GameSocket } from "./GameConnection";
import {
  type ActionAck,
  type ActionEnvelope,
  type RoomAction,
  ServerToClientEvents,
  ClientToServerEvents,
  type ServerNotice,
  type StuckUpdate,
} from "../shared/SocketTypes";

import { useLocalObservable } from "mobx-react-lite";
import SocketState from "./SocketState";
import { runInAction } from "mobx";
import { toast } from "sonner";
import { toastRejectedMove } from "./moveRejectionToast";
import { showServerNoticeToast } from "./ServerNoticeToast";
import { showRoomToast } from "./RoomToast";
import { playRoomActionSound } from "./soundEffects";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const PLAYER_SESSION_STORAGE_KEY = "pounce::playerSessionId";
const DEFAULT_SOCKET_PORT = "3001";
const RECONNECT_TOAST_ID = "room-reconnect";
const STUCK_TOAST_ID = "room-stuck-status";
const SOCKET_HEALTH_ENDPOINT_PATH = "/api/socketio/health";
const INITIAL_SOCKET_WARMUP_TIMEOUT_MS = 10000;
const SOCKET_WARMUP_RETRY_MS = 500;

export default function useGameSocket(
  roomId: string | null,
  name: string | null
) {
  const state = useLocalObservable(() => new SocketState());
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerSessionId, setPlayerSessionId] = useState<string | null>(null);
  const hasConnectedRef = useRef(false);
  const hasReconnectToastRef = useRef(false);
  const lastJoinedRoomRef = useRef<string | null>(null);
  const pendingJoinRoomRef = useRef<string | null>(null);
  const queuedMoveActions = useRef<ActionEnvelope<Move>[]>([]);
  const optimisticallyPlayedMoveActionIds = useRef<Set<string>>(new Set());
  const moveAckTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const clearMoveAckTimeouts = () => {
    Object.values(moveAckTimeouts.current).forEach(clearTimeout);
    moveAckTimeouts.current = {};
  };
  const discardPendingMoveActions = (actionIds: string[]) => {
    if (actionIds.length === 0) {
      return;
    }

    runInAction(() => state.discardPendingMoveActions(actionIds));
  };
  const clearInFlightMoveActions = () => {
    const actionIds = Object.keys(moveAckTimeouts.current);
    clearMoveAckTimeouts();
    discardPendingMoveActions(actionIds);
  };
  const dropQueuedMoveActions = () => {
    const actionIds = queuedMoveActions.current.map(
      (action) => action.actionId
    );
    queuedMoveActions.current = [];
    discardPendingMoveActions(actionIds);
  };
  const showServerNotice = (notice: ServerNotice) => {
    showServerNoticeToast(notice);
  };
  const showStuckUpdate = (update: StuckUpdate) => {
    if (update.rotated) {
      return;
    }
    if (update.playerIndex === state.getActivePlayerIndex()) {
      return;
    }

    toast(
      update.isStuck
        ? `${update.playerName} marked stuck`
        : `${update.playerName} cleared stuck`,
      {
        description: `${update.stuckCount}/${update.stuckTotal} players marked stuck`,
        id: STUCK_TOAST_ID,
      }
    );
  };
  const sendMoveAction = (
    activeSocket: GameSocket,
    action: ActionEnvelope<Move>
  ) => {
    moveAckTimeouts.current[action.actionId] = setTimeout(() => {
      delete moveAckTimeouts.current[action.actionId];
      const timeoutAck: ActionAck = {
        actionId: action.actionId,
        ok: false,
        revision: state.serverRevision,
        reason: "Move acknowledgement timed out",
      };
      toastRejectedMove({
        board: state.serverBoard,
        move: action.payload,
        playerIndex: state.getActivePlayerIndex(),
        reason: timeoutAck.reason,
      });
      optimisticallyPlayedMoveActionIds.current.delete(action.actionId);
      runInAction(() => state.onMoveAck(timeoutAck));
    }, 10000);
    activeSocket.emit("move", action, (ack) => {
      clearTimeout(moveAckTimeouts.current[action.actionId]);
      delete moveAckTimeouts.current[action.actionId];
      if (!ack.ok) {
        optimisticallyPlayedMoveActionIds.current.delete(action.actionId);
        toastRejectedMove({
          board: state.serverBoard,
          move: action.payload,
          playerIndex: state.getActivePlayerIndex(),
          reason: ack.reason,
        });
      }
      runInAction(() => state.onMoveAck(ack));
    });
  };
  const playOptimisticMoveSound = (
    action: ActionEnvelope<Move>,
    playerIndex: number
  ) => {
    const roomAction: RoomAction = {
      type: "move",
      actionId: action.actionId,
      playerIndex,
      move: action.payload,
      time: Date.now(),
      revision: state.serverRevision,
    };

    optimisticallyPlayedMoveActionIds.current.add(action.actionId);
    playRoomActionSound(roomAction, {
      activePlayerIndex: playerIndex,
    });
  };
  const flushQueuedMoveActions = (activeSocket: GameSocket) => {
    if (
      !state.isConnected ||
      pendingJoinRoomRef.current != null ||
      queuedMoveActions.current.length === 0
    ) {
      return;
    }
    const playerIndex = state.getActivePlayerIndex();
    const player = state.board?.players[playerIndex];
    if (
      !state.board ||
      playerIndex < 0 ||
      player?.isSpectating === true ||
      !isBoardAcceptingMoves(state.board, state.getEstimatedServerTime())
    ) {
      dropQueuedMoveActions();
      return;
    }

    const actions = queuedMoveActions.current.splice(0);
    actions.forEach((action) => sendMoveAction(activeSocket, action));
  };
  useEffect(() => {
    const nextPlayerSessionId = getOrCreatePlayerSessionId();
    setPlayerSessionId(nextPlayerSessionId);
    runInAction(() => state.setPlayerSessionId(nextPlayerSessionId));
  }, [state]);

  useEffect(() => {
    let socket: ClientSocket;
    socket = createSocket();
    let isClosed = false;
    let hasAttemptedInitialWarmup = false;
    let isInitialWarmupInFlight = false;
    let hasPendingPing = false;
    let pingTimeout: ReturnType<typeof setTimeout> | undefined;
    const showReconnectToast = () => {
      if (!hasConnectedRef.current || state.board == null) {
        return;
      }

      hasReconnectToastRef.current = true;
      toast.loading("Connection lost. Reconnecting...", {
        duration: Infinity,
        id: RECONNECT_TOAST_ID,
      });
    };
    const resolveReconnectToast = () => {
      if (!hasReconnectToastRef.current) {
        return;
      }

      hasReconnectToastRef.current = false;
      toast.success("Reconnected", {
        duration: 1600,
        id: RECONNECT_TOAST_ID,
      });
    };
    const updatePingLatency = (latency: number | null) => {
      if (!isClosed) {
        runInAction(() => state.setPingLatency(latency));
      }
    };
    const sendPing = () => {
      if (hasPendingPing) {
        return;
      }
      if (!socket.connected) {
        updatePingLatency(null);
        return;
      }

      hasPendingPing = true;
      const startedAt = performance.now();
      pingTimeout = setTimeout(() => {
        hasPendingPing = false;
        updatePingLatency(null);
      }, 5000);
      socket.emit("room_ping", { clientTime: Date.now() }, () => {
        if (pingTimeout) {
          clearTimeout(pingTimeout);
          pingTimeout = undefined;
        }
        const roundTripMs = performance.now() - startedAt;
        hasPendingPing = false;
        updatePingLatency(roundTripMs);
      });
    };
    const warmUpServerAndReconnect = () => {
      if (hasAttemptedInitialWarmup || isInitialWarmupInFlight) {
        return;
      }

      hasAttemptedInitialWarmup = true;
      isInitialWarmupInFlight = true;
      waitForSocketServerWarmup()
        .catch((error) => {
          console.warn(
            "Unable to warm up socket server before reconnect",
            error
          );
          if (!isClosed && !socket.connected) {
            setError("No connection to socket server");
          }
        })
        .finally(() => {
          isInitialWarmupInFlight = false;
          if (!isClosed && !socket.connected) {
            socket.connect();
          }
        });
    };
    socket.on("connect_error", () => {
      updatePingLatency(null);
      if (hasConnectedRef.current || state.board != null) {
        setError(null);
        showReconnectToast();
        return;
      }

      if (!hasAttemptedInitialWarmup || isInitialWarmupInFlight) {
        setError(null);
        warmUpServerAndReconnect();
        return;
      }

      setError("No connection to socket server");
    });
    setSocket(socket);
    socket.on("connect", () => {
      console.log("Connected", socket.id);
      hasConnectedRef.current = true;
      setError(null);
      runInAction(() => state.onConnect(socket.id));
      sendPing();
    });

    socket.on("alert", (message) => {
      alert(message);
    });
    socket.on("room_toast", showRoomToast);
    socket.on("player_reaction", (reaction) => {
      runInAction(() => state.addReaction(reaction));
    });
    socket.on("room_action", (action) => {
      if (optimisticallyPlayedMoveActionIds.current.delete(action.actionId)) {
        return;
      }

      playRoomActionSound(action, {
        activePlayerIndex: state.getActivePlayerIndex(),
      });
    });
    socket.on("server_notice", showServerNotice);
    socket.on("stuck_update", showStuckUpdate);
    socket.on("update_hands", ({ hands }) => {
      runInAction(() => state.updateHands(hands));
    });
    socket.on("update", (data) => {
      runInAction(() => state.onUpdate(data));
      pendingJoinRoomRef.current = null;
      resolveReconnectToast();
      flushQueuedMoveActions(socket);
    });

    socket.on("disconnect", () => {
      pendingJoinRoomRef.current = lastJoinedRoomRef.current;
      clearInFlightMoveActions();
      runInAction(() => state.onDisconnect());
      showReconnectToast();
    });
    const pingInterval = setInterval(sendPing, 3000);
    return () => {
      isClosed = true;
      if (socket) {
        socket.close();
      }
      if (pingTimeout) {
        clearTimeout(pingTimeout);
      }
      clearInterval(pingInterval);
      clearMoveAckTimeouts();
      queuedMoveActions.current = [];
      optimisticallyPlayedMoveActionIds.current.clear();
      toast.dismiss(RECONNECT_TOAST_ID);
    };
  }, []);
  const isConnected = state.isConnected;
  useEffect(() => {
    if (socket && isConnected && roomId && name && playerSessionId) {
      const joinedRoomKey = `${roomId}:${playerSessionId}`;
      if (lastJoinedRoomRef.current !== joinedRoomKey) {
        setError(null);
        runInAction(() => state.clearBoard());
        clearMoveAckTimeouts();
        queuedMoveActions.current = [];
        lastJoinedRoomRef.current = joinedRoomKey;
      }
      pendingJoinRoomRef.current = joinedRoomKey;
      runInAction(() => state.beginRoomSync());
      socket.emit("join_room", { roomId, name, playerSessionId }, (ack) => {
        if (ack.ok) {
          return;
        }

        pendingJoinRoomRef.current = null;
        dropQueuedMoveActions();
        setError(ack.message);
        showServerNotice({
          type: "server_draining",
          stage: ack.stage,
          message: ack.message,
          description: ack.description,
          retryAfterMs: ack.retryAfterMs,
          drainingUntil: ack.drainingUntil,
        });
        runInAction(() => state.clearBoard());
      });
      return;
    }
  }, [socket, roomId, name, playerSessionId, isConnected]);

  const actions = useMemo<Actions>(
    () => {
      const emitIfConnected = <Event extends keyof ClientToServerEvents>(
        event: Event,
        ...args: Parameters<ClientToServerEvents[Event]>
      ) => {
        if (!socket || !state.isConnected || pendingJoinRoomRef.current) {
          return;
        }
        socket.emit(event, ...args);
      };

      return {
        executeMove: (move: Move) => {
          const playerIndex = state.getActivePlayerIndex();
          const player = state.board?.players[playerIndex];
          if (
            !state.board ||
            playerIndex < 0 ||
            player?.isSpectating === true ||
            !isBoardAcceptingMoves(
              state.board,
              state.getEstimatedServerTime()
            )
          ) {
            return;
          }
          const action = state.createOptimisticMove(move);
          playOptimisticMoveSound(action, playerIndex);
          if (!socket || !state.isConnected || pendingJoinRoomRef.current) {
            queuedMoveActions.current.push(action);
            return;
          }
          sendMoveAction(socket, action);
        },
        onAddAI: () => emitIfConnected("add_ai"),
        onRemoveAI: () => emitIfConnected("remove_ai"),
        onRemoveDisconnectedPlayers: () =>
          emitIfConnected("remove_disconnected_players"),
        onStart: () => emitIfConnected("start_game"),
        onRestart: () => emitIfConnected("restart_game"),
        onRotate: () => emitIfConnected("rotate_decks"),
        onUpdateHand: (location: CursorLocation) => {
          emitIfConnected("update_hand", { location: location ?? null });
        },
        onUpdateGrabbedItem: (
          card: CardState | null,
          cards: CardState[] | null = card ? [card] : null
        ) => {
          emitIfConnected("update_hand", {
            item: card ?? null,
            items: cards ?? null,
          });
        },
        setAILevel: (level: number) => {
          emitIfConnected("set_ai_level", { speed: level });
        },
      };
    },
    [socket, state]
  );
  return {
    error,
    isConnected,
    actions,
    state,
    socket,
  };
}

export type Actions = {
  executeMove: (move: Move) => void;
  onAddAI: () => void;
  onRemoveAI: () => void;
  onStart: () => void;
  onRestart: () => void;
  onRotate: () => void;
  onUpdateHand: (location: CursorLocation) => void;
  onUpdateGrabbedItem: (
    card: CardState | null,
    cards?: CardState[] | null
  ) => void;
  setAILevel: (level: number) => void;
  onRemoveDisconnectedPlayers: () => void;
};

function createSocket(): ClientSocket {
  const localSocketOrigin = getLocalSocketOrigin();
  if (localSocketOrigin) {
    return io(localSocketOrigin);
  }

  return io();
}

function getSocketWarmupUrl(): string {
  return `${getLocalSocketOrigin() ?? ""}${SOCKET_HEALTH_ENDPOINT_PATH}`;
}

function getLocalSocketOrigin(): string | null {
  const { hostname, protocol } = window.location;
  const isLocalHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!isLocalHost) {
    return null;
  }

  const socketHost = hostname.includes(":") ? `[${hostname}]` : hostname;
  const socketPort = process.env.NEXT_PUBLIC_SOCKET_PORT || DEFAULT_SOCKET_PORT;
  return `${protocol}//${socketHost}:${socketPort}`;
}

async function waitForSocketServerWarmup() {
  const deadline = Date.now() + INITIAL_SOCKET_WARMUP_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(getSocketWarmupUrl(), {
        cache: "no-store",
      });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Socket health check failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(SOCKET_WARMUP_RETRY_MS);
  }

  throw lastError ?? new Error("Socket health check timed out");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrCreatePlayerSessionId() {
  const existing = sessionStorage.getItem(PLAYER_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const nextId =
    window.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(PLAYER_SESSION_STORAGE_KEY, nextId);
  return nextId;
}
