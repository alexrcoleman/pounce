import {
  CardState,
  CursorLocation,
  CursorState,
  BoardState,
  PlayerState,
  cursorLocationsEqual,
  dealPlayerHand,
  dealGameHands,
  isRoundStartPending,
  isCardCursorLocation,
  isGameOver,
  removePlayer,
  resetCenterPiles,
  resetBoard,
  ROUND_START_COUNTDOWN_MS,
  rotateDecks,
  scoreBoard,
  startGame,
} from "./GameUtils";

import {
  DEFAULT_AI_LEVEL,
  SIMULATION_AI_LEVEL,
  getAISpeedMultiplier,
  normalizeAILevel,
} from "./AIDifficulty";
import {
  normalizeAIMode,
  type AICenterRetargetPause,
  type AIPileKnowledge,
  type RoomState,
} from "./RoomState";
import {
  chooseFairHandAssignments,
  getFairHandMode,
  normalizeFairHandMode,
  type FairHandScore,
} from "./FairHands";
import {
  executeMove,
  getDistance,
  getMovePileLocsDelta,
  isProductiveMove,
  resolveMoveForBoard,
  type Move,
  type MoveResult,
} from "./MoveHandler";
import {
  FIELD_PILE_AREA_SIZE,
  getApproximateCardLocation,
  getPlayerStackLocation,
} from "./CardLocations";
import { getCurrentAIDragMove } from "./ComputerV1";
import { getConfiguredAIMove } from "./NeuralActionRankingBot";
import deepClone from "./deepClone";
import { cardEquals, peek } from "./CardUtils";
import {
  analyzeRoundSnapshots,
  type RoundSnapshot,
  type RoundSnapshotReason,
} from "./RoundAnalysis";
import {
  createDeckRotationToast,
  type RoomToast,
} from "./RoomToast";
import type { HandUpdateDelta, PendingRoomAction } from "./SocketTypes";
import {
  getStuckVoteStatus,
  getStuckVotingPlayerIndices,
} from "./StuckPlayers";
import { simulateBalancedDealScores } from "./DealSimulation";

export type RoomTickResult = {
  hasUpdate: boolean;
  hasHandUpdate: boolean;
  handUpdatePlayerIndices: number[];
  actions: PendingRoomAction[];
  roomToast?: RoomToast | null;
  roundAnalysisSnapshots?: RoundSnapshot[] | null;
};

export const DISCONNECTED_PLAYER_TIMEOUT_MS = 5 * 60 * 1000;
export const STUCK_BOARD_ROTATION_TICKS = 100;
const AI_PILE_KNOWLEDGE_MIN_DURATION_MS = 3000;
const AI_PILE_KNOWLEDGE_REACTION_MULTIPLIER = 2;
const AI_OBSOLETE_TARGET_RECONSIDER_DELAY_RATIO = 0.45;
const AI_OBSOLETE_TARGET_RECONSIDER_MIN_DELAY_MS = 120;
const AI_OBSOLETE_TARGET_RECONSIDER_MAX_DELAY_MS = 650;
const MIN_ROUND_READY_PLAYERS = 2;
const FAIREST_DEAL_SIMULATION_TRIALS = 12;
const FAIREST_DEAL_MAX_MOVES_PER_TRIAL = 1400;
export const PLAYER_CENTER_CURSOR_RESET_DELAY_MS = 1000;

export type SetRoomPlayerStuckResult = {
  changed: boolean;
  playerIndex: number;
  playerName: string;
  isStuck: boolean;
  stuckCount: number;
  stuckTotal: number;
  rotated: boolean;
};

export function tickRoom(room: RoomState, now = Date.now()): RoomTickResult {
  const { board } = room;
  const aiCooldowns = room.aiCooldowns;
  let hasUpdate = false;
  let hasHandUpdate = false;
  const actions: PendingRoomAction[] = [];
  let roomToast: RoomToast | null = null;
  let roundAnalysisSnapshots: RoundSnapshot[] | null = null;
  const handUpdateVersionsBefore = room.handUpdateVersions.slice();

  if (shouldAutoRotateDecks(board)) {
    rotateDecks(board);
    clearRoomStuckPlayers(room);
    recordRoundSnapshot(room, "auto_rotate", now);
    roomToast = createDeckRotationToast("auto_stuck_board");
    hasUpdate = true;
  }
  if (completeRoundStartCountdown(room, now)) {
    hasUpdate = true;
    hasHandUpdate = true;
  }
  if (!board.isActive || board.isPaused || isRoundStartPending(board, now)) {
    // no-op
  } else if (isGameOver(board)) {
    roundAnalysisSnapshots = takeRoundAnalysisSnapshots(room, now);
    scoreBoard(board);
    clearRoomStuckPlayers(room);
    hasUpdate = true;
    if (room.autoStart) {
      roundAnalysisSnapshots = null;
      startRoomGame(room, now);
    }
  } else {
    const shuffledPlayers = board.players
      .slice()
      .map((p, i) => [p, i] as const);
    shuffledPlayers.sort((a, b) => aiCooldowns[a[1]] - aiCooldowns[b[1]]);
    for (const [player, index] of shuffledPlayers) {
      if (aiCooldowns[index] > now || player.socketId != null) {
        continue;
      }
      const usesDelayedAIVisibility = !room.settings.simulationMode;
      const hand = (room.hands[index] = room.hands[index] ?? {});
      if (usesDelayedAIVisibility) {
        rememberAIActiveCenterPile(room, index, now);
        if (pauseObsoleteAICenterDrag(room, index)) {
          aiCooldowns[index] = now + getAIRetargetDelay(room);
          continue;
        }
      }
      const currentDragMove = getCurrentAIDragMove(board, index, hand);
      const visibleBoard = getVisibleBoard(room, index, now);
      const move =
        currentDragMove ??
        getConfiguredAIMove(
          visibleBoard,
          index,
          hand,
          room.hands,
          room.settings.aiMode
        );

      if (move && usesDelayedAIVisibility) {
        rememberAIMoveFocus(room, index, move, now);
      }
      if (
        move &&
        usesDelayedAIVisibility &&
        pauseObsoleteAICenterMove(room, index, move)
      ) {
        hasHandUpdate = true;
        aiCooldowns[index] = now + getAIRetargetDelay(room);
        continue;
      }
      const actionMove = move ? resolveMoveForBoard(board, index, move) : null;
      const moveResult = move
        ? executeMove(board, index, actionMove ?? move, hand, now)
        : null;
      const canSendMoveDelta =
        !room.settings.simulationMode &&
        move != null &&
        moveResult != null &&
        canApplyAIMoveResultAsRoomDelta(move, moveResult);
      // AI cursor movement is an intention, not a completed board move.
      if (move && moveResult != null) {
        if (canSendMoveDelta) {
          const deltaMove = actionMove ?? move;
          if (usesDelayedAIVisibility && moveResult.boardChanged) {
            rememberAIMoveFocus(room, index, deltaMove, now);
            recordRoundSnapshot(room, "move", now, index, deltaMove);
          }
          actions.push({
            type: "move",
            actionId: `ai:${room.revision}:${index}:${now}:${
              actions.length + 1
            }`,
            playerIndex: index,
            move: deltaMove,
            pileLocs: getMovePileLocsDelta(board, deltaMove),
            time: now,
          });
        } else if (moveResult.boardChanged) {
          hasUpdate = true;
        }
        if (moveResult.boardChanged && isProductiveMove(actionMove ?? move)) {
          clearRoomStuckPlayers(room);
        }
      }

      if (move && moveResult?.boardChanged && !canSendMoveDelta) {
        if (usesDelayedAIVisibility) {
          rememberAIMoveFocus(room, index, actionMove ?? move, now);
          recordRoundSnapshot(room, "move", now, index, actionMove ?? move);
        }
      }

      let cooldownDist = {
        mean: 3500 / room.aiSpeed,
        deviation: 750 / room.aiSpeed,
      };
      if (moveResult?.cursorMove) {
        const hand = room.hands[index];
        const currentPos = hand.location
          ? getApproximateCursorLocation(board, hand.location)
          : null;
        hand.location = moveResult.cursorMove;
        hand.item =
          moveResult.cursorMoveItem ??
          moveResult.cursorMoveItems?.[0] ??
          hand.item;
        hand.items =
          moveResult.cursorMoveItems ??
          (moveResult.cursorMoveItem ? [moveResult.cursorMoveItem] : undefined);
        markRoomHandUpdated(room, index);
        hasHandUpdate = true;

        let cost = 1500;
        if (currentPos) {
          const targetPos = getApproximateCursorLocation(
            board,
            moveResult.cursorMove
          );
          const distance = getDistance(targetPos, currentPos);
          cost = 750 + distance * 3;
        }
        cooldownDist = {
          mean: cost / room.aiSpeed,
          deviation: cost / 5 / room.aiSpeed,
        };
      } else if (moveResult?.clearCursor) {
        hasHandUpdate = true;
        if (actionMove?.type === "c2c") {
          resetRoomHandAfterCenterPlay(
            room,
            index,
            actionMove,
            moveResult.clearCursorLocation
          );
        } else {
          if (
            room.hands[index].item !== undefined ||
            room.hands[index].items !== undefined
          ) {
            room.hands[index].item = undefined;
            room.hands[index].items = undefined;
            markRoomHandUpdated(room, index);
          }
        }
      } else if (
        moveResult?.boardChanged &&
        actionMove &&
        resetRoomHandAfterDeckAdvance(room, index, actionMove)
      ) {
        hasHandUpdate = true;
      }
      const delay = move
        ? (Math.random() - 0.5) * 2 * cooldownDist.deviation +
          cooldownDist.mean
        : 200 / room.aiSpeed;
      aiCooldowns[index] = now + delay / room.timescale;
    }
  }

  if (removeDisconnectedPlayers(room, now, DISCONNECTED_PLAYER_TIMEOUT_MS)) {
    hasUpdate = true;
    hasHandUpdate = true;
  }

  return {
    hasUpdate,
    hasHandUpdate,
    handUpdatePlayerIndices: getChangedRoomHandPlayerIndices(
      room,
      handUpdateVersionsBefore
    ),
    actions,
    roomToast,
    roundAnalysisSnapshots,
  };
}

export function shouldFastForwardRoomSimulation(room: RoomState): boolean {
  return (
    room.settings.simulationMode === true &&
    room.board.isActive &&
    !room.board.isPaused
  );
}

export function getNextRoomSimulationTickTime(
  room: RoomState,
  previousNow: number
): number | null {
  const currentNow = Number.isFinite(previousNow) ? previousNow : Date.now();
  const startsAt = room.board.roundStartsAt;
  if (startsAt != null && currentNow < startsAt) {
    return startsAt;
  }
  if (startsAt != null || isGameOver(room.board)) {
    return currentNow;
  }

  const nextAICooldown = getNextRoomAICooldown(room);
  return nextAICooldown == null
    ? null
    : Math.max(currentNow, nextAICooldown);
}

export function realignRoomAICooldowns(
  room: RoomState,
  now = Date.now()
): void {
  for (let index = 0; index < room.aiCooldowns.length; index++) {
    const cooldown = room.aiCooldowns[index];
    if (Number.isFinite(cooldown) && cooldown > now) {
      room.aiCooldowns[index] = now + Math.random();
    }
  }
}

function getNextRoomAICooldown(room: RoomState): number | null {
  let nextCooldown: number | null = null;
  for (let index = 0; index < room.board.players.length; index++) {
    if (room.board.players[index].socketId != null) {
      continue;
    }

    const cooldown = room.aiCooldowns[index];
    if (!Number.isFinite(cooldown)) {
      continue;
    }

    if (nextCooldown == null || cooldown < nextCooldown) {
      nextCooldown = cooldown;
    }
  }
  return nextCooldown;
}

function shouldAutoRotateDecks(board: BoardState): boolean {
  // This is a move-count heuristic, not an exhaustive search for unblocking moves.
  return (
    board.isActive &&
    !board.isPaused &&
    board.ticksSinceMove >= STUCK_BOARD_ROTATION_TICKS
  );
}

function canApplyAIMoveResultAsRoomDelta(
  move: Move,
  moveResult: MoveResult
): boolean {
  return moveResult.boardChanged === true || move.type === "wait";
}

function getVisibleBoard(
  room: RoomState,
  playerIndex: number,
  now = Date.now()
) {
  const realBoard = room.board;
  if (room.settings.simulationMode) {
    return realBoard;
  }

  const visibleBoard = deepClone(room.aiBoard);
  const player = realBoard.players[playerIndex];
  visibleBoard.players[playerIndex] = player;
  const pileKnowledge = getAIPileKnowledge(room, playerIndex);

  const pounceCard = peek(player.pounceDeck);
  const nonEmptyPileCount = realBoard.piles.filter((p) => p.length > 1).length;
  realBoard.piles.forEach((p, i) => {
    const topCard = peek(p);
    const canPounceCardPlay =
      pounceCard &&
      topCard &&
      pounceCard.suit === topCard.suit &&
      topCard.value < pounceCard.value &&
      topCard.value >= pounceCard.value - 3;
    if (
      peek(p)?.player === playerIndex ||
      p.length <= 1 ||
      nonEmptyPileCount < 4 ||
      canPounceCardPlay
    ) {
      visibleBoard.piles[i] = p;
    } else {
      visibleBoard.piles[i] = applyAIPileKnowledge(
        visibleBoard.piles[i],
        pileKnowledge[i],
        now
      );
    }
  });

  return visibleBoard;
}

function getApproximateCursorLocation(
  board: BoardState,
  location: CursorLocation
): [number, number] {
  if (isCardCursorLocation(location)) {
    return getApproximateCardLocation(board, location);
  }
  if (location.type === "solitaire_slot") {
    return getPlayerStackLocation(location.player, location.pileIndex, 0);
  }
  return [
    550 + location.position[0] * FIELD_PILE_AREA_SIZE,
    50 + location.position[1] * FIELD_PILE_AREA_SIZE,
  ];
}

export function getRoomHands(room: RoomState): CursorState[] {
  return room.board.players.map((_, index) => room.hands[index] ?? {});
}

export function getRoomHandDelta(
  room: RoomState,
  playerIndex: number
): HandUpdateDelta | null {
  if (playerIndex < 0 || playerIndex >= room.board.players.length) {
    return null;
  }

  return {
    playerIndex,
    hand: normalizeRoomHandForUpdate(room.hands[playerIndex]),
    version: getRoomHandUpdateVersion(room, playerIndex),
  };
}

function normalizeRoomHandForUpdate(hand: CursorState | undefined): CursorState {
  return {
    location: hand?.location ?? null,
    item: hand?.item ?? null,
    items: hand?.items ?? null,
  };
}

function getChangedRoomHandPlayerIndices(
  room: RoomState,
  previousVersions: readonly number[]
): number[] {
  const indices: number[] = [];
  const count = Math.max(
    room.board.players.length,
    room.handUpdateVersions.length,
    previousVersions.length
  );
  for (let index = 0; index < count; index++) {
    const previousVersion = previousVersions[index] ?? 0;
    const nextVersion = room.handUpdateVersions[index] ?? 0;
    if (nextVersion !== previousVersion) {
      indices.push(index);
    }
  }
  return indices;
}

export function getRoomStuckPlayerIndices(room: RoomState): number[] {
  return getStuckVoteStatus(
    room.board,
    room.stuckPlayerIndices
  ).playerIndices;
}

export function clearRoomStuckPlayers(room: RoomState): boolean {
  if (room.stuckPlayerIndices.length === 0) {
    return false;
  }

  room.stuckPlayerIndices = [];
  return true;
}

export function setRoomPlayerStuck(
  room: RoomState,
  playerIndex: number,
  isStuck: unknown,
  now = Date.now()
): SetRoomPlayerStuckResult | null {
  const votingPlayerIndices = getStuckVotingPlayerIndices(room.board);
  if (!votingPlayerIndices.includes(playerIndex)) {
    return null;
  }

  const player = room.board.players[playerIndex];
  const nextIsStuck = isStuck === true;
  room.stuckPlayerIndices = getStuckVoteStatus(
    room.board,
    room.stuckPlayerIndices
  ).playerIndices;
  const wasStuck = room.stuckPlayerIndices.includes(playerIndex);
  const currentStatus = getStuckVoteStatus(room.board, room.stuckPlayerIndices);

  if (wasStuck === nextIsStuck) {
    return {
      changed: false,
      playerIndex,
      playerName: player.name,
      isStuck: nextIsStuck,
      stuckCount: currentStatus.count,
      stuckTotal: currentStatus.total,
      rotated: false,
    };
  }

  if (nextIsStuck) {
    room.stuckPlayerIndices = room.stuckPlayerIndices.concat(playerIndex);
  } else {
    room.stuckPlayerIndices = room.stuckPlayerIndices.filter(
      (index) => index !== playerIndex
    );
  }

  const nextStatus = getStuckVoteStatus(room.board, room.stuckPlayerIndices);
  room.stuckPlayerIndices = nextStatus.playerIndices;
  const shouldRotate =
    nextIsStuck && nextStatus.total > 0 && nextStatus.count >= nextStatus.total;

  if (shouldRotate) {
    rotateDecks(room.board);
    recordRoundSnapshot(room, "manual_rotate", now);
    clearRoomStuckPlayers(room);
  }

  return {
    changed: true,
    playerIndex,
    playerName: player.name,
    isStuck: nextIsStuck,
    stuckCount: nextStatus.count,
    stuckTotal: nextStatus.total,
    rotated: shouldRotate,
  };
}

export function getReactionDelay(room: RoomState): number {
  return (2500 / room.aiSpeed + 100) / room.timescale;
}

function rememberAIMoveFocus(
  room: RoomState,
  playerIndex: number,
  move: Move,
  now: number
): void {
  const pileIndex = getAIMoveFocusedCenterPile(move);
  if (
    pileIndex == null ||
    pileIndex < 0 ||
    pileIndex >= room.board.piles.length
  ) {
    return;
  }

  rememberAICenterPileTop(room, playerIndex, pileIndex, now);
}

function rememberAIActiveCenterPile(
  room: RoomState,
  playerIndex: number,
  now: number
): void {
  const hand = room.hands[playerIndex];
  if (!hand?.item || !hand.location || !isCardCursorLocation(hand.location)) {
    return;
  }

  const pileIndex = getCenterPileIndexContainingCard(room.board, hand.location);
  if (pileIndex < 0) {
    return;
  }

  rememberAICenterPileTop(room, playerIndex, pileIndex, now);
}

function pauseObsoleteAICenterDrag(
  room: RoomState,
  playerIndex: number
): boolean {
  const pause = getObsoleteAICenterDragPause(room, playerIndex);
  if (!pause) {
    clearAICenterRetargetPause(room, playerIndex);
    return false;
  }

  const pauses = getAICenterRetargetPauses(room);
  if (aiCenterRetargetPausesEqual(pauses[playerIndex], pause)) {
    return false;
  }

  pauses[playerIndex] = pause;
  return true;
}

function getObsoleteAICenterDragPause(
  room: RoomState,
  playerIndex: number
): AICenterRetargetPause | null {
  const hand = room.hands[playerIndex];
  if (!hand?.item || !hand.location || !isCardCursorLocation(hand.location)) {
    return null;
  }

  const pileIndex = getCenterPileIndexContainingCard(room.board, hand.location);
  if (pileIndex < 0) {
    return null;
  }

  const targetTopCard = peek(room.board.piles[pileIndex]);
  if (
    !targetTopCard ||
    targetTopCard.suit !== hand.item.suit ||
    targetTopCard.value < hand.item.value
  ) {
    return null;
  }

  return {
    heldCard: { ...hand.item },
    targetCard: { ...hand.location },
    blockingCard: { ...targetTopCard },
  };
}

function clearAICenterRetargetPause(
  room: RoomState,
  playerIndex: number
): void {
  const pauses = getAICenterRetargetPauses(room);
  pauses[playerIndex] = null;
}

function getAICenterRetargetPauses(
  room: RoomState
): (AICenterRetargetPause | null)[] {
  const pauses =
    room.aiCenterRetargetPauses ?? (room.aiCenterRetargetPauses = []);
  pauses.length = room.board.players.length;
  for (let index = 0; index < pauses.length; index++) {
    pauses[index] = pauses[index] ?? null;
  }
  return pauses;
}

function aiCenterRetargetPausesEqual(
  first: AICenterRetargetPause | null | undefined,
  second: AICenterRetargetPause | null | undefined
): boolean {
  return (
    first != null &&
    second != null &&
    cardEquals(first.heldCard, second.heldCard) &&
    cardEquals(first.targetCard, second.targetCard) &&
    cardEquals(first.blockingCard, second.blockingCard)
  );
}

function pauseObsoleteAICenterMove(
  room: RoomState,
  playerIndex: number,
  move: Move
): boolean {
  if (move.type !== "c2c") {
    return false;
  }

  const sourceCard = getAICenterMoveSourceCard(room.board, playerIndex, move);
  const hand = room.hands[playerIndex];
  if (hand?.item && !cardEquals(hand.item, sourceCard)) {
    return false;
  }
  if (
    !sourceCard ||
    !hasCenterPileReachedCard(room.board, move.dest, sourceCard)
  ) {
    return false;
  }

  return true;
}

function getAICenterMoveSourceCard(
  board: BoardState,
  playerIndex: number,
  move: Extract<Move, { type: "c2c" }>
): CardState | undefined {
  const player = board.players[playerIndex];
  if (move.source.type === "pounce") {
    return peek(player.pounceDeck);
  }
  if (move.source.type === "deck") {
    return peek(player.flippedDeck);
  }
  return peek(player.stacks[move.source.index]);
}

function hasCenterPileReachedCard(
  board: BoardState,
  pileIndex: number,
  card: CardState
): boolean {
  const topCard = peek(board.piles[pileIndex]);
  return (
    topCard != null &&
    topCard.suit === card.suit &&
    topCard.value >= card.value
  );
}

function getCenterPileIndexContainingCard(
  board: BoardState,
  card: CardState
): number {
  return board.piles.findIndex((pile) =>
    pile.some((pileCard) => cardEquals(pileCard, card))
  );
}

function rememberAICenterPileTop(
  room: RoomState,
  playerIndex: number,
  pileIndex: number,
  now: number
): void {
  const topCard = peek(room.board.piles[pileIndex]);
  if (!topCard) {
    return;
  }

  const pileKnowledge = getAIPileKnowledge(room, playerIndex);
  const existing = pileKnowledge[pileIndex];
  const minTopCard = getHigherCenterPileCard(existing?.minTopCard, topCard);
  pileKnowledge[pileIndex] = {
    minTopCard: { ...minTopCard },
    expiresAt: Math.max(
      existing?.expiresAt ?? 0,
      now + getAIPileKnowledgeDuration(room)
    ),
  };
}

function getHigherCenterPileCard(
  first: CardState | undefined,
  second: CardState
): CardState {
  if (
    first &&
    first.suit === second.suit &&
    first.value > second.value
  ) {
    return first;
  }
  return second;
}

function getAIMoveFocusedCenterPile(move: Move): number | null {
  if (move.type === "c2c") {
    return move.dest;
  }
  if (move.type === "move_field_stack") {
    return move.index;
  }
  return null;
}

function getAIPileKnowledgeDuration(room: RoomState): number {
  return Math.max(
    getReactionDelay(room) * AI_PILE_KNOWLEDGE_REACTION_MULTIPLIER,
    AI_PILE_KNOWLEDGE_MIN_DURATION_MS / room.timescale
  );
}

function getAIRetargetDelay(room: RoomState): number {
  const rawReactionDelay = 2500 / room.aiSpeed + 100;
  const minDelay = room.settings.simulationMode
    ? 0
    : AI_OBSOLETE_TARGET_RECONSIDER_MIN_DELAY_MS;
  const delay = Math.min(
    AI_OBSOLETE_TARGET_RECONSIDER_MAX_DELAY_MS,
    Math.max(
      minDelay,
      rawReactionDelay * AI_OBSOLETE_TARGET_RECONSIDER_DELAY_RATIO
    )
  );
  return delay / room.timescale;
}

function getAIPileKnowledge(
  room: RoomState,
  playerIndex: number
): (AIPileKnowledge | null)[] {
  const allKnowledge = room.aiPileKnowledge ?? (room.aiPileKnowledge = []);
  allKnowledge.length = room.board.players.length;
  for (let index = 0; index < allKnowledge.length; index++) {
    allKnowledge[index] = allKnowledge[index] ?? [];
    allKnowledge[index].length = room.board.piles.length;
    for (
      let pileIndex = 0;
      pileIndex < allKnowledge[index].length;
      pileIndex++
    ) {
      allKnowledge[index][pileIndex] = allKnowledge[index][pileIndex] ?? null;
    }
  }
  return allKnowledge[playerIndex] ?? [];
}

function applyAIPileKnowledge(
  visiblePile: CardState[],
  knowledge: AIPileKnowledge | null,
  now: number
): CardState[] {
  if (!knowledge || knowledge.expiresAt <= now) {
    return visiblePile;
  }

  const visibleTopCard = peek(visiblePile);
  if (isCenterPileAtLeast(visibleTopCard, knowledge.minTopCard)) {
    return visiblePile;
  }

  return visiblePile.concat(getUnknownHigherCenterCard(knowledge.minTopCard));
}

function isCenterPileAtLeast(
  topCard: CardState | undefined,
  minTopCard: CardState
): boolean {
  return (
    topCard != null &&
    topCard.suit === minTopCard.suit &&
    topCard.value >= minTopCard.value
  );
}

function getUnknownHigherCenterCard(minTopCard: CardState): CardState {
  return { ...minTopCard, value: 13 };
}

function resetAIVisibilityMemory(room: RoomState): void {
  room.aiPileKnowledge = room.board.players.map(() =>
    Array(room.board.piles.length).fill(null)
  );
  room.aiCenterRetargetPauses = room.board.players.map(() => null);
}

export function scheduleAIReactionBoard(room: RoomState): void {
  if (room.settings.simulationMode) {
    return;
  }

  const visibleBoard = deepClone(room.board);
  setTimeout(() => {
    room.aiBoard = visibleBoard;
  }, getReactionDelay(room));
}

type StartRoomGameOptions = {
  countdownMs?: number;
};

export function startRoomGame(
  room: RoomState,
  now = Date.now(),
  options: StartRoomGameOptions = {}
): void {
  if (room.board.isActive) {
    return;
  }

  removeDisconnectedPlayers(room);
  if (!room.board.isDealt) {
    dealRoomHands(room);
  }
  clearRoomStuckPlayers(room);
  startGame(room);
  clearPlayersReadyForRound(room.board);
  room.handUpdateVersions = [];
  room.lastRoundAnalysis = null;
  room.roundSnapshots = [];
  room.aiBoard = deepClone(room.board);
  resetAIVisibilityMemory(room);

  const countdownMs =
    options.countdownMs ?? getRoomStartCountdownDurationMs(room);
  if (countdownMs <= 0) {
    beginRoomGame(room, now);
    return;
  }

  const startsAt = now + countdownMs;
  room.board.roundStartsAt = startsAt;
  room.aiCooldowns = room.board.players.map(() => startsAt + Math.random());
}

function beginRoomGame(room: RoomState, now: number): void {
  room.board.roundStartsAt = undefined;
  room.aiCooldowns = room.board.players.map(() => now + Math.random());
  room.handUpdateVersions = [];
  startRoundAnalysis(room, now);
  room.aiBoard = deepClone(room.board);
  resetAIVisibilityMemory(room);
}

export function completeRoundStartCountdown(
  room: RoomState,
  now = Date.now()
): boolean {
  const startsAt = room.board.roundStartsAt;
  if (
    !room.board.isActive ||
    startsAt == null ||
    now < startsAt
  ) {
    return false;
  }

  beginRoomGame(room, startsAt);
  return true;
}

function getRoomStartCountdownDurationMs(room: RoomState): number {
  return room.autoStart ? 0 : ROUND_START_COUNTDOWN_MS / room.timescale;
}

export function dealRoomHands(room: RoomState): boolean {
  removeDisconnectedPlayers(room);
  clearPlayersWaitingForDeal(room);
  const didDeal =
    getFairHandMode(room.settings) === "fairest"
      ? dealFairestRoomHands(room)
      : dealGameHands(room);
  if (didDeal) {
    clearRoomStuckPlayers(room);
    room.handUpdateVersions = [];
    room.lastRoundAnalysis = null;
    room.roundSnapshots = [];
    room.aiBoard = deepClone(room.board);
    resetAIVisibilityMemory(room);
  }
  return didDeal;
}

function dealFairestRoomHands(room: RoomState): boolean {
  const { board } = room;
  if (board.isActive || board.isDealt) {
    return false;
  }

  room.queuedHands = [];
  resetBoard(board);
  const shuffledDecks = board.players.map((player) => cloneDeck(player.deck));
  dealActivePlayerHands(board);

  const activePlayerIndices = getActiveDealPlayerIndices(board);
  const handScores = getFairestDealHandScores(board, activePlayerIndices);
  if (handScores.length > 0) {
    normalizeFairHandExpectedScores(board, activePlayerIndices);
    const assignments = chooseFairHandAssignments(
      activePlayerIndices.map((playerIndex) => ({
        playerIndex,
        expectedScoreTotal: getFairHandExpectedScore(board.players[playerIndex]),
      })),
      handScores
    );
    const assignedDecks = shuffledDecks.slice();
    assignments.forEach((assignment) => {
      const playerIndex = assignment.playerIndex;
      assignedDecks[playerIndex] = shuffledDecks[assignment.handPlayerIndex];
      board.players[playerIndex].fairHandExpectedScoreTotal =
        getFairHandExpectedScore(board.players[playerIndex]) +
        assignment.expectedScore;
    });
    resetBoard(board, assignedDecks);
    dealActivePlayerHands(board);
  }

  board.isDealt = true;
  room.hands = [];
  return true;
}

function getFairestDealHandScores(
  board: BoardState,
  activePlayerIndices: number[]
): FairHandScore[] {
  if (activePlayerIndices.length <= 1) {
    return [];
  }

  try {
    const scoreByPlayerIndex = new Map(
      simulateBalancedDealScores(board, {
        maxTrials: FAIREST_DEAL_SIMULATION_TRIALS,
        maxMovesPerTrial: FAIREST_DEAL_MAX_MOVES_PER_TRIAL,
      }).map((result) => [result.playerIndex, result])
    );
    return activePlayerIndices
      .map((playerIndex) => {
        const result = scoreByPlayerIndex.get(playerIndex);
        return {
          playerIndex,
          expectedScore: result?.predictedScore ?? 0,
          predictedScoreConfidenceInterval95:
            result?.predictedScoreConfidenceInterval95,
        };
      });
  } catch (error) {
    console.warn("Unable to rank fairest deal hands", error);
    return [];
  }
}

function recordFairestExpectedScoresForPlayers(
  room: RoomState,
  playerIndices: number[]
): void {
  const activePlayerIndices = getActiveDealPlayerIndices(room.board);
  normalizeFairHandExpectedScores(room.board, activePlayerIndices);
  try {
    const expectedScoreByPlayerIndex = new Map(
      simulateBalancedDealScores(room.board, {
        maxTrials: FAIREST_DEAL_SIMULATION_TRIALS,
        maxMovesPerTrial: FAIREST_DEAL_MAX_MOVES_PER_TRIAL,
      }).map((result) => [result.playerIndex, result.predictedScore])
    );
    playerIndices.forEach((playerIndex) => {
      const expectedScore = expectedScoreByPlayerIndex.get(playerIndex);
      if (expectedScore == null) {
        return;
      }
      room.board.players[playerIndex].fairHandExpectedScoreTotal =
        getFairHandExpectedScore(room.board.players[playerIndex]) +
        expectedScore;
    });
  } catch (error) {
    console.warn("Unable to record fairest deal score", error);
  }
}

function normalizeFairHandExpectedScores(
  board: BoardState,
  activePlayerIndices: number[]
): void {
  const existingScores = board.players
    .map((player) => player.fairHandExpectedScoreTotal)
    .filter(
      (score): score is number =>
        typeof score === "number" && Number.isFinite(score)
    );
  const averageScore =
    existingScores.length > 0
      ? existingScores.reduce((sum, score) => sum + score, 0) /
        existingScores.length
      : 0;

  activePlayerIndices.forEach((playerIndex) => {
    const player = board.players[playerIndex];
    const score = player.fairHandExpectedScoreTotal;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      player.fairHandExpectedScoreTotal = averageScore;
    }
  });
}

function getFairHandExpectedScore(player: PlayerState): number {
  const score = player.fairHandExpectedScoreTotal;
  return typeof score === "number" && Number.isFinite(score) ? score : 0;
}

function getActiveDealPlayerIndices(board: BoardState): number[] {
  return board.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.isSpectating !== true)
    .map(({ index }) => index);
}

function dealActivePlayerHands(board: BoardState): void {
  getActiveDealPlayerIndices(board).forEach((playerIndex) => {
    dealPlayerHand(board, playerIndex);
  });
}

function cloneDeck(deck: CardState[]): CardState[] {
  return deck.map((card) => ({ ...card }));
}

export function dealRemainingRoomPlayers(room: RoomState): boolean {
  const { board } = room;
  if (board.isActive || !board.isDealt || board.pouncer != null) {
    return false;
  }

  const playerIndices = getPlayersWaitingForDeal(room).filter((index) =>
    canDealWaitingPlayer(board.players[index])
  );
  if (playerIndices.length === 0) {
    return false;
  }

  resetCenterPiles(board);
  playerIndices.forEach((playerIndex) => {
    const player = board.players[playerIndex];
    player.isSpectating = false;
    player.isWaitingForDeal = false;
    dealPlayerHand(board, playerIndex);
  });
  if (getFairHandMode(room.settings) === "fairest") {
    recordFairestExpectedScoresForPlayers(room, playerIndices);
  }

  clearPlayersReadyForRound(board);
  room.queuedHands = [];
  clearRoomStuckPlayers(room);
  room.hands = [];
  room.handUpdateVersions = [];
  room.aiBoard = deepClone(room.board);
  resetAIVisibilityMemory(room);
  return true;
}

export function setRoomPaused(
  room: RoomState,
  isPaused: boolean,
  now = Date.now()
): boolean {
  if (!room.board.isActive) {
    if (!room.board.isPaused) {
      return false;
    }
    room.board.isPaused = false;
    return true;
  }

  if (room.board.isPaused === isPaused) {
    return false;
  }

  room.board.isPaused = isPaused;
  clearRoomStuckPlayers(room);
  room.hands = [];
  room.handUpdateVersions = [];
  if (!isPaused) {
    room.aiCooldowns = room.board.players.map(() => now + 750 + Math.random());
    room.aiBoard = deepClone(room.board);
    resetAIVisibilityMemory(room);
  }
  return true;
}

export function removeDisconnectedPlayers(
  room: RoomState,
  now = Date.now(),
  timeoutMs = 0
): boolean {
  if (room.board.isActive) {
    return false;
  }

  const playerIndices = room.board.players
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) =>
        p.disconnected &&
        (timeoutMs <= 0 ||
          (p.disconnectedAt != null && now - p.disconnectedAt >= timeoutMs))
    )
    .map(({ i }) => i);

  return removeRoomPlayers(room, playerIndices);
}

function removeRoomPlayers(room: RoomState, playerIndices: number[]): boolean {
  if (playerIndices.length === 0) {
    return false;
  }

  const sorted = playerIndices.slice().sort((a, b) => b - a);
  sorted.forEach((index) => {
    room.hands.splice(index, 1);
    room.handUpdateVersions.splice(index, 1);
    room.aiCooldowns.splice(index, 1);
  });
  clearRoomStuckPlayers(room);
  removePlayer(room.board, ...playerIndices);
  room.queuedHands = [];
  room.aiBoard = deepClone(room.board);
  resetAIVisibilityMemory(room);
  return true;
}

export function resetRoom(room: RoomState): void {
  resetBoard(room.board);
  clearPlayersWaitingForDeal(room);
  room.board.players.forEach((p) => {
    p.scores = [];
    p.totalPoints = 0;
    p.fairHandExpectedScoreTotal = 0;
  });
  room.queuedHands = [];
  clearRoomStuckPlayers(room);
  room.hands = [];
  room.handUpdateVersions = [];
  room.roundSnapshots = [];
  room.lastRoundAnalysis = null;
  room.aiBoard = deepClone(room.board);
  resetAIVisibilityMemory(room);
}

export function setRoomFairHandMode(
  room: RoomState,
  mode: unknown
): boolean {
  const fairHandMode = normalizeFairHandMode(mode);
  const fairHandRotation = fairHandMode === "rotate";
  if (
    getFairHandMode(room.settings) === fairHandMode &&
    room.settings.fairHandMode === fairHandMode &&
    room.settings.fairHandRotation === fairHandRotation
  ) {
    return false;
  }

  room.settings.fairHandMode = fairHandMode;
  room.settings.fairHandRotation = fairHandRotation;
  if (fairHandMode !== "rotate") {
    room.queuedHands = [];
  }
  return true;
}

export function setRoomFairHandRotation(
  room: RoomState,
  enabled: unknown
): boolean {
  return setRoomFairHandMode(room, enabled === true ? "rotate" : "off");
}

export function setRoomAILevel(room: RoomState, speed: number): void {
  const isSimulationMode = speed === SIMULATION_AI_LEVEL;
  clearRoomStuckPlayers(room);
  if (isSimulationMode) {
    const normalizedLevel = normalizeAILevel(room.settings.aiSpeed);
    room.autoStart = true;
    room.timescale = 100;
    room.aiSpeed = getAISpeedMultiplier(normalizedLevel);
    room.settings.aiSpeed = normalizedLevel;
    room.settings.simulationMode = true;
    room.board.players.forEach((p) => {
      if (p.socketId != null) {
        p.isSpectating = true;
        p.isWaitingForDeal = false;
      }
    });
  } else {
    const normalizedLevel = Number.isFinite(speed)
      ? normalizeAILevel(speed)
      : DEFAULT_AI_LEVEL;
    room.timescale = 1;
    room.autoStart = false;
    room.aiSpeed = getAISpeedMultiplier(normalizedLevel);
    room.settings.aiSpeed = normalizedLevel;
    room.settings.simulationMode = false;
  }
  clearPlayersReadyForRound(room.board);
}

export function setRoomAIMode(room: RoomState, mode: unknown): boolean {
  const normalizedMode = normalizeAIMode(mode);
  if (room.settings.aiMode === normalizedMode) {
    return false;
  }

  room.settings.aiMode = normalizedMode;
  clearRoomStuckPlayers(room);
  clearPlayersReadyForRound(room.board);
  return true;
}

export type RoundReadyUpdate = {
  didChange: boolean;
  didStart: boolean;
};

export function setPlayerReadyForRound(
  room: RoomState,
  playerIndex: number,
  ready: unknown,
  now = Date.now()
): RoundReadyUpdate {
  const player = room.board.players[playerIndex];
  if (!player || !canPlayerReadyForRound(room.board, playerIndex)) {
    return { didChange: false, didStart: false };
  }

  const isReadyForRound = ready === true;
  if (player.isReadyForRound === isReadyForRound) {
    return { didChange: false, didStart: false };
  }

  player.isReadyForRound = isReadyForRound;
  const didStart = maybeStartReadyRound(room, now);
  return { didChange: true, didStart };
}

function maybeStartReadyRound(room: RoomState, now: number): boolean {
  const readyPlayers = getRoundReadyPlayers(room.board);
  if (
    readyPlayers.length < MIN_ROUND_READY_PLAYERS ||
    readyPlayers.some((player) => player.isReadyForRound !== true)
  ) {
    return false;
  }

  startRoomGame(room, now);
  return true;
}

function getRoundReadyPlayers(board: BoardState): PlayerState[] {
  if (!isRoundReadyAvailable(board)) {
    return [];
  }

  return board.players.filter(
    (player) =>
      !player.disconnected &&
      player.socketId != null &&
      player.isSpectating !== true &&
      player.isWaitingForDeal !== true
  );
}

function canPlayerReadyForRound(
  board: BoardState,
  playerIndex: number
): boolean {
  const player = board.players[playerIndex];
  const readyPlayers = getRoundReadyPlayers(board);
  return (
    player != null &&
    readyPlayers.length >= MIN_ROUND_READY_PLAYERS &&
    readyPlayers.includes(player) &&
    !player.disconnected &&
    player.socketId != null &&
    player.isSpectating !== true &&
    player.isWaitingForDeal !== true
  );
}

function isRoundReadyAvailable(board: BoardState): boolean {
  return board.isDealt && !board.isActive && board.pouncer == null;
}

function clearPlayersReadyForRound(board: BoardState): void {
  board.players.forEach((player) => {
    player.isReadyForRound = false;
  });
}

function getPlayersWaitingForDeal(room: RoomState): number[] {
  return room.board.players
    .map((player, index) => ({ player, index }))
    .filter(
      ({ player }) =>
        !player.disconnected && shouldClearWaitingForDeal(room, player)
    )
    .map(({ index }) => index);
}

function clearPlayersWaitingForDeal(room: RoomState): boolean {
  let didClear = false;
  room.board.players.forEach((player) => {
    if (!shouldClearWaitingForDeal(room, player)) {
      return;
    }

    player.isSpectating = false;
    player.isWaitingForDeal = false;
    didClear = true;
  });
  return didClear;
}

function shouldClearWaitingForDeal(
  room: RoomState,
  player: PlayerState
): boolean {
  return (
    player.isWaitingForDeal === true ||
    (player.isSpectating === true && !room.settings.simulationMode)
  );
}

function canDealWaitingPlayer(player: PlayerState): boolean {
  return (
    player.deck.length >= 17 &&
    player.flippedDeck.length === 0 &&
    player.pounceDeck.length === 0 &&
    player.stacks.every((stack) => stack.length === 0)
  );
}

export function getRoomHandUpdateVersion(
  room: RoomState,
  playerIndex: number
): number {
  return room.handUpdateVersions[playerIndex] ?? 0;
}

export function clearRoomHand(room: RoomState, playerIndex: number): boolean {
  if (playerIndex < 0) {
    return false;
  }
  const hadHand = room.hands[playerIndex] != null;
  room.hands[playerIndex] = {};
  if (hadHand) {
    markRoomHandUpdated(room, playerIndex);
  }
  return hadHand;
}

export function updateRoomHand(
  room: RoomState,
  playerIndex: number,
  {
    item,
    items,
    location,
  }: {
    item?: CardState | null;
    items?: CardState[] | null;
    location?: CursorLocation | null;
  }
): boolean {
  if (playerIndex < 0) {
    return false;
  }
  const hands = room.hands;
  hands[playerIndex] = hands[playerIndex] ?? {};
  let didChange = false;
  if (location !== undefined) {
    didChange = setRoomHandLocation(hands[playerIndex], location) || didChange;
  }
  if (item !== undefined) {
    didChange = setRoomHandItem(hands[playerIndex], item) || didChange;
    if (items === undefined) {
      didChange =
        setRoomHandItems(hands[playerIndex], item ? [item] : null) ||
        didChange;
    }
  }
  if (items !== undefined) {
    didChange = setRoomHandItems(hands[playerIndex], items) || didChange;
  }
  if (didChange) {
    markRoomHandUpdated(room, playerIndex);
  }
  return didChange;
}

export function releaseRoomHandAfterCenterPlay(
  room: RoomState,
  playerIndex: number,
  move: Move,
  location?: CursorLocation | null
): boolean {
  if (playerIndex < 0 || move.type !== "c2c") {
    return false;
  }

  const hand = (room.hands[playerIndex] = room.hands[playerIndex] ?? {});
  let didChange = false;
  if (location != null) {
    didChange = setRoomHandLocation(hand, location) || didChange;
  }
  didChange = setRoomHandItem(hand, null) || didChange;
  didChange = setRoomHandItems(hand, null) || didChange;
  if (didChange) {
    markRoomHandUpdated(room, playerIndex);
  }
  return true;
}

export function resetRoomHandAfterCenterPlay(
  room: RoomState,
  playerIndex: number,
  move: Move,
  location?: CardState | null
): boolean {
  if (playerIndex < 0 || move.type !== "c2c") {
    return false;
  }

  const hand = (room.hands[playerIndex] = room.hands[playerIndex] ?? {});
  let didChange = setRoomHandLocation(
    hand,
    location ?? getPlayerHandCursorLocation(room.board, playerIndex, move)
  );
  didChange = setRoomHandItem(hand, null) || didChange;
  didChange = setRoomHandItems(hand, null) || didChange;
  if (didChange) {
    markRoomHandUpdated(room, playerIndex);
  }
  return true;
}

export function resetRoomHandAfterDeckAdvance(
  room: RoomState,
  playerIndex: number,
  move: Move
): boolean {
  if (
    playerIndex < 0 ||
    (move.type !== "cycle" && move.type !== "flip_deck")
  ) {
    return false;
  }

  const hand = (room.hands[playerIndex] = room.hands[playerIndex] ?? {});
  let didChange = setRoomHandLocation(
    hand,
    getPlayerDeckCursorLocation(room.board, playerIndex)
  );
  didChange = setRoomHandItem(hand, null) || didChange;
  didChange = setRoomHandItems(hand, null) || didChange;
  if (didChange) {
    markRoomHandUpdated(room, playerIndex);
  }
  return true;
}

function setRoomHandLocation(
  hand: CursorState,
  location: CursorLocation | null
): boolean {
  if (cursorLocationsEqual(hand.location, location)) {
    return false;
  }
  hand.location = location;
  return true;
}

function setRoomHandItem(
  hand: CursorState,
  item: CardState | null | undefined
): boolean {
  if (cardEquals(hand.item, item)) {
    return false;
  }
  hand.item = item;
  return true;
}

function setRoomHandItems(
  hand: CursorState,
  items: CardState[] | null | undefined
): boolean {
  if (cursorItemCardsEqual(hand.items, items)) {
    return false;
  }
  hand.items = items;
  return true;
}

function cursorItemCardsEqual(
  a: CardState[] | null | undefined,
  b: CardState[] | null | undefined
): boolean {
  if (a == null || b == null) {
    return a == null && b == null;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((card, index) => cardEquals(card, b[index]));
}

function markRoomHandUpdated(room: RoomState, playerIndex: number): void {
  if (playerIndex < 0) {
    return;
  }
  room.handUpdateVersions[playerIndex] =
    (room.handUpdateVersions[playerIndex] ?? 0) + 1;
}

function getPlayerHandCursorLocation(
  board: BoardState,
  playerIndex: number,
  move: Extract<Move, { type: "c2c" }>
): CardState | null {
  const player = board.players[playerIndex];
  if (!player) {
    return null;
  }

  return (
    getPreferredSourceCursorLocation(player, move.source) ??
    peek(player.pounceDeck) ??
    peek(player.flippedDeck) ??
    peek(player.deck) ??
    getFirstSolitaireTopCard(player) ??
    null
  );
}

function getPreferredSourceCursorLocation(
  player: PlayerState,
  source: Extract<Move, { type: "c2c" }>["source"]
): CardState | null {
  if (source.type === "pounce") {
    return peek(player.pounceDeck) ?? null;
  }
  if (source.type === "deck") {
    return peek(player.flippedDeck) ?? peek(player.deck) ?? null;
  }
  return peek(player.stacks[source.index]) ?? null;
}

function getPlayerDeckCursorLocation(
  board: BoardState,
  playerIndex: number
): CardState | null {
  const player = board.players[playerIndex];
  if (!player) {
    return null;
  }

  return peek(player.flippedDeck) ?? peek(player.deck) ?? null;
}

function getFirstSolitaireTopCard(player: PlayerState): CardState | null {
  for (const stack of player.stacks) {
    const card = peek(stack);
    if (card) {
      return card;
    }
  }
  return null;
}

export function recordRoundSnapshot(
  room: RoomState,
  reason: RoundSnapshotReason,
  now = Date.now(),
  playerIndex?: number,
  move?: Move
): void {
  if (
    room.autoStart ||
    room.settings.simulationMode ||
    !room.board.isActive ||
    isRoundStartPending(room.board, now)
  ) {
    return;
  }

  room.roundSnapshots.push({
    time: now,
    reason,
    playerIndex,
    move,
    board: deepClone(room.board),
  });
}

function startRoundAnalysis(room: RoomState, now: number): void {
  room.lastRoundAnalysis = null;
  if (room.autoStart || room.settings.simulationMode) {
    room.roundSnapshots = [];
    return;
  }

  room.roundSnapshots = [
    {
      time: now,
      reason: "round_start",
      board: deepClone(room.board),
    },
  ];
}

function takeRoundAnalysisSnapshots(
  room: RoomState,
  now: number
): RoundSnapshot[] | null {
  if (room.roundSnapshots.length === 0) {
    return null;
  }

  const snapshots = room.roundSnapshots.concat({
    time: now,
    reason: "round_end",
    board: deepClone(room.board),
  });
  room.roundSnapshots = [];
  return snapshots;
}

export function completeRoundAnalysis(
  room: RoomState,
  snapshots: RoundSnapshot[]
): boolean {
  const analysis = analyzeRoundSnapshots(snapshots);
  if (!analysis) {
    return false;
  }

  room.lastRoundAnalysis = analysis;
  return true;
}
