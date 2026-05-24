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
  completeRoundAnalysis,
  dealRemainingRoomPlayers,
  dealRoomHands,
  getRoomHands,
  recordRoundSnapshot,
  resetRoomHandAfterDeckAdvance,
  resetRoomHandAfterCenterPlay,
  resetRoom,
  scheduleAIReactionBoard,
  setRoomFairHandRotation,
  setRoomAILevel,
  setRoomPaused,
  startRoomGame,
  tickRoom,
  updateRoomHand,
} from "../shared/RoomLogic";
import deepClone from "../shared/deepClone";
import { Actions } from "./useGameSocket";
import { type ActionAck, type ActionEnvelope } from "../shared/SocketTypes";
import { toastRejectedMove } from "./moveRejectionToast";
import type { RoundSnapshot } from "../shared/RoundAnalysis";

const LOCAL_SOCKET_ID = "local-player";
const LOCAL_PLAYER_SESSION_ID = "local-player-session";
const DEFAULT_OFFLINE_AI_COUNT = 2;

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
        state.onUpdate({
          board: deepClone(room.board),
          settings: deepClone(room.settings),
          time: Date.now(),
          revision: room.revision,
          roundAnalysis: deepClone(room.lastRoundAnalysis),
        });
      });
      scheduleAIReactionBoard(room);
    };
    const markRoomUpdated = () => {
      room.revision += 1;
    };
    const emitHands = () => {
      runInAction(() => {
        state.updateHands(deepClone(getRoomHands(room)));
      });
    };
    const scheduleRoundAnalysis = (snapshots: RoundSnapshot[]) => {
      window.setTimeout(() => {
        if (
          isClosed ||
          roomRef.current !== room ||
          room.board.isActive ||
          room.board.pouncer == null
        ) {
          return;
        }

        try {
          if (completeRoundAnalysis(room, snapshots)) {
            markRoomUpdated();
            emitUpdate();
          }
        } catch (error) {
          console.warn("Unable to complete round analysis", error);
        }
      }, 0);
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
            existingPlayer.playerSessionId = LOCAL_PLAYER_SESSION_ID;
            existingPlayer.disconnected = false;
            existingPlayer.disconnectedAt = undefined;
          } else {
            addPlayer(
              room.board,
              LOCAL_SOCKET_ID,
              joinArgs.name,
              LOCAL_PLAYER_SESSION_ID
            );
          }
          if (!hasJoined) {
            hasJoined = true;
            for (let i = 0; i < DEFAULT_OFFLINE_AI_COUNT; i++) {
              addPlayer(room.board, null);
            }
          }
          markRoomUpdated();
          emitUpdate();
          emitHands();
          return;
        }
        if (event === "room_ping") {
          const ack = args[1] as
            | ((args: { serverTime: number }) => void)
            | undefined;
          ack?.({ serverTime: Date.now() });
          return;
        }

        const playerIndex = room.board.players.findIndex(
          (p) => p.socketId === LOCAL_SOCKET_ID
        );
        if (event === "move") {
          const envelope = args[0] as ActionEnvelope<Move>;
          const ack = args[1] as ((args: ActionAck) => void) | undefined;
          const result = executeMove(room.board, playerIndex, envelope.payload);
          if (result == null) {
            ack?.({
              actionId: envelope.actionId,
              ok: false,
              revision: room.revision,
              reason: "Move rejected",
            });
            return;
          }
          recordRoundSnapshot(room, "move", Date.now(), playerIndex, envelope.payload);
          const didResetHand =
            resetRoomHandAfterCenterPlay(room, playerIndex, envelope.payload) ||
            resetRoomHandAfterDeckAdvance(room, playerIndex, envelope.payload);
          markRoomUpdated();
          ack?.({
            actionId: envelope.actionId,
            ok: true,
            revision: room.revision,
          });
          emitUpdate();
          if (didResetHand) {
            emitHands();
          }
        } else if (event === "add_ai") {
          addPlayer(room.board, null);
          markRoomUpdated();
          emitUpdate();
        } else if (event === "remove_ai") {
          const aiIndex = room.board.players.findIndex(
            (p) => p.socketId == null
          );
          if (aiIndex >= 0) {
            removePlayer(room.board, aiIndex);
            markRoomUpdated();
            emitUpdate();
          }
        } else if (event === "set_ai_count") {
          const setAIArgs = args[0] as { count: number };
          if (setRoomAICount(room, setAIArgs.count)) {
            markRoomUpdated();
            emitUpdate();
          }
        } else if (event === "start_game") {
          startRoomGame(room);
          markRoomUpdated();
          emitUpdate();
          emitHands();
        } else if (event === "deal_hands") {
          if (dealRoomHands(room)) {
            markRoomUpdated();
            emitUpdate();
            emitHands();
          }
        } else if (event === "deal_remaining_players") {
          if (dealRemainingRoomPlayers(room)) {
            markRoomUpdated();
            emitUpdate();
            emitHands();
          }
        } else if (event === "set_paused") {
          const pauseArgs = args[0] as { paused: boolean };
          if (setRoomPaused(room, pauseArgs.paused)) {
            markRoomUpdated();
            emitUpdate();
            emitHands();
          }
        } else if (event === "rotate_decks") {
          rotateDecks(room.board);
          recordRoundSnapshot(room, "manual_rotate", Date.now());
          markRoomUpdated();
          emitUpdate();
        } else if (event === "restart_game") {
          resetRoom(room);
          markRoomUpdated();
          emitUpdate();
          emitHands();
        } else if (event === "set_ai_level") {
          const setAIArgs = args[0] as { speed: number };
          setRoomAILevel(room, setAIArgs.speed);
          markRoomUpdated();
          emitUpdate();
        } else if (event === "set_fair_hand_rotation") {
          const setFairHandRotationArgs = args[0] as { enabled: boolean };
          if (
            setRoomFairHandRotation(
              room,
              setFairHandRotationArgs.enabled
            )
          ) {
            markRoomUpdated();
            emitUpdate();
          }
        } else if (event === "update_hand") {
          updateRoomHand(
            room,
            playerIndex,
            args[0] as { item?: CardState | null; location?: CardState | null }
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
      localSocket.emit("join_room", {
        roomId: "offline",
        name,
        playerSessionId: LOCAL_PLAYER_SESSION_ID,
      });
    }
    const interval = window.setInterval(() => {
      const { hasUpdate, hasHandUpdate, roundAnalysisSnapshots } =
        tickRoom(room);
      if (hasUpdate) {
        room.revision += 1;
        emitUpdate();
      }
      if (hasHandUpdate) {
        emitHands();
      }
      if (roundAnalysisSnapshots) {
        scheduleRoundAnalysis(roundAnalysisSnapshots);
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
      socket.emit("join_room", {
        roomId: "offline",
        name,
        playerSessionId: LOCAL_PLAYER_SESSION_ID,
      });
    }
  }, [socket, name, isConnected]);

  const actions = useMemo<Actions>(
    () => ({
      executeMove: (move: Move) => {
        if (!socket) {
          return;
        }
        const action = state.createOptimisticMove(move);
        socket.emit("move", action, (ack) => {
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
    error: null,
    isConnected,
    actions,
    state,
    socket,
  };
}

function setRoomAICount(room: RoomState, count: unknown): boolean {
  if (room.board.isActive) {
    return false;
  }

  const targetCount = normalizeAICount(count);
  if (targetCount == null) {
    return false;
  }

  const currentCount = room.board.players.filter((p) => p.socketId == null)
    .length;
  if (targetCount === currentCount) {
    return false;
  }

  if (targetCount > currentCount) {
    for (let i = currentCount; i < targetCount; i++) {
      addPlayer(room.board, null);
    }
  } else {
    for (let i = currentCount; i > targetCount; i--) {
      const aiIndex = room.board.players.findIndex((p) => p.socketId == null);
      if (aiIndex < 0) {
        break;
      }
      removePlayer(room.board, aiIndex);
    }
  }
  return true;
}

function normalizeAICount(count: unknown): number | null {
  const numericCount = typeof count === "number" ? count : Number(count);
  if (!Number.isFinite(numericCount)) {
    return null;
  }
  return Math.max(0, Math.min(5, Math.trunc(numericCount)));
}
