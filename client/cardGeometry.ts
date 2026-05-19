import type { BoardState, CardState } from "../shared/GameUtils";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  getBoardPileCardLocation,
  getPlayerDeckLocation,
  getPlayerFlippedDeckLocation,
  getPlayerPounceCardLocation,
  getPlayerStackLocation,
} from "../shared/CardLocations";
import type SocketState from "./SocketState";
import type { BoardLayout, BoardLayoutArea } from "./BoardLayout";
import { getCardScaleMultiplier } from "./cardLayout";

export type CardLocation =
  | { type: "pounce"; cardIndex: number }
  | {
      type: "solitaire";
      pileIndex: number;
      cardIndex: number;
    }
  | { type: "flippedDeck"; cardIndex: number }
  | { type: "field_stack"; stackIndex: number; cardIndex: number }
  | { type: "deck"; cardIndex: number };

export type CardScreenGeometry = {
  area: BoardLayoutArea;
  cardScale: number;
  centerX: number;
  centerY: number;
  layoutScale: number;
  rotationDegrees: number;
  screenScale: number;
  x: number;
  y: number;
};

const FIELD_CARD_JITTER_DEGREES = 8;

export function getPosition(
  card: CardState,
  state: SocketState,
  location: CardLocation
): [number, number] {
  const playerIndex = card.player;
  switch (location.type) {
    case "field_stack":
      return getBoardPileCardLocation(
        state.board!,
        location.stackIndex,
        location.cardIndex
      );
    case "flippedDeck":
      return getPlayerFlippedDeckLocation(
        playerIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
    case "deck":
      return getPlayerDeckLocation(
        playerIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
    case "pounce":
      return getPlayerPounceCardLocation(
        playerIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
    case "solitaire":
      return getPlayerStackLocation(
        playerIndex,
        location.pileIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
  }
}

export function getCardLayoutArea(
  card: CardState,
  location: CardLocation
): BoardLayoutArea {
  return location.type === "field_stack"
    ? { type: "field" }
    : { type: "player", playerIndex: card.player };
}

export function getFieldCardRotationDegrees(
  board: BoardState,
  card: CardState,
  stackIndex: number
) {
  return (
    board.pileLocs[stackIndex][2] * 360 +
    getCardJitter(card) * FIELD_CARD_JITTER_DEGREES
  );
}

export function getCardRotationDegrees(
  board: BoardState,
  card: CardState,
  location: CardLocation,
  handJitterDegrees = 0
) {
  if (location.type === "field_stack") {
    return getFieldCardRotationDegrees(board, card, location.stackIndex);
  }
  return handJitterDegrees;
}

export function getCardScreenGeometry({
  area,
  card,
  isScaleDown,
  layout,
  location,
  position,
  rotationDegrees,
}: {
  area?: BoardLayoutArea;
  card: CardState;
  isScaleDown: boolean;
  layout: BoardLayout;
  location: CardLocation;
  position: [number, number];
  rotationDegrees: number;
}): CardScreenGeometry {
  const layoutArea = area ?? getCardLayoutArea(card, location);
  const [x, y] = layout.mapPoint(position, layoutArea);
  const layoutScale = layout.getScale(layoutArea);
  const cardScale = getCardScaleMultiplier({
    area: layoutArea,
    cardPlayer: card.player,
    fullSizePlayerIndices: layout.fullSizePlayerIndices,
    isScaleDown,
    mode: layout.mode,
  });
  const screenScale = cardScale * layoutScale;
  return {
    area: layoutArea,
    cardScale,
    centerX: x + (CARD_WIDTH * screenScale) / 2,
    centerY: y + (CARD_HEIGHT * screenScale) / 2,
    layoutScale,
    rotationDegrees,
    screenScale,
    x,
    y,
  };
}

function getCardJitter(card: CardState) {
  const suitValue =
    card.suit === "hearts"
      ? 1
      : card.suit === "spades"
      ? 2
      : card.suit === "diamonds"
      ? 3
      : 4;
  const value = card.player * 101 + card.value * 17 + suitValue * 31;
  return (((value * 9301 + 49297) % 233280) / 233280) * 2 - 1;
}
