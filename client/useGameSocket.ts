import { BoardState, CardState } from "../shared/GameUtils";
import { Socket, io } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { Move } from "../shared/PlayerUtils";

export default function useGameSocket(
  roomId: string | null,
  name: string | null
) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [isConnected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [latency, setLatency] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [socketId, setSocketId] = useState("");
  const [hands, setHands] = useState<{ location: CardState | null }[]>([]);
  useEffect(() => {
    fetch("/api/socketio").finally(() => {
      const socket = (socketRef.current = io());
      (global as any).socketio = socket;
      socket.on("connect", () => {
        setSocketId(socket.id);
        setConnected(true);
        if (roomId && name) {
          socket.emit("join_room", { roomId, name });
          return;
        }
      });

      socket.on("alert", (message) => {
        alert(message);
      });
      socket.on("update_hands", ({ hands }) => {
        setHands(hands);
      });
      socket.on("update", (data) => {
        setBoard(data.board);
        setLatency(Date.now() - data.time);
        setLastTime(data.time);
      });

      socket.on("disconnect", () => {
        setConnected(false);
        setBoard(null);
        // Try to reconnect maybe
      });
    });
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);
  useEffect(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.emit("join_room", { roomId, name });
      return;
    }
  }, [roomId]);
  const executeMove = useCallback(
    (move: Move) => {
      socketRef.current?.emit("move", move);
    },
    [socketRef]
  );
  const onAddAI = useCallback(() => {
    socketRef.current?.emit("add_ai");
  }, [socketRef]);
  const onRemoveAI = useCallback(() => {
    socketRef.current?.emit("remove_ai");
  }, [socketRef]);
  const onStart = useCallback(() => {
    socketRef.current?.emit("start_game");
  }, [socketRef]);
  const onRestart = useCallback(() => {
    socketRef.current?.emit("restart_game");
  }, [socketRef]);
  const onRotate = useCallback(() => {
    socketRef.current?.emit("rotate_decks");
  }, [socketRef]);
  const sendHand = useCallback(
    (card: CardState) => {
      socketRef.current?.emit("update_hand", { location: card });
    },
    [socketRef]
  );
  return {
    onRemoveAI,
    onAddAI,
    onStart,
    onRestart,
    executeMove,
    onRotate,
    onUpdateHand: sendHand,
    socketId,
    isConnected,
    board,
    hands,
  };
}
