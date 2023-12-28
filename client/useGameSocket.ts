import { BoardState, CardState, CursorState } from "../shared/GameUtils";
import { Socket, io } from "socket.io-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Move } from "../shared/MoveHandler";
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
  const [socket, setSocket] = useState<ClientSocket | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let socket: ClientSocket;
    fetch("/api/socketio", { signal: controller.signal }).finally(() => {
      if (controller.signal.aborted) {
        return;
      }
      socket = io();
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
    });
    return () => {
      controller.abort();
      if (socket) {
        socket.close();
      }
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
      executeMove: (move: Move) => socket?.emit("move", move),
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
    [socket]
  );
  return {
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
