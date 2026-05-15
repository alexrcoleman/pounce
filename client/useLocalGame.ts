import { useEffect, useMemo, useRef, useState } from "react";

import { GameSocket } from "./GameConnection";
import SocketState from "./SocketState";
import { useLocalObservable } from "mobx-react-lite";
import { runInAction } from "mobx";
import {
  CardState,
  addPlayer,
  removePlayer,
  rotateDecks,
} from "../shared/GameUtils";
import { Move, executeMove } from "../shared/MoveHandler";
import { createRoomState, RoomState } from "../shared/RoomState";
import {
  getRoomHands,
  resetRoom,
  scheduleAIReactionBoard,
  setRoomAILevel,
  startRoomGame,
  tickRoom,
  updateRoomHand,
} from "../shared/RoomLogic";
import deepClone from "../shared/deepClone";
import { Actions } from "./useGameSocket";

const LOCAL_SOCKET_ID = "local-player";

export default function useLocalGame(name: string | null) {
  const state = useLocalObservable(() => new SocketState());
  const roomRef = useRef<RoomState | null>(null);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const room = createRoomState(0);
    roomRef.current = room;
    let isClosed = false;
    let hasJoined = false;

    const emitUpdate = () => {
      runInAction(() => {
        state.onUpdate({ board: deepClone(room.board), time: Date.now() });
      });
      scheduleAIReactionBoard(room);
    };
    const emitHands = () => {
      runInAction(() => {
        state.updateHands(deepClone(getRoomHands(room)));
      });
    };

    const localSocket: GameSocket = {
      emit(event, ...args) {
        if (isClosed) {
          return;
        }
        if (event === "join_room") {
          const joinArgs = args[0] as { roomId: string; name: string };
          runInAction(() => state.clearBoard());
          const existingPlayer = room.board.players.find(
            (p) => p.socketId === LOCAL_SOCKET_ID
          );
          if (existingPlayer) {
            existingPlayer.name = joinArgs.name;
            existingPlayer.disconnected = false;
          } else {
            addPlayer(room.board, LOCAL_SOCKET_ID, joinArgs.name);
          }
          if (!hasJoined) {
            hasJoined = true;
            addPlayer(room.board, null);
          }
          emitUpdate();
          emitHands();
          return;
        }

        const playerIndex = room.board.players.findIndex(
          (p) => p.socketId === LOCAL_SOCKET_ID
        );
        if (event === "move") {
          executeMove(room.board, playerIndex, args[0] as Move);
          emitUpdate();
        } else if (event === "add_ai") {
          addPlayer(room.board, null);
          emitUpdate();
        } else if (event === "remove_ai") {
          const aiIndex = room.board.players.findIndex((p) => p.socketId == null);
          if (aiIndex >= 0) {
            removePlayer(room.board, aiIndex);
            emitUpdate();
          }
        } else if (event === "start_game") {
          startRoomGame(room);
          emitUpdate();
          emitHands();
        } else if (event === "rotate_decks") {
          rotateDecks(room.board);
          emitUpdate();
        } else if (event === "restart_game") {
          resetRoom(room);
          emitUpdate();
          emitHands();
        } else if (event === "set_ai_level") {
          const setAIArgs = args[0] as { speed: number };
          setRoomAILevel(room, setAIArgs.speed);
          emitUpdate();
        } else if (event === "update_hand") {
          updateRoomHand(
            room,
            playerIndex,
            args[0] as { item?: CardState | null; location?: CardState }
          );
          emitHands();
        }
      },
      close() {
        isClosed = true;
      },
    };

    runInAction(() => state.onConnect(LOCAL_SOCKET_ID));
    setSocket(localSocket);
    setIsConnected(true);
    if (name) {
      localSocket.emit("join_room", { roomId: "offline", name });
    }
    const interval = window.setInterval(() => {
      const { hasUpdate, hasHandUpdate } = tickRoom(room);
      if (hasUpdate) {
        emitUpdate();
      }
      if (hasHandUpdate) {
        emitHands();
      }
    }, 16);

    return () => {
      isClosed = true;
      window.clearInterval(interval);
      runInAction(() => state.onDisconnect());
      roomRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (socket && isConnected && name) {
      socket.emit("join_room", { roomId: "offline", name });
    }
  }, [socket, name, isConnected]);

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
    error: null,
    isConnected,
    actions,
    state,
    socket,
  };
}
