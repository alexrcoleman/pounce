import { CardState } from "../shared/GameUtils";
import { Socket, io } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Move } from "../shared/MoveHandler";
import { GameSocket } from "./GameConnection";
import {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../shared/SocketTypes";

import { useLocalObservable } from "mobx-react-lite";
import SocketState from "./SocketState";
import { runInAction } from "mobx";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export default function useGameSocket(
  roomId: string | null,
  name: string | null
) {
  const state = useLocalObservable(() => new SocketState());
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const moveAckTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  useEffect(() => {
    let socket: ClientSocket;
    socket = window.location.host === "localhost:3000" ? io(":3001") : io();
    socket.on("connect_error", () => {
      setError("No connection to socket server");
    });
    setSocket(socket);
    socket.on("connect", () => {
      console.log("Connected", socket.id);
      runInAction(() => state.onConnect(socket.id));
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
    return () => {
      if (socket) {
        socket.close();
      }
      Object.values(moveAckTimeouts.current).forEach(clearTimeout);
      moveAckTimeouts.current = {};
    };
  }, []);
  const isConnected = state.socketId !== "";
  useEffect(() => {
    if (socket && isConnected && roomId && name) {
      runInAction(() => state.clearBoard());
      socket.emit("join_room", { roomId, name });
      return;
    }
  }, [socket, roomId, name, isConnected]);

  const actions = useMemo<Actions>(
    () => ({
      executeMove: (move: Move) => {
        if (!socket) {
          return;
        }
        const action = state.createOptimisticMove(move);
        moveAckTimeouts.current[action.actionId] = setTimeout(() => {
          delete moveAckTimeouts.current[action.actionId];
          runInAction(() =>
            state.onMoveAck({
              actionId: action.actionId,
              ok: false,
              revision: state.serverRevision,
              reason: "Move acknowledgement timed out",
            })
          );
        }, 5000);
        socket.emit("move", action, (ack) => {
          clearTimeout(moveAckTimeouts.current[action.actionId]);
          delete moveAckTimeouts.current[action.actionId];
          runInAction(() => state.onMoveAck(ack));
        });
      },
      onAddAI: () => socket?.emit("add_ai"),
      onRemoveAI: () => socket?.emit("remove_ai"),
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
};
