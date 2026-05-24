import { CardState } from "../shared/GameUtils";
import { Socket, io } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Move } from "../shared/MoveHandler";
import { GameSocket } from "./GameConnection";
import {
  type ActionAck,
  ServerToClientEvents,
  ClientToServerEvents,
} from "../shared/SocketTypes";

import { useLocalObservable } from "mobx-react-lite";
import SocketState from "./SocketState";
import { runInAction } from "mobx";
import { toastRejectedMove } from "./moveRejectionToast";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const PLAYER_SESSION_STORAGE_KEY = "pounce::playerSessionId";
const DEFAULT_SOCKET_PORT = "3001";

export default function useGameSocket(
  roomId: string | null,
  name: string | null
) {
  const state = useLocalObservable(() => new SocketState());
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerSessionId, setPlayerSessionId] = useState<string | null>(null);
  const moveAckTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  useEffect(() => {
    setPlayerSessionId(getOrCreatePlayerSessionId());
  }, []);

  useEffect(() => {
    let socket: ClientSocket;
    socket = createSocket();
    let isClosed = false;
    let hasPendingPing = false;
    let pingTimeout: ReturnType<typeof setTimeout> | undefined;
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
      setError("No connection to socket server");
      updatePingLatency(null);
    });
    setSocket(socket);
    socket.on("connect", () => {
      console.log("Connected", socket.id);
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
    });

    socket.on("disconnect", () => {
      runInAction(() => state.onDisconnect());
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
      Object.values(moveAckTimeouts.current).forEach(clearTimeout);
      moveAckTimeouts.current = {};
    };
  }, []);
  const isConnected = state.socketId !== "";
  useEffect(() => {
    if (socket && isConnected && roomId && name && playerSessionId) {
      runInAction(() => state.clearBoard());
      socket.emit("join_room", { roomId, name, playerSessionId });
      return;
    }
  }, [socket, roomId, name, playerSessionId, isConnected]);

  const actions = useMemo<Actions>(
    () => ({
      executeMove: (move: Move) => {
        if (!socket) {
          return;
        }
        const action = state.createOptimisticMove(move);
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
        socket.emit("move", action, (ack) => {
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
      },
      onAddAI: () => socket?.emit("add_ai"),
      onRemoveAI: () => socket?.emit("remove_ai"),
      onRemoveDisconnectedPlayers: () =>
        socket?.emit("remove_disconnected_players"),
      onStart: () => socket?.emit("start_game"),
      onRestart: () => socket?.emit("restart_game"),
      onRotate: () => socket?.emit("rotate_decks"),
      onUpdateHand: (card: CardState) => {
        socket?.emit("update_hand", { location: card ?? null });
      },
      onUpdateGrabbedItem: (card: CardState | null) => {
        socket?.emit("update_hand", { item: card ?? null });
      },
      setAILevel: (level: number) => {
        socket?.emit("set_ai_level", { speed: level });
      },
    }),
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
