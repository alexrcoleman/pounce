import type { BoardState } from "./GameUtils";

const BOARD_CENTER_X = 0.5;
const BOARD_CENTER_Y = 0.5;

export function getBoardPileDistanceToBoardCenter(
  board: BoardState,
  pileIndex: number
): number {
  const pileLoc = board.pileLocs[pileIndex];
  if (!pileLoc) {
    return Number.POSITIVE_INFINITY;
  }

  const dx = pileLoc[0] - BOARD_CENTER_X;
  const dy = pileLoc[1] - BOARD_CENTER_Y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function compareBoardPilesByCenterDistance(
  board: BoardState,
  leftIndex: number,
  rightIndex: number
): number {
  return (
    getBoardPileDistanceToBoardCenter(board, leftIndex) -
      getBoardPileDistanceToBoardCenter(board, rightIndex) ||
    leftIndex - rightIndex
  );
}

export function getNearestEmptyCenterPileToBoardCenter(
  board: BoardState
): number {
  let nearestIndex = -1;

  for (let index = 0; index < board.piles.length; index++) {
    if (board.piles[index].length > 0) {
      continue;
    }
    if (
      nearestIndex < 0 ||
      compareBoardPilesByCenterDistance(board, index, nearestIndex) < 0
    ) {
      nearestIndex = index;
    }
  }

  return nearestIndex;
}
