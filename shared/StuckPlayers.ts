import type { BoardState, PlayerState } from "./GameUtils";
import { isBoardAcceptingMoves } from "./MoveHandler";

export type StuckVoteStatus = {
  playerIndices: number[];
  count: number;
  total: number;
};

export function getStuckVotingPlayerIndices(
  board: BoardState | null | undefined
): number[] {
  if (!board || !isBoardAcceptingMoves(board)) {
    return [];
  }

  return board.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => isStuckVotingPlayer(player))
    .map(({ index }) => index);
}

export function getStuckVoteStatus(
  board: BoardState | null | undefined,
  stuckPlayerIndices: readonly number[]
): StuckVoteStatus {
  const eligiblePlayers = new Set(getStuckVotingPlayerIndices(board));
  const playerIndices = Array.from(new Set(stuckPlayerIndices))
    .filter((playerIndex) => eligiblePlayers.has(playerIndex))
    .sort((left, right) => left - right);

  return {
    playerIndices,
    count: playerIndices.length,
    total: eligiblePlayers.size,
  };
}

function isStuckVotingPlayer(player: PlayerState): boolean {
  return (
    player.socketId != null &&
    player.isSpectating !== true &&
    player.disconnected !== true
  );
}
