import { cardEquals } from "./CardUtils";
import { BoardState, CardState } from "./GameUtils";

type Location = [number, number];
export function getPlayerDeckLocation(
  playerIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [px + 5.5 * 60, py + 70 + cardIndex * 0.2];
}
export function getPlayerFlippedDeckLocation(
  playerIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [px + 4.5 * 60, py + 70 + cardIndex * 0.1];
}
export function getApproximateCardLocation(
  board: BoardState,
  card: CardState
): Location {
  const CARD_WIDTH = 70;
  const pile = board.piles.findIndex((p) => p.some((c) => cardEquals(c, card)));
  if (pile >= 0) {
    return getBoardPileLocation(board, pile);
  }
  const playerIdx = card.player;
  const player = board.players[playerIdx];
  const [px, py] = getPlayerLocation(playerIdx);
  const stackIdx = player.stacks.findIndex((s) =>
    s.some((c) => cardEquals(c, card))
  );
  if (stackIdx >= 0) {
    return [
      px + (stackIdx + 1) * CARD_WIDTH,
      py + 10 * (player.stacks[stackIdx].length - 1),
    ];
  }
  if (player.pounceDeck.some((c) => cardEquals(c, card))) {
    return [px, py + 50];
  }
  if (player.deck.some((c) => cardEquals(c, card))) {
    return getPlayerDeckLocation(playerIdx, player.deck.length - 1);
  }
  // must be in flipped deck
  return getPlayerFlippedDeckLocation(playerIdx, player.flippedDeck.length - 1);
}
export function getPlayerLocation(
  playerIndex: number,
  activePlayerIndex = playerIndex
): Location {
  if (playerIndex == activePlayerIndex) {
    return [80, 0];
  }
  // TODO: Could put everyone in a "circle" and wrap around
  if (playerIndex < activePlayerIndex) {
    return [80, 185 + 165 * playerIndex];
  }
  return [80, 185 + 165 * (playerIndex - 1)];
}

export function getBoardPileLocation(
  board: BoardState,
  index: number
): Location {
  return [
    550 + board.pileLocs[index][0] * 500,
    50 + board.pileLocs[index][1] * 500,
  ];
}

export function getBoardPileCardLocation(
  board: BoardState,
  pileIndex: number,
  cardIndex: number
): Location {
  const pilePos = getBoardPileLocation(board, pileIndex);
  return [pilePos[0], pilePos[1] + cardIndex * 0.2];
}

export function getPlayerStackLocation(
  playerIndex: number,
  stackIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [px + stackIndex * 60, py + 50 + cardIndex * 15];
}
export function getPlayerPounceCardLocation(
  playerIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [px - 60, py + 100 + cardIndex * 0.1];
}
