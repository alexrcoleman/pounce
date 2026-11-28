import { useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_AI_LEVEL } from "../shared/AIDifficulty";
import { GameSocket } from "./GameConnection";
import type { LanPeer } from "./lanPeer";
import { parseLanGuestMessage, parseLanHostMessage, type LanGuestMessage, type LanHostMessage } from "./lanGameMessages";
import { isAllowedReactionId } from "../shared/Reactions";
import SocketState from "./SocketState";
import { useLocalObservable } from "mobx-react-lite";
import { runInAction } from "mobx";
import {
  CardState,
  CursorLocation,
  addPlayer,
  removePlayer,
} from "../shared/GameUtils";
import {
  Move,
  executeMove,
  getMovePileLocsDelta,
  isBoardAcceptingMoves,
  isProductiveMove,
  resolveMoveForBoard,
} from "../shared/MoveHandler";
import { createRoomState, RoomState } from "../shared/RoomState";
import {
  clearRoomStuckPlayers,
  completeRoundAnalysis,
  completeRoundStartCountdown,
  dealRemainingRoomPlayers,
  dealRoomHands,
  getRoomHandDelta,
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
  rotateRoomDecks,
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
const LAN_GUEST_ID = "lan-guest";
const LOCAL_PLAYER_SESSION_ID = "local-player-session";
const DEFAULT_OFFLINE_AI_COUNT = 2;
const LOCAL_GAME_TICK_DELAY_MS = 16;
const LOCAL_SIMULATION_TICK_DELAY_MS = 0;

export default function useLocalGame(name: string | null, peer?: LanPeer) {
  const state = useLocalObservable(() => new SocketState());
  const logStatsigEvent = useStatsigLogger();
  const roomRef = useRef<RoomState | null>(null);
  const optimisticallyPlayedMoveActionIds = useRef<Set<string>>(new Set());
  const hasLoggedOfflineJoinRef = useRef(false);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (peer?.role === "guest") {
      const guest = connectLanGuest(peer, name || "Player", state, optimisticallyPlayedMoveActionIds.current);
      setSocket(guest);
      setIsConnected(true);
      return () => {
        guest.close();
        state.onDisconnect();
        optimisticallyPlayedMoveActionIds.current.clear();
      };
    }
    const send = (message: LanHostMessage) => peer?.send(message);
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
      const update = {
        board: deepClone(room.board),
        settings: deepClone(room.settings),
        stuckPlayerIndices: getRoomStuckPlayerIndices(room),
        time,
        revision: room.revision,
        roundAnalysis: deepClone(room.lastRoundAnalysis),
      };
      state.onUpdate(update);
      send({ kind: "board", update });
      if (!peer && hadBoard && !wasRoundActive && room.board.isActive) {
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
      const hands = deepClone(getRoomHands(room));
      const versions = room.handUpdateVersions.slice();
      state.updateHands(hands, versions);
      send({ kind: "hands", hands, versions });
    };
    const emitHandDelta = (playerIndex: number) => {
      const delta = getRoomHandDelta(room, playerIndex);
      if (!delta) {
        return;
      }

      state.updateHandDelta(deepClone(delta));
      send({ kind: "hand", delta });
    };
    const emitHandDeltas = (playerIndices: readonly number[]) => {
      playerIndices.forEach(emitHandDelta);
    };
    const emitRoomToast = (roomToast: RoomToast) => {
      showRoomToast(roomToast);
      send({ kind: "toast", toast: roomToast });
    };
    const emitRoomAction = (action: PendingRoomAction) => {
      const roomAction: RoomAction = { ...action, revision: room.revision };
      const applyResult = state.onRoomAction(roomAction);
      send({ kind: "action", action: roomAction });
      if (applyResult === "needs_sync") {
        emitUpdate(action.time);
        emitHands();
      }

      if (!optimisticallyPlayedMoveActionIds.current.delete(action.actionId)) {
        playRoomActionSound(roomAction, {
          activePlayerIndex: state.getActivePlayerIndex(),
        });
      }
      scheduleAIReactionBoard(room);
    };
    const emitRoomActions = (actions: readonly PendingRoomAction[]) => {
      actions.forEach((action) => {
        markRoomUpdated();
        emitRoomAction(action);
      });
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
        handUpdatePlayerIndices,
        actions,
        roomToast,
      }: {
        hasUpdate: boolean;
        hasHandUpdate: boolean;
        handUpdatePlayerIndices: readonly number[];
        actions: readonly PendingRoomAction[];
        roomToast?: RoomToast | null;
      }
    ) => {
      if (!hasUpdate && actions.length === 0 && !hasHandUpdate && !roomToast) {
        return;
      }

      if (hasUpdate) {
        room.revision += 1;
        pendingSimulationHasUpdate = true;
        pendingSimulationUpdateTime = now;
      } else if (actions.length > 0) {
        emitRoomActions(actions);
      }
      if (hasHandUpdate) {
        pendingSimulationHasHandUpdate = true;
      } else if (handUpdatePlayerIndices.length > 0) {
        emitHandDeltas(handUpdatePlayerIndices);
      }
      if (roomToast) {
        pendingSimulationRoomToast = roomToast;
      }
      if (hasUpdate || hasHandUpdate || roomToast) {
        scheduleSimulationUpdateFlush();
      }
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
          emitHandDelta(playerIndex);
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

    let nextReactionNumber = 0;
    const createLocalSocket = (socketId: string): GameSocket => ({
      emit(event, ...args) {
        if (isClosed) {
          return;
        }
        if (event === "join_room") {
          const joinArgs = args[0] as { roomId: string; name: string };
          if (!peer) state.clearBoard();
          const sessionId = socketId === LAN_GUEST_ID ? LAN_GUEST_ID : LOCAL_PLAYER_SESSION_ID;
          const existingPlayer = room.board.players.find((p) => p.socketId === socketId);
          if (existingPlayer) {
            existingPlayer.name = joinArgs.name;
            existingPlayer.playerSessionId = sessionId;
            existingPlayer.disconnected = false;
            existingPlayer.disconnectedAt = undefined;
          } else {
            addPlayer(room.board, socketId, joinArgs.name, sessionId);
          }
          if (!peer && !hasJoined) {
            hasJoined = true;
            for (let i = 0; i < DEFAULT_OFFLINE_AI_COUNT; i++) {
              addPlayer(room.board, null);
            }
          }
          markRoomUpdated();
          emitUpdate();
          emitHands();
          if (!peer && !hasLoggedOfflineJoinRef.current) {
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
          (p) => p.socketId === socketId
        );
        if (playerIndex < 0) return;
        if (event === "move") {
          const envelope = args[0] as ActionEnvelope<Move>;
          const ack = args[1] as ((args: ActionAck) => void) | undefined;
          const didCompleteCountdown = completeRoundStartCountdown(room);
          const actionMove = resolveMoveForBoard(
            room.board,
            playerIndex,
            envelope.payload
          );
          const result = executeMove(room.board, playerIndex, actionMove);
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
            actionMove
          );
          if (result.boardChanged && isProductiveMove(actionMove)) {
            clearRoomStuckPlayers(room);
          }
          const didReleaseHand = releaseRoomHandAfterCenterPlay(
            room,
            playerIndex,
            actionMove,
            result.clearCursorLocation
          );
          const didResetHand =
            didReleaseHand ||
            resetRoomHandAfterDeckAdvance(room, playerIndex, actionMove);
          const handUpdateVersion = didReleaseHand
            ? getRoomHandUpdateVersion(room, playerIndex)
            : null;
          markRoomUpdated();
          ack?.({
            actionId: envelope.actionId,
            ok: true,
            revision: room.revision,
          });
          if (didCompleteCountdown) {
            emitUpdate();
          }
          emitRoomAction({
            type: "move",
            actionId: envelope.actionId,
            playerIndex,
            move: actionMove,
            pileLocs: getMovePileLocsDelta(room.board, actionMove),
            time: acceptedAt,
          });
          if (didResetHand) {
            emitHandDelta(playerIndex);
          }
          if (handUpdateVersion != null) {
            schedulePlayerCenterCursorReset(
              playerIndex,
              actionMove,
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
          rotateRoomDecks(room);
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
          const setAIArgs = args[0] as { speed?: number } | undefined;
          const wasSimulationMode = room.settings.simulationMode;
          setRoomAILevel(
            room,
            typeof setAIArgs?.speed === "number"
              ? setAIArgs.speed
              : DEFAULT_AI_LEVEL
          );
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
        } else if (event === "send_reaction" && peer) {
          const reactionId = (args[0] as { reactionId: unknown }).reactionId;
          if (!isAllowedReactionId(reactionId)) return;
          const player = room.board.players[playerIndex];
          const sentAt = Date.now();
          const reaction = {
            eventId: socketId + ":" + ++nextReactionNumber,
            reactionId,
            playerIndex,
            playerName: player.name,
            playerColor: player.color,
            sentAt,
          };
          state.addReaction(reaction);
          send({ kind: "reaction", reaction });
        } else if (event === "update_hand") {
          if (updateRoomHand(
            room,
            playerIndex,
            args[0] as {
              item?: CardState | null;
              items?: CardState[] | null;
              location?: CursorLocation | null;
            }
          )) {
            emitHandDelta(playerIndex);
          }
        }
      },
      close() {
        isClosed = true;
      },
    });
    const localSocket = createLocalSocket(LOCAL_SOCKET_ID);

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
    const guestSocket = createLocalSocket(LAN_GUEST_ID);
    let guestJoined = false;
    let lastGuestMove = 0;
    const unsubscribe = peer?.subscribe((raw) => {
      const message = parseLanGuestMessage(raw);
      if (!message || isClosed) return;
      if (message.kind === "join" && !guestJoined) {
        guestJoined = true;
        guestSocket.emit("join_room", { roomId: "lan", name: message.name, playerSessionId: LAN_GUEST_ID });
      }
      if (!guestJoined) return;
      switch (message.kind) {
        case "move": {
          const sequence = Number(message.action.actionId.split(":")[1]);
          if (sequence <= lastGuestMove) return;
          lastGuestMove = sequence;
          guestSocket.emit("move", message.action, (ack) => send({ kind: "ack", ack }));
          break;
        }
        case "hand": guestSocket.emit("update_hand", message.hand); break;
        case "ready": guestSocket.emit("set_round_ready", { ready: message.ready }); break;
        case "stuck": guestSocket.emit("set_stuck", { stuck: message.stuck }); break;
        case "reaction": guestSocket.emit("send_reaction", { reactionId: message.reaction }); break;
        case "sync":
          emitUpdate();
          emitHands();
          break;
        case "ping": send({ kind: "pong", time: message.time }); break;
        case "pong": state.setPingLatency(Date.now() - message.time); break;
      }
    });
    const pingInterval = peer ? window.setInterval(() => {
      if (guestJoined) send({ kind: "ping", time: Date.now() });
    }, 2500) : undefined;
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
        handUpdatePlayerIndices,
        actions,
        roomToast,
        roundAnalysisSnapshots,
      } = tickRoom(room, tickTiming.now);
      if (room.settings.simulationMode) {
        queueSimulationTickUpdate(tickTiming.now, {
          hasUpdate,
          hasHandUpdate,
          handUpdatePlayerIndices,
          actions,
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
      } else if (actions.length > 0) {
        emitRoomActions(actions);
      }
      if (hasHandUpdate && hasUpdate) {
        emitHands();
      } else if (handUpdatePlayerIndices.length > 0) {
        emitHandDeltas(handUpdatePlayerIndices);
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
      unsubscribe?.();
      window.clearInterval(pingInterval);
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
  }, [peer]);

  useEffect(() => {
    if (!peer && socket && isConnected && name) {
      socket.emit("join_room", {
        roomId: "offline",
        name,
        playerSessionId: LOCAL_PLAYER_SESSION_ID,
      });
    }
  }, [socket, name, isConnected, peer]);

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

function connectLanGuest(
  peer: LanPeer,
  name: string,
  state: SocketState,
  optimisticSounds: Set<string>
): GameSocket {
  const pending = new Map<string, { callback: (ack: ActionAck) => void; timer: number }>();
  const send = (message: LanGuestMessage) => peer.send(message);
  state.onConnect(LAN_GUEST_ID);
  state.setPlayerSessionId(LAN_GUEST_ID);
  const unsubscribe = peer.subscribe((raw) => {
    const message = parseLanHostMessage(raw);
    if (!message) return;
    switch (message.kind) {
      case "board": state.onUpdate(message.update); break;
      case "action": {
        const result = state.onRoomAction(message.action);
        if (result === "needs_sync") send({ kind: "sync" });
        const playedOptimisticSound = optimisticSounds.delete(message.action.actionId);
        if (result === "applied" && !playedOptimisticSound) {
          playRoomActionSound(message.action, { activePlayerIndex: state.getActivePlayerIndex() });
        }
        break;
      }
      case "ack": {
        const entry = pending.get(message.ack.actionId);
        if (entry) {
          pending.delete(message.ack.actionId);
          window.clearTimeout(entry.timer);
          entry.callback(message.ack);
        }
        break;
      }
      case "hands": state.updateHands(message.hands, message.versions); break;
      case "hand": state.updateHandDelta(message.delta); break;
      case "toast": showRoomToast(message.toast); break;
      case "reaction": state.addReaction(message.reaction); break;
      case "ping": send({ kind: "pong", time: message.time }); break;
      case "pong": state.setPingLatency(Date.now() - message.time); break;
    }
  });
  send({ kind: "join", name });
  const ping = () => send({ kind: "ping", time: Date.now() });
  ping();
  const interval = window.setInterval(ping, 2500);
  return {
    emit(event, ...args) {
      switch (event) {
        case "move": {
          const action = args[0] as ActionEnvelope<Move>;
          const callback = args[1] as ((ack: ActionAck) => void) | undefined;
          const reject = () => callback?.({
            actionId: action.actionId, revision: state.serverRevision, ok: false,
            reason: "Waiting for the LAN host. Try again.",
          });
          if (!send({ kind: "move", action })) {
            reject();
          } else if (callback) {
            const timer = window.setTimeout(() => {
              pending.delete(action.actionId);
              reject();
              send({ kind: "sync" });
            }, 5000);
            pending.set(action.actionId, { callback, timer });
          }
          break;
        }
        case "update_hand":
          send({ kind: "hand", hand: args[0] as Extract<LanGuestMessage, { kind: "hand" }>["hand"] });
          break;
        case "set_round_ready":
          send({ kind: "ready", ready: (args[0] as { ready: boolean }).ready });
          break;
        case "set_stuck":
          send({ kind: "stuck", stuck: (args[0] as { stuck: boolean }).stuck });
          break;
        case "send_reaction": {
          const reaction = (args[0] as { reactionId: unknown }).reactionId;
          if (isAllowedReactionId(reaction)) send({ kind: "reaction", reaction });
          break;
        }
        case "request_update": send({ kind: "sync" }); break;
      }
    },
    close() {
      window.clearInterval(interval);
      unsubscribe();
      pending.forEach(({ timer }) => window.clearTimeout(timer));
      pending.clear();
    },
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
