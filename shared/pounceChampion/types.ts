import type { ActionRankingCandidate, ActionRankingOptions } from "../ActionRankingPolicy";
import type { BoardState, CursorState } from "../GameUtils";
import type { Move, MoveResult } from "../MoveHandler";

export type ActionRankingDecisionReviewer = (decision: {
  board: BoardState;
  playerIndex: number;
  candidates: readonly ActionRankingCandidate[];
  scores: readonly number[];
  memoryState: readonly number[];
  hands: readonly CursorState[];
}) => readonly number[] | void;

export type ActionRankingMoveReviewer = (event: {
  board: BoardState;
  playerIndex: number;
  move: Move;
  result: MoveResult | null;
  moveCount: number;
}) => void;

export type PounceCursorObservation = {
  time: number;
  board: BoardState;
  hands: readonly CursorState[];
  changedSeats: readonly number[];
};

export type PounceRoomReviewer = {
  reviewDecision: ActionRankingDecisionReviewer;
  reviewMove?: ActionRankingMoveReviewer;
  reviewDeckRotation?: () => void;
  reviewClock?: (now: number) => void;
  reviewCursorUpdates?: (observation: PounceCursorObservation) => void;
  projectObservedBoard?: (board: BoardState, seat: number, hands: readonly CursorState[]) => BoardState;
  actionOptions?: ActionRankingOptions;
};
