import type { BoardState, PlayerState } from "./GameUtils";
import { isGameOver, isRoundStartPending } from "./GameUtils";

export type StuckVoteStatus = {
  playerIndices: number[];
  count: number;
  total: number;
};

type StuckVoteOptions = {
  includePaused?: boolean;
};

export function getStuckVotingPlayerIndices(
  board: BoardState | null | undefined,
  options: StuckVoteOptions = {}
): number[] {
  if (!board || !isStuckVotingOpen(board, options)) {
    return [];
  }

  return board.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => isStuckVotingPlayer(player))
    .map(({ index }) => index);
}

export function getStuckVoteStatus(
  board: BoardState | null | undefined,
  stuckPlayerIndices: readonly number[],
  options: StuckVoteOptions = {}
): StuckVoteStatus {
  const eligiblePlayers = new Set(getStuckVotingPlayerIndices(board, options));
  const playerIndices = Array.from(new Set(stuckPlayerIndices))
    .filter((playerIndex) => eligiblePlayers.has(playerIndex))
    .sort((left, right) => left - right);

  return {
    playerIndices,
    count: playerIndices.length,
    total: eligiblePlayers.size,
  };
}

function isStuckVotingOpen(
  board: BoardState,
  options: StuckVoteOptions
): boolean {
  return (
    board.isActive &&
    (options.includePaused === true || !board.isPaused) &&
    !isRoundStartPending(board) &&
    !isGameOver(board)
  );
}

function isStuckVotingPlayer(player: PlayerState): boolean {
  return (
    player.socketId != null &&
    player.isSpectating !== true &&
    player.isWaitingForDeal !== true
  );
}
