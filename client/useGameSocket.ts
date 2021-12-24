import { Socket, io } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { BoardState } from "../shared/GameUtils";
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
  const [playerIndex, setPlayerIndex] = useState(-1);
  useEffect(() => {
    if (!roomId || !name) {
      return;
    }
    fetch("/api/socketio").finally(() => {
      const socket = (socketRef.current = io());
      (global as any).socketio = socket;
      socket.on("connect", () => {
        setConnected(true);
        socket.emit("join_room", { roomId, name });
      });

      socket.on("assign", (id) => {
        setPlayerIndex(id);
      });
      socket.on("alert", (message) => {
        alert(message);
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
  }, [roomId, name]);
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
  return {
    onRemoveAI,
    onAddAI,
    onStart,
    onRestart,
    executeMove,
    playerIndex,
    isConnected,
    board,
  };
}
