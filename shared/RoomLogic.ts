import {
  CardState,
  CursorState,
  BoardState,
  PlayerState,
  dealPlayerHand,
  dealGameHands,
  isGameOver,
  removePlayer,
  resetCenterPiles,
  resetBoard,
  rotateDecks,
  scoreBoard,
  startGame,
} from "./GameUtils";

import { RoomState } from "./RoomState";
import { executeMove, getDistance, type Move } from "./MoveHandler";
import { getApproximateCardLocation } from "./CardLocations";
import { getBasicAIMove } from "./ComputerV1";
import deepClone from "./deepClone";
import { peek } from "./CardUtils";
import {
  analyzeRoundSnapshots,
  type RoundSnapshotReason,
} from "./RoundAnalysis";

export type RoomTickResult = {
  hasUpdate: boolean;
  hasHandUpdate: boolean;
};

export const DISCONNECTED_PLAYER_TIMEOUT_MS = 5 * 60 * 1000;
const AI_WATCHED_PILE_MIN_DURATION_MS = 3000;
const AI_WATCHED_PILE_REACTION_MULTIPLIER = 2;

export function tickRoom(room: RoomState, now = Date.now()): RoomTickResult {
  const { board } = room;
  const aiCooldowns = room.aiCooldowns;
  let hasUpdate = false;
  let hasHandUpdate = false;

  if (board.isActive && !board.isPaused && board.ticksSinceMove >= 100) {
    rotateDecks(board);
    recordRoundSnapshot(room, "auto_rotate", now);
    hasUpdate = true;
  }
  if (!board.isActive || board.isPaused) {
    // no-op
  } else if (isGameOver(board)) {
    finishRoundAnalysis(room, now);
    scoreBoard(board);
    hasUpdate = true;
    if (room.autoStart) {
      startRoomGame(room, now);
    }
  } else {
    const shuffledPlayers = board.players
      .slice()
      .map((p, i) => [p, i] as const);
    shuffledPlayers.sort((a, b) => aiCooldowns[a[1]] - aiCooldowns[b[1]]);
    shuffledPlayers.map(([player, index]) => {
      if (aiCooldowns[index] > now || player.socketId != null) {
        return false;
      }
      hasUpdate = true;
      const hand = (room.hands[index] = room.hands[index] ?? {});
      const visibleBoard = getVisibleBoard(room, index, now);
      const move = getBasicAIMove(visibleBoard, index, hand);

      if (move) {
        rememberAIMoveFocus(room, index, move, now);
      }
      const moveResult = move ? executeMove(board, index, move, hand) : null;
      // AI cursor movement is an intention, not a completed board move.
      if (move && moveResult?.boardChanged) {
        recordRoundSnapshot(room, "move", now, index, move);
      }

      let cooldownDist = {
        mean: 3500 / room.aiSpeed,
        deviation: 750 / room.aiSpeed,
      };
      if (moveResult?.cursorMove) {
        const hand = room.hands[index];
        const currentPos = hand.location
          ? getApproximateCardLocation(board, hand.location)
          : null;
        hand.location = moveResult.cursorMove;
        hand.item = moveResult.cursorMoveItem ?? hand.item;
        hasHandUpdate = true;

        let cost = 1500;
        if (currentPos) {
          const targetPos = getApproximateCardLocation(
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
        if (move?.type === "c2c") {
          resetRoomHandAfterCenterPlay(room, index, move);
        } else {
          room.hands[index].item = undefined;
        }
      }
      const delay = move
        ? (Math.random() - 0.5) * 2 * cooldownDist.deviation +
          cooldownDist.mean
        : 200 / room.aiSpeed;
      aiCooldowns[index] = now + delay / room.timescale;
    });
  }

  if (removeDisconnectedPlayers(room, now, DISCONNECTED_PLAYER_TIMEOUT_MS)) {
    hasUpdate = true;
    hasHandUpdate = true;
  }

  return { hasUpdate, hasHandUpdate };
}

function getVisibleBoard(
  room: RoomState,
  playerIndex: number,
  now = Date.now()
) {
  const visibleBoard = deepClone(room.aiBoard);
  const realBoard = room.board;
  const player = realBoard.players[playerIndex];
  visibleBoard.players[playerIndex] = player;
  const watchedPileExpiresAt = getAIWatchedPileExpirations(room, playerIndex);

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
      (watchedPileExpiresAt[i] ?? 0) > now ||
      peek(p)?.player === playerIndex ||
      p.length <= 1 ||
      nonEmptyPileCount < 4 ||
      canPounceCardPlay
    ) {
      visibleBoard.piles[i] = p;
    }
  });

  return visibleBoard;
}

export function getRoomHands(room: RoomState): CursorState[] {
  return room.board.players.map((_, index) => room.hands[index] ?? {});
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

  const watchedPileExpiresAt = getAIWatchedPileExpirations(room, playerIndex);
  watchedPileExpiresAt[pileIndex] = Math.max(
    watchedPileExpiresAt[pileIndex] ?? 0,
    now + getAIPileWatchDuration(room)
  );
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

function getAIPileWatchDuration(room: RoomState): number {
  return Math.max(
    getReactionDelay(room) * AI_WATCHED_PILE_REACTION_MULTIPLIER,
    AI_WATCHED_PILE_MIN_DURATION_MS / room.timescale
  );
}

function getAIWatchedPileExpirations(
  room: RoomState,
  playerIndex: number
): number[] {
  const allWatches =
    room.aiWatchedPileExpiresAt ?? (room.aiWatchedPileExpiresAt = []);
  allWatches.length = room.board.players.length;
  for (let index = 0; index < allWatches.length; index++) {
    allWatches[index] = allWatches[index] ?? [];
    allWatches[index].length = room.board.piles.length;
    for (let pileIndex = 0; pileIndex < allWatches[index].length; pileIndex++) {
      allWatches[index][pileIndex] = allWatches[index][pileIndex] ?? 0;
    }
  }
  return allWatches[playerIndex] ?? [];
}

function resetAIVisibilityMemory(room: RoomState): void {
  room.aiWatchedPileExpiresAt = room.board.players.map(() =>
    Array(room.board.piles.length).fill(0)
  );
}

export function scheduleAIReactionBoard(room: RoomState): void {
  const visibleBoard = deepClone(room.board);
  setTimeout(() => {
    room.aiBoard = visibleBoard;
  }, getReactionDelay(room));
}

export function startRoomGame(room: RoomState, now = Date.now()): void {
  removeDisconnectedPlayers(room);
  if (!room.board.isDealt) {
    clearPlayersWaitingForDeal(room);
  }
  room.aiCooldowns = room.board.players.map(() => now + 2000 + Math.random());
  startGame(room);
  startRoundAnalysis(room, now);
  room.aiBoard = deepClone(room.board);
  resetAIVisibilityMemory(room);
}

export function dealRoomHands(room: RoomState): boolean {
  removeDisconnectedPlayers(room);
  clearPlayersWaitingForDeal(room);
  const didDeal = dealGameHands(room);
  if (didDeal) {
    room.lastRoundAnalysis = null;
    room.roundSnapshots = [];
    room.aiBoard = deepClone(room.board);
    resetAIVisibilityMemory(room);
  }
  return didDeal;
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

  room.queuedHands = [];
  room.hands = [];
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
  room.hands = [];
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
    room.aiCooldowns.splice(index, 1);
  });
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
  });
  room.queuedHands = [];
  room.hands = [];
  room.roundSnapshots = [];
  room.lastRoundAnalysis = null;
  room.aiBoard = deepClone(room.board);
  resetAIVisibilityMemory(room);
}

export function setRoomFairHandRotation(
  room: RoomState,
  enabled: unknown
): boolean {
  const fairHandRotation = enabled === true;
  if (room.settings.fairHandRotation === fairHandRotation) {
    return false;
  }

  room.settings.fairHandRotation = fairHandRotation;
  if (!fairHandRotation) {
    room.queuedHands = [];
  }
  return true;
}

export function setRoomAILevel(room: RoomState, speed: number): void {
  const isSimulationMode = speed === 1000;
  if (isSimulationMode) {
    room.autoStart = true;
    room.timescale = 100;
    room.settings.aiSpeed = room.aiSpeed;
    room.settings.simulationMode = true;
    room.board.players.forEach((p) => {
      if (p.socketId != null) {
        p.isSpectating = true;
        p.isWaitingForDeal = false;
      }
    });
  } else {
    const normalizedSpeed = Number.isFinite(speed)
      ? Math.max(1, Math.min(500, speed))
      : 3;
    room.timescale = 1;
    room.autoStart = false;
    room.aiSpeed = normalizedSpeed;
    room.settings.aiSpeed = normalizedSpeed;
    room.settings.simulationMode = false;
  }
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

export function updateRoomHand(
  room: RoomState,
  playerIndex: number,
  {
    item,
    location,
  }: {
    item?: CardState | null;
    location?: CardState | null;
  }
): void {
  if (playerIndex < 0) {
    return;
  }
  const hands = room.hands;
  hands[playerIndex] = hands[playerIndex] ?? {};
  if (location !== undefined) {
    hands[playerIndex].location = location;
  }
  if (item !== undefined) {
    hands[playerIndex].item = item;
  }
}

export function resetRoomHandAfterCenterPlay(
  room: RoomState,
  playerIndex: number,
  move: Move
): boolean {
  if (playerIndex < 0 || move.type !== "c2c") {
    return false;
  }

  const hand = (room.hands[playerIndex] = room.hands[playerIndex] ?? {});
  hand.location = getPlayerHandCursorLocation(room.board, playerIndex, move);
  hand.item = null;
  return true;
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
  if (!room.board.isActive) {
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
  room.roundSnapshots = [
    {
      time: now,
      reason: "round_start",
      board: deepClone(room.board),
    },
  ];
}

function finishRoundAnalysis(room: RoomState, now: number): void {
  if (room.roundSnapshots.length === 0) {
    return;
  }

  const snapshots = room.roundSnapshots.concat({
    time: now,
    reason: "round_end",
    board: deepClone(room.board),
  });
  room.lastRoundAnalysis = analyzeRoundSnapshots(snapshots);
  room.roundSnapshots = [];
}
