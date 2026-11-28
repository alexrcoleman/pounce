import { getAISpeedMultiplier, MAX_AI_LEVEL } from "../AIDifficulty";
import { enumerateActionRankingCandidates } from "../ActionRankingPolicy";
import { isGameOver, type BoardState, type CursorState } from "../GameUtils";
import type { Move, MoveResult } from "../MoveHandler";
import { createPouncePublicBoard } from "../PouncePublicAfterstate";
import { getAIPlayerResolvedMode, type RoomState } from "../RoomState";
import { createPounceChampionReviewer, getPounceChampionScorer } from "./champion";
import type { PounceRoomReviewer } from "./types";

const trainingSpeed = getAISpeedMultiplier(MAX_AI_LEVEL);
const rounds = new WeakMap<RoomState, PounceChampionRound>();

export type PounceChampionRound = {
  board: BoardState;
  seats: BoardState["players"];
  reviewer: PounceRoomReviewer;
  memory: number[][];
  handVersions: number[];
  attempts: number;
  startedAt: number;
  clockScale: number;
};

export function preparePounceChampionRound(room: RoomState, now: number, enabled: boolean) {
  const { board, settings } = room;
  if (!enabled || settings.simulationMode || settings.aiMode === "fixed" || !board.isActive ||
      !board.isDealt || board.roundStartsAt != null || isGameOver(board) || board.players.length !== 4 ||
      board.players.some(({ isSpectating }) => isSpectating) ||
      !board.players.some((player, seat) => player.socketId == null && getAIPlayerResolvedMode(board, seat, settings.aiMode) === "trained")) {
    rounds.delete(room);
    return;
  }

  const clockScale = room.aiSpeed * room.timescale / trainingSpeed;
  let round = rounds.get(room);
  if (!round || round.board !== board || round.clockScale !== clockScale ||
      round.seats.some((player, index) => player !== board.players[index])) {
    round = {
      board, seats: board.players.slice(), reviewer: createPounceChampionReviewer(),
      memory: [], handVersions: [], attempts: 0, startedAt: now, clockScale,
    };
    rounds.set(room, round);
  }
  round.reviewer.reviewClock?.(getPolicyTime(round, now));
  observePounceChampionHands(round, room, now);
  return round;
}

export function observePounceChampionHands(round: PounceChampionRound, room: RoomState, now: number) {
  const changedSeats = room.board.players.flatMap((_, seat) =>
    (round.handVersions[seat] ?? 0) === (room.handUpdateVersions[seat] ?? 0) ? [] : [seat]
  );
  if (changedSeats.length === 0) return;
  round.handVersions = room.handUpdateVersions.slice();
  round.reviewer.reviewCursorUpdates?.({
    time: getPolicyTime(round, now),
    board: createPouncePublicBoard(room.aiBoard),
    hands: room.hands,
    changedSeats,
  });
}

export function observePounceHumanHand(room: RoomState, now: number) {
  const round = rounds.get(room);
  if (round?.board === room.board) observePounceChampionHands(round, room, now);
}

export function rotatePounceChampionDeck(room: RoomState) {
  rounds.get(room)?.reviewer.reviewDeckRotation?.();
}

export function resetPounceChampionRound(room: RoomState) {
  rounds.delete(room);
}

export function observePounceChampionMove(
  round: PounceChampionRound, seat: number, move: Move, result: MoveResult | null, reviewedSeat: boolean
) {
  const moveCount = round.attempts++;
  if (reviewedSeat) round.reviewer.reviewMove?.({ board: round.board, playerIndex: seat, move, result, moveCount });
}

export function getPounceChampionMove(
  round: PounceChampionRound, visibleBoard: BoardState, playerIndex: number, hands: readonly CursorState[]
): Move | undefined {
  const { reviewer } = round;
  const board = reviewer.projectObservedBoard?.(visibleBoard, playerIndex, hands) ?? visibleBoard;
  const candidates = enumerateActionRankingCandidates(board, playerIndex, {
    includeWait: true, includePremove: true, includeFlipDeck: true, ...reviewer.actionOptions, hands,
  });
  if (candidates.length === 0) return;
  const policy = getPounceChampionScorer();
  const memoryState = round.memory[playerIndex] ?? policy.createInitialMemoryState();
  const scores = candidates.map(({ features }) => policy.scoreFeatures(features, memoryState));
  const ranked = reviewer.reviewDecision({ board, playerIndex, candidates, scores, memoryState, hands }) ?? scores;
  const selected = ranked.reduce((best, score, index) => score > ranked[best] ? index : best, 0);
  const choice = candidates[selected];
  round.memory[playerIndex] = policy.advanceMemoryState(memoryState, choice.features);
  return choice.move;
}

// Existing tactical windows use level-10 motor time. Scale the policy clock while
// the room keeps its own configured movement and visibility delays.
function getPolicyTime(round: PounceChampionRound, now: number) {
  return round.clockScale === 1 ? now : round.startedAt + (now - round.startedAt) * round.clockScale;
}
