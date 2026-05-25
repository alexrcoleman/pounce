import { CardState } from "../shared/GameUtils";
import { Socket, io } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";

import { isBoardAcceptingMoves, type Move } from "../shared/MoveHandler";
import { GameSocket } from "./GameConnection";
import {
  type ActionAck,
  type ActionEnvelope,
  ServerToClientEvents,
  ClientToServerEvents,
} from "../shared/SocketTypes";

import { useLocalObservable } from "mobx-react-lite";
import SocketState from "./SocketState";
import { runInAction } from "mobx";
import { toast } from "sonner";
import { toastRejectedMove } from "./moveRejectionToast";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const PLAYER_SESSION_STORAGE_KEY = "pounce::playerSessionId";
const DEFAULT_SOCKET_PORT = "3001";
const RECONNECT_TOAST_ID = "room-reconnect";

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
  const moveAckTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const clearMoveAckTimeouts = () => {
    Object.values(moveAckTimeouts.current).forEach(clearTimeout);
    moveAckTimeouts.current = {};
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
      runInAction(() => state.onMoveAck(timeoutAck));
    }, 10000);
    activeSocket.emit("move", action, (ack) => {
      clearTimeout(moveAckTimeouts.current[action.actionId]);
      delete moveAckTimeouts.current[action.actionId];
      if (!ack.ok) {
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
  const flushQueuedMoveActions = (activeSocket: GameSocket) => {
    if (
      !state.isConnected ||
      pendingJoinRoomRef.current != null ||
      queuedMoveActions.current.length === 0
    ) {
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
    let hasPendingPing = false;
    let pingTimeout: ReturnType<typeof setTimeout> | undefined;
    const showReconnectToast = () => {
      if (!hasConnectedRef.current || state.board == null) {
        return;
      }

      hasReconnectToastRef.current = true;
      toast.loading("Reconnecting…", {
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
        hasPendingPing = false;
        updatePingLatency(performance.now() - startedAt);
      });
    };
    socket.on("connect_error", () => {
      updatePingLatency(null);
      if (hasConnectedRef.current || state.board != null) {
        setError(null);
        showReconnectToast();
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
      toast.dismiss(RECONNECT_TOAST_ID);
    };
  }, []);
  const isConnected = state.isConnected;
  useEffect(() => {
    if (socket && isConnected && roomId && name && playerSessionId) {
      const joinedRoomKey = `${roomId}:${playerSessionId}`;
      if (lastJoinedRoomRef.current !== joinedRoomKey) {
        runInAction(() => state.clearBoard());
        clearMoveAckTimeouts();
        queuedMoveActions.current = [];
        lastJoinedRoomRef.current = joinedRoomKey;
      }
      pendingJoinRoomRef.current = joinedRoomKey;
      socket.emit("join_room", { roomId, name, playerSessionId });
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
            !isBoardAcceptingMoves(state.board)
          ) {
            return;
          }
          const action = state.createOptimisticMove(move);
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
        onUpdateHand: (card: CardState) => {
          emitIfConnected("update_hand", { location: card ?? null });
        },
        onUpdateGrabbedItem: (card: CardState | null) => {
          emitIfConnected("update_hand", { item: card ?? null });
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
  onUpdateHand: (card: CardState) => void;
  onUpdateGrabbedItem: (card: CardState | null) => void;
  setAILevel: (level: number) => void;
  onRemoveDisconnectedPlayers: () => void;
};

function createSocket(): ClientSocket {
  const { hostname, protocol } = window.location;
  const isLocalHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  if (isLocalHost) {
    const socketHost = hostname.includes(":") ? `[${hostname}]` : hostname;
    const socketPort =
      process.env.NEXT_PUBLIC_SOCKET_PORT || DEFAULT_SOCKET_PORT;
    return io(`${protocol}//${socketHost}:${socketPort}`);
  }

  return io();
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
