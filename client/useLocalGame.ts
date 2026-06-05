import { useEffect, useMemo, useRef, useState } from "react";

import { GameSocket } from "./GameConnection";
import SocketState from "./SocketState";
import { useLocalObservable } from "mobx-react-lite";
import { runInAction } from "mobx";
import {
  CardState,
  CursorLocation,
  addPlayer,
  removePlayer,
  rotateDecks,
} from "../shared/GameUtils";
import {
  Move,
  executeMove,
  isBoardAcceptingMoves,
  isProductiveMove,
} from "../shared/MoveHandler";
import { createRoomState, RoomState } from "../shared/RoomState";
import {
  clearRoomStuckPlayers,
  completeRoundAnalysis,
  completeRoundStartCountdown,
  dealRemainingRoomPlayers,
  dealRoomHands,
  getRoomHandUpdateVersion,
  getRoomHands,
  getRoomStuckPlayerIndices,
  PLAYER_CENTER_CURSOR_RESET_DELAY_MS,
  getNextRoomSimulationTickTime,
  recordRoundSnapshot,
  realignRoomAICooldowns,
  releaseRoomHandAfterCenterPlay,
  resetRoomHandAfterDeckAdvance,
  resetRoomHandAfterCenterPlay,
  resetRoom,
  scheduleAIReactionBoard,
  setRoomPlayerStuck,
  setRoomFairHandMode,
  setRoomFairHandRotation,
  setRoomAILevel,
  setRoomAIMode,
  setRoomPaused,
  setPlayerReadyForRound,
  shouldFastForwardRoomSimulation,
  startRoomGame,
  tickRoom,
  updateRoomHand,
} from "../shared/RoomLogic";
import deepClone from "../shared/deepClone";
import { Actions } from "./useGameSocket";
import {
  type ActionAck,
  type ActionEnvelope,
  type PendingRoomAction,
  type RoomAction,
} from "../shared/SocketTypes";
import { toastRejectedMove } from "./moveRejectionToast";
import type { RoundSnapshot } from "../shared/RoundAnalysis";
import {
  createDeckRotationToast,
  type RoomToast,
} from "../shared/RoomToast";
import { showRoomToast } from "./RoomToast";
import { playRoomActionSound } from "./soundEffects";
import {
  getRoomAnalyticsMetadata,
  takePendingRoomEntry,
  useStatsigLogger,
} from "./analytics";

const LOCAL_SOCKET_ID = "local-player";
const LOCAL_PLAYER_SESSION_ID = "local-player-session";
const DEFAULT_OFFLINE_AI_COUNT = 2;
const LOCAL_GAME_TICK_DELAY_MS = 16;
const LOCAL_SIMULATION_TICK_DELAY_MS = 0;

export default function useLocalGame(name: string | null) {
  const state = useLocalObservable(() => new SocketState());
  const logStatsigEvent = useStatsigLogger();
  const roomRef = useRef<RoomState | null>(null);
  const optimisticallyPlayedMoveActionIds = useRef<Set<string>>(new Set());
  const hasLoggedOfflineJoinRef = useRef(false);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const room = createRoomState(0);
    roomRef.current = room;
    let isClosed = false;
    let hasJoined = false;
    let simulatedNow = Date.now();
    const centerCursorResetTimeouts = new Set<number>();
    let simulationFlushTimeout: number | null = null;
    let pendingSimulationHasUpdate = false;
    let pendingSimulationHasHandUpdate = false;
    let pendingSimulationUpdateTime = simulatedNow;
    let pendingSimulationRoomToast: RoomToast | null = null;

    const emitUpdate = (time = Date.now()) => {
      const hadBoard = state.board != null;
      const wasRoundActive = state.board?.isActive === true;
      runInAction(() => {
        state.onUpdate({
          board: deepClone(room.board),
          settings: deepClone(room.settings),
          stuckPlayerIndices: getRoomStuckPlayerIndices(room),
          time,
          revision: room.revision,
          roundAnalysis: deepClone(room.lastRoundAnalysis),
        });
      });
      if (hadBoard && !wasRoundActive && room.board.isActive) {
        logStatsigEvent(
          "round_started",
          getRoomAnalyticsMetadata("offline", room.board, {
            round_starts_at: room.board.roundStartsAt ?? null,
          })
        );
      }
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
    const emitRoomToast = (roomToast: RoomToast) => {
      showRoomToast(roomToast);
    };
    const emitRoomAction = (action: PendingRoomAction) => {
      if (optimisticallyPlayedMoveActionIds.current.delete(action.actionId)) {
        return;
      }

      playRoomActionSound(
        { ...action, revision: room.revision },
        { activePlayerIndex: state.getActivePlayerIndex() }
      );
    };
    const emitRoomActions = (actions: readonly PendingRoomAction[]) => {
      actions.forEach(emitRoomAction);
    };
    const clearPendingSimulationUpdate = () => {
      pendingSimulationHasUpdate = false;
      pendingSimulationHasHandUpdate = false;
      pendingSimulationRoomToast = null;
      if (simulationFlushTimeout != null) {
        window.clearTimeout(simulationFlushTimeout);
        simulationFlushTimeout = null;
      }
    };
    const flushPendingSimulationUpdate = () => {
      simulationFlushTimeout = null;
      if (isClosed) {
        clearPendingSimulationUpdate();
        return;
      }

      const shouldEmitUpdate = pendingSimulationHasUpdate;
      const shouldEmitHands = pendingSimulationHasHandUpdate;
      const roomToast = pendingSimulationRoomToast;
      const updateTime = pendingSimulationUpdateTime;
      pendingSimulationHasUpdate = false;
      pendingSimulationHasHandUpdate = false;
      pendingSimulationRoomToast = null;

      if (shouldEmitUpdate) {
        emitUpdate(updateTime);
      }
      if (shouldEmitHands) {
        emitHands();
      }
      if (roomToast) {
        emitRoomToast(roomToast);
      }
    };
    const scheduleSimulationUpdateFlush = () => {
      if (simulationFlushTimeout != null) {
        return;
      }

      simulationFlushTimeout = window.setTimeout(
        flushPendingSimulationUpdate,
        LOCAL_GAME_TICK_DELAY_MS
      );
    };
    const queueSimulationTickUpdate = (
      now: number,
      {
        hasUpdate,
        hasHandUpdate,
        roomToast,
      }: {
        hasUpdate: boolean;
        hasHandUpdate: boolean;
        roomToast?: RoomToast | null;
      }
    ) => {
      if (!hasUpdate && !hasHandUpdate && !roomToast) {
        return;
      }

      if (hasUpdate) {
        room.revision += 1;
        pendingSimulationHasUpdate = true;
        pendingSimulationUpdateTime = now;
      }
      if (hasHandUpdate) {
        pendingSimulationHasHandUpdate = true;
      }
      if (roomToast) {
        pendingSimulationRoomToast = roomToast;
      }
      scheduleSimulationUpdateFlush();
    };
    const schedulePlayerCenterCursorReset = (
      playerIndex: number,
      move: Move,
      handUpdateVersion: number
    ) => {
      const timeout = window.setTimeout(() => {
        centerCursorResetTimeouts.delete(timeout);
        if (
          isClosed ||
          roomRef.current !== room ||
          getRoomHandUpdateVersion(room, playerIndex) !== handUpdateVersion
        ) {
          return;
        }

        if (resetRoomHandAfterCenterPlay(room, playerIndex, move)) {
          emitHands();
        }
      }, PLAYER_CENTER_CURSOR_RESET_DELAY_MS);
      centerCursorResetTimeouts.add(timeout);
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
          if (!hasLoggedOfflineJoinRef.current) {
            const entry = takePendingRoomEntry("offline");
            const metadata = getRoomAnalyticsMetadata("offline", room.board, {
              entry_kind: entry?.kind ?? "offline",
            });
            logStatsigEvent("room_joined", metadata);
            hasLoggedOfflineJoinRef.current = true;
          }
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
          const didCompleteCountdown = completeRoundStartCountdown(room);
          const result = executeMove(room.board, playerIndex, envelope.payload);
          if (result == null) {
            if (didCompleteCountdown) {
              markRoomUpdated();
              emitUpdate();
              emitHands();
            }
            ack?.({
              actionId: envelope.actionId,
              ok: false,
              revision: room.revision,
              reason: "Move rejected",
            });
            return;
          }
          const acceptedAt = Date.now();
          recordRoundSnapshot(
            room,
            "move",
            acceptedAt,
            playerIndex,
            envelope.payload
          );
          if (result.boardChanged && isProductiveMove(envelope.payload)) {
            clearRoomStuckPlayers(room);
          }
          const didReleaseHand = releaseRoomHandAfterCenterPlay(
            room,
            playerIndex,
            envelope.payload,
            result.clearCursorLocation
          );
          const didResetHand =
            didReleaseHand ||
            resetRoomHandAfterDeckAdvance(room, playerIndex, envelope.payload);
          const handUpdateVersion = didReleaseHand
            ? getRoomHandUpdateVersion(room, playerIndex)
            : null;
          markRoomUpdated();
          ack?.({
            actionId: envelope.actionId,
            ok: true,
            revision: room.revision,
          });
          emitUpdate();
          emitRoomAction({
            type: "move",
            actionId: envelope.actionId,
            playerIndex,
            move: envelope.payload,
            time: acceptedAt,
          });
          if (didResetHand) {
            emitHands();
          }
          if (handUpdateVersion != null) {
            schedulePlayerCenterCursorReset(
              playerIndex,
              envelope.payload,
              handUpdateVersion
            );
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
        } else if (event === "set_round_ready") {
          const readyArgs = args[0] as { ready: boolean };
          const { didChange, didStart } = setPlayerReadyForRound(
            room,
            playerIndex,
            readyArgs.ready
          );
          if (didChange) {
            markRoomUpdated();
            emitUpdate();
            if (didStart) {
              emitHands();
            }
          }
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
          clearRoomStuckPlayers(room);
          recordRoundSnapshot(room, "manual_rotate", Date.now());
          markRoomUpdated();
          emitUpdate();
          emitRoomToast(createDeckRotationToast("manual"));
        } else if (event === "set_stuck") {
          const stuckArgs = args[0] as { stuck: boolean };
          const result = setRoomPlayerStuck(
            room,
            playerIndex,
            stuckArgs.stuck
          );
          if (result?.changed) {
            markRoomUpdated();
            emitUpdate();
            if (result.rotated) {
              emitRoomToast(createDeckRotationToast("consensus_stuck"));
            }
          }
        } else if (event === "restart_game") {
          resetRoom(room);
          markRoomUpdated();
          emitUpdate();
          emitHands();
        } else if (event === "set_ai_level") {
          const setAIArgs = args[0] as { speed: number };
          const wasSimulationMode = room.settings.simulationMode;
          setRoomAILevel(room, setAIArgs.speed);
          if (wasSimulationMode && !room.settings.simulationMode) {
            clearPendingSimulationUpdate();
            simulatedNow = Date.now();
            realignRoomAICooldowns(room, simulatedNow);
          }
          markRoomUpdated();
          emitUpdate();
        } else if (event === "set_fair_hand_mode") {
          const setFairHandModeArgs = args[0] as { mode: string };
          if (setRoomFairHandMode(room, setFairHandModeArgs.mode)) {
            markRoomUpdated();
            emitUpdate();
          }
        } else if (event === "set_ai_mode") {
          const setAIArgs = args[0] as { mode: unknown };
          if (setRoomAIMode(room, setAIArgs.mode)) {
            markRoomUpdated();
            emitUpdate();
          }
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
            args[0] as {
              item?: CardState | null;
              items?: CardState[] | null;
              location?: CursorLocation | null;
            }
          );
          emitHands();
        }
      },
      close() {
        isClosed = true;
      },
    };

    runInAction(() => {
      state.setPlayerSessionId(LOCAL_PLAYER_SESSION_ID);
      state.onConnect(LOCAL_SOCKET_ID);
    });
    setSocket(localSocket);
    setIsConnected(true);
    if (name) {
      localSocket.emit("join_room", {
        roomId: "offline",
        name,
        playerSessionId: LOCAL_PLAYER_SESSION_ID,
      });
    }
    let tickTimeout: number | null = null;

    const runRoomTick = () => {
      if (isClosed) {
        return;
      }

      const tickTiming = getLocalGameTickTiming(room, simulatedNow);
      simulatedNow = tickTiming.now;
      const {
        hasUpdate,
        hasHandUpdate,
        actions,
        roomToast,
        roundAnalysisSnapshots,
      } = tickRoom(room, tickTiming.now);
      if (room.settings.simulationMode) {
        queueSimulationTickUpdate(tickTiming.now, {
          hasUpdate,
          hasHandUpdate,
          roomToast,
        });
        if (roundAnalysisSnapshots) {
          scheduleRoundAnalysis(roundAnalysisSnapshots);
        }
        tickTimeout = window.setTimeout(runRoomTick, tickTiming.delayMs);
        return;
      }

      if (hasUpdate) {
        room.revision += 1;
        emitUpdate(tickTiming.now);
      }
      if (actions.length > 0) {
        emitRoomActions(actions);
      }
      if (hasHandUpdate) {
        emitHands();
      }
      if (roomToast) {
        emitRoomToast(roomToast);
      }
      if (roundAnalysisSnapshots) {
        scheduleRoundAnalysis(roundAnalysisSnapshots);
      }

      tickTimeout = window.setTimeout(runRoomTick, tickTiming.delayMs);
    };

    tickTimeout = window.setTimeout(runRoomTick, 0);

    return () => {
      isClosed = true;
      if (tickTimeout != null) {
        window.clearTimeout(tickTimeout);
      }
      clearPendingSimulationUpdate();
      centerCursorResetTimeouts.forEach((timeout) =>
        window.clearTimeout(timeout)
      );
      centerCursorResetTimeouts.clear();
      optimisticallyPlayedMoveActionIds.current.clear();
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
        const playerIndex = state.getActivePlayerIndex();
        const player = state.board?.players[playerIndex];
        if (
          !socket ||
          !state.board ||
          playerIndex < 0 ||
          player?.isSpectating === true ||
          !isBoardAcceptingMoves(state.board, state.getEstimatedServerTime())
        ) {
          return;
        }
        const action = state.createOptimisticMove(move);
        playOptimisticMoveSound(
          action,
          playerIndex,
          state.serverRevision,
          optimisticallyPlayedMoveActionIds.current
        );
        socket.emit("move", action, (ack) => {
          if (!ack.ok) {
            optimisticallyPlayedMoveActionIds.current.delete(action.actionId);
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
      onUpdateHand: (location: CursorLocation) => {
        socket?.emit("update_hand", { location: location ?? null });
      },
      onUpdateGrabbedItem: (
        card: CardState | null,
        cards: CardState[] | null = card ? [card] : null
      ) => {
        socket?.emit("update_hand", {
          item: card ?? null,
          items: cards ?? null,
        });
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

function playOptimisticMoveSound(
  action: ActionEnvelope<Move>,
  playerIndex: number,
  revision: number,
  optimisticallyPlayedMoveActionIds: Set<string>
): void {
  const roomAction: RoomAction = {
    type: "move",
    actionId: action.actionId,
    playerIndex,
    move: action.payload,
    time: Date.now(),
    revision,
  };

  optimisticallyPlayedMoveActionIds.add(action.actionId);
  playRoomActionSound(roomAction, { activePlayerIndex: playerIndex });
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

type LocalGameTickTiming = {
  now: number;
  delayMs: number;
};

function getLocalGameTickTiming(
  room: RoomState,
  previousNow: number
): LocalGameTickTiming {
  if (!shouldFastForwardRoomSimulation(room)) {
    return {
      now: Date.now(),
      delayMs: LOCAL_GAME_TICK_DELAY_MS,
    };
  }

  const nextSimulationTickTime = getNextRoomSimulationTickTime(
    room,
    previousNow
  );
  if (nextSimulationTickTime == null) {
    return {
      now: Number.isFinite(previousNow) ? previousNow : Date.now(),
      delayMs: LOCAL_GAME_TICK_DELAY_MS,
    };
  }

  return {
    now: nextSimulationTickTime,
    delayMs: LOCAL_SIMULATION_TICK_DELAY_MS,
  };
}

function normalizeAICount(count: unknown): number | null {
  const numericCount = typeof count === "number" ? count : Number(count);
  if (!Number.isFinite(numericCount)) {
    return null;
  }
  return Math.max(0, Math.min(5, Math.trunc(numericCount)));
}
