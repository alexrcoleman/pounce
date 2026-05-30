import { cardEquals } from "./CardUtils";
import { BoardState, CardState } from "./GameUtils";

type Location = [number, number];
export const CARD_WIDTH = 55;
export const CARD_HEIGHT = 77;
export const FIELD_PILE_AREA_SIZE = 500;
export const FIELD_STACK_CARD_GAP = 0.2;
export const PLAYER_BOARD_HEIGHT = 225;

const PLAYER_HAND_OFFSET_X = -8;
const PLAYER_CARD_SPACING = 70;
const PLAYER_POUNCE_COLUMN = -1.05;
const PLAYER_FLIPPED_DECK_COLUMN = 4.35;
const PLAYER_DECK_COLUMN = 5.45;
const PLAYER_STACK_TOP = 42;
const PLAYER_DECK_TOP = 62;
const PLAYER_POUNCE_TOP = 92;
export const PLAYER_STACK_CARD_GAP = 20;
export const ACTIVE_PLAYER_BOARD_BOTTOM_GAP = 49;
const OPPONENT_PLAYER_TOP =
  PLAYER_BOARD_HEIGHT + ACTIVE_PLAYER_BOARD_BOTTOM_GAP;
const OPPONENT_PLAYER_ROW_GAP = 165;

export function getPlayerDeckLocation(
  playerIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [
    px + PLAYER_HAND_OFFSET_X + PLAYER_DECK_COLUMN * PLAYER_CARD_SPACING,
    py + PLAYER_DECK_TOP + cardIndex * 0.2,
  ];
}
export function getPlayerFlippedDeckLocation(
  playerIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [
    px +
      PLAYER_HAND_OFFSET_X +
      PLAYER_FLIPPED_DECK_COLUMN * PLAYER_CARD_SPACING,
    py + PLAYER_DECK_TOP + cardIndex * 0.1,
  ];
}
export function getApproximateCardLocation(
  board: BoardState,
  card: CardState
): Location {
  const pile = board.piles.findIndex((p) => p.some((c) => cardEquals(c, card)));
  if (pile >= 0) {
    return getBoardPileLocation(board, pile);
  }
  const playerIdx = card.player;
  const player = board.players[playerIdx];
  const stackIdx = player.stacks.findIndex((s) =>
    s.some((c) => cardEquals(c, card))
  );
  if (stackIdx >= 0) {
    const cardIndex = player.stacks[stackIdx].findIndex((c) =>
      cardEquals(c, card)
    );
    return getPlayerStackLocation(playerIdx, stackIdx, cardIndex);
  }
  if (player.pounceDeck.some((c) => cardEquals(c, card))) {
    const cardIndex = player.pounceDeck.findIndex((c) => cardEquals(c, card));
    return getPlayerPounceCardLocation(playerIdx, cardIndex);
  }
  if (player.deck.some((c) => cardEquals(c, card))) {
    const cardIndex = player.deck.findIndex((c) => cardEquals(c, card));
    return getPlayerDeckLocation(playerIdx, cardIndex);
  }
  // must be in flipped deck
  const cardIndex = player.flippedDeck.findIndex((c) => cardEquals(c, card));
  return getPlayerFlippedDeckLocation(playerIdx, cardIndex);
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
    return [80, OPPONENT_PLAYER_TOP + OPPONENT_PLAYER_ROW_GAP * playerIndex];
  }
  return [
    80,
    OPPONENT_PLAYER_TOP + OPPONENT_PLAYER_ROW_GAP * (playerIndex - 1),
  ];
}

export function getBoardPileLocation(
  board: BoardState,
  index: number
): Location {
  return [
    550 + board.pileLocs[index][0] * FIELD_PILE_AREA_SIZE,
    50 + board.pileLocs[index][1] * FIELD_PILE_AREA_SIZE,
  ];
}

export function getBoardPileCardLocation(
  board: BoardState,
  pileIndex: number,
  cardIndex: number
): Location {
  const pilePos = getBoardPileLocation(board, pileIndex);
  return [pilePos[0], pilePos[1] + cardIndex * FIELD_STACK_CARD_GAP];
}

export function getPlayerStackLocation(
  playerIndex: number,
  stackIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [
    px + PLAYER_HAND_OFFSET_X + stackIndex * PLAYER_CARD_SPACING,
    py + PLAYER_STACK_TOP + cardIndex * PLAYER_STACK_CARD_GAP,
  ];
}
export function getPlayerPounceCardLocation(
  playerIndex: number,
  cardIndex: number,
  activePlayerIndex = playerIndex
): Location {
  const [px, py] = getPlayerLocation(playerIndex, activePlayerIndex);
  return [
    px + PLAYER_HAND_OFFSET_X + PLAYER_POUNCE_COLUMN * PLAYER_CARD_SPACING,
    py + PLAYER_POUNCE_TOP + cardIndex * 0.1,
  ];
}
