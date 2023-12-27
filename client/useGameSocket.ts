import { BoardState, CardState, CursorState } from "../shared/GameUtils";
import { Socket, io } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Move } from "../shared/MoveHandler";
import {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../shared/SocketTypes";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export default function useGameSocket(
  roomId: string | null,
  name: string | null
) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [latency, setLatency] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [socketId, setSocketId] = useState("");
  const [socket, setSocket] = useState<ClientSocket | null>(null);
  const [hands, setHands] = useState<CursorState[]>([]);
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
        setSocketId(socket.id);
      });

      socket.on("alert", (message) => {
        alert(message);
      });
      socket.on("update_hands", ({ hands }) => {
        console.log("Receieved hand");
        setHands(hands);
      });
      socket.on("update", (data) => {
        console.log("Recieved update");
        setBoard(data.board);
        setLatency(Date.now() - data.time);
        setLastTime(data.time);
      });

      socket.on("disconnect", () => {
        console.log("Disconnected from server");
        setSocketId("");
        setBoard(null);
        // Try to reconnect maybe
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
  const isConnected = socketId !== "";
  useEffect(() => {
    if (socket && isConnected && roomId && name) {
      console.log("Joining room via effect, roomId/name changed");
      setBoard(null);
      socket.emit("join_room", { roomId, name });
      return;
    }
  }, [socket, roomId, name, isConnected]);
  const executeMove = useCallback(
    (move: Move) => {
      socket?.emit("move", move);
    },
    [socket]
  );
  const onAddAI = useCallback(() => {
    socket?.emit("add_ai");
  }, [socket]);
  const onRemoveAI = useCallback(() => {
    socket?.emit("remove_ai");
  }, [socket]);
  const onStart = useCallback(() => {
    socket?.emit("start_game");
  }, [socket]);
  const onRestart = useCallback(() => {
    socket?.emit("restart_game");
  }, [socket]);
  const onRotate = useCallback(() => {
    socket?.emit("rotate_decks");
  }, [socket]);
  const sendHand = useCallback(
    (card: CardState) => {
      socket?.emit("update_hand", { location: card ?? null });
    },
    [socket]
  );
  const onUpdateGrabbedItem = useCallback(
    (card: CardState | null) => {
      socket?.emit("update_hand", { item: card ?? null });
    },
    [socket]
  );
  const setAILevel = useCallback((level: number) => {
    socket?.emit("set_ai_level", { speed: level });
  }, []);
  return {
    onRemoveAI,
    onAddAI,
    onStart,
    onRestart,
    executeMove,
    onRotate,
    onUpdateHand: sendHand,
    onUpdateGrabbedItem,
    socketId,
    isConnected,
    setAILevel,
    board,
    hands,
  };
}
