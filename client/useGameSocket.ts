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

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export default function useGameSocket(
  roomId: string | null,
  name: string | null
) {
  const state = useLocalObservable(() => new SocketState());
  const [socket, setSocket] = useState<ClientSocket | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    console.log("Building socket...");
    let socket: ClientSocket;
    fetch("/api/socketio", { signal: controller.signal }).finally(() => {
      if (controller.signal.aborted) {
        return;
      }
      console.log("Fetch complete, connecting socket...");
      socket = io();
      setSocket(socket);
      socket.on("connect", () => {
        console.log("Connected", socket.id);
        state.socketId = socket.id;
      });

      socket.on("alert", (message) => {
        alert(message);
      });
      socket.on("update_hands", ({ hands }) => {
        state.updateHands(hands);
      });
      socket.on("update", (data) => {
        state.onUpdate(data);
      });

      socket.on("disconnect", () => {
        state.onDisconnect();
      });
    });
    return () => {
      controller.abort();
      console.log("Tearing down socket " + (socket != null));
      if (socket) {
        socket.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isConnected = state.socketId !== "";
  useEffect(() => {
    if (socket && isConnected && roomId && name) {
      state.board = null;
      socket.emit("join_room", { roomId, name });
      return;
    }
  }, [socket, roomId, name, isConnected]);

  const actions = useMemo(
    () => ({
      executeMove: (move: Move) => socket?.emit("move", move),
      onAddAI: () => socket?.emit("add_ai"),
      onRemoveAI: () => socket?.emit("remove_ai"),
      onStart: () => socket?.emit("start_game"),
      onRestart: () => socket?.emit("restart_game"),
      onRotate: () => socket?.emit("rotate_decks"),
      onUpdateHand: (card: CardState) => {
        console.log("Updating hand", card);
        socket?.emit("update_hand", { location: card ?? null });
      },
      onUpdateGrabbedItem: (card: CardState | null) => {
        console.log("Updating hand item", card);
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
  };
}
