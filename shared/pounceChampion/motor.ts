import { getAISpeedMultiplier, MAX_AI_LEVEL } from "../AIDifficulty";
import { FIELD_PILE_AREA_SIZE, getBoardPileLocation, getPlayerDeckLocation, getPlayerFlippedDeckLocation,
  getPlayerPounceCardLocation, getPlayerStackLocation } from "../CardLocations";
import { cardEquals, peek } from "../CardUtils";
import { isCardCursorLocation, type BoardState, type CursorLocation, type CursorState } from "../GameUtils";
import { getDistance, type Move } from "../MoveHandler";
import { getPouncePublicMoveCard } from "../PouncePublicAfterstate";

type Point = readonly [number, number];
export type PounceMotorMove = Extract<Move, { type: "cycle" | "c2c" | "c2s" | "s2s" }>;
export type PounceMotorGeometry = { legs: (number | null)[]; atSource: boolean; holding: boolean };
type CursorAnchor = { point?: Point; atSource?: boolean; overDestination?: boolean };

export function isPounceMotorMove(move: Move): move is PounceMotorMove {
  return move.type === "cycle" || move.type === "c2c" || move.type === "c2s" || move.type === "s2s";
}

/** Use a supplied anchor for a private stock cursor whose geometry is already known. */
export function getPounceActionMotorGeometry(board: BoardState, seat: number, move: PounceMotorMove,
  hand: CursorState | undefined, anchor?: CursorAnchor): PounceMotorGeometry | undefined {
  const player = board.players[seat];
  const card = move.type === "cycle" ? (player.deck.length ? undefined : peek(player.flippedDeck)) :
    getPouncePublicMoveCard(player, move);
  const source = move.type === "cycle" && player.deck.length ?
    getPlayerDeckLocation(seat, player.deck.length - Math.min(3, player.deck.length)) :
    card ? getPouncePublicCursorPoint(board, card) : undefined;
  if (!source) return;
  if (hand?.item && !cardEquals(hand.item, card)) return;
  const atSource = anchor?.atSource ?? (isCardCursorLocation(hand?.location) && cardEquals(hand.location, card));
  const current = anchor?.point ?? getPouncePublicCursorPoint(board, hand?.location);
  const holding = hand?.item != null;
  const legs: PounceMotorGeometry["legs"] = [];
  if (!holding && !atSource) legs.push(current ? getDistance(current, source) : null);
  const destination = move.type === "cycle" || (move.type === "c2c" && card?.value === 1) ? undefined :
    move.type === "c2c" ? getBoardPileLocation(board, move.dest) :
    getPlayerStackLocation(seat, move.dest, Math.max(0, player.stacks[move.dest].length - 1));
  const over = anchor?.overDestination ?? (holding && isOverDestination(board, seat, move, hand?.location));
  if (destination && !over) {
    const from = holding ? current : source;
    legs.push(from ? getDistance(from, destination) : null);
  }
  return { legs, atSource, holding };
}

export function getPouncePublicCursorPoint(board: BoardState, location?: CursorLocation | null): Point | undefined {
  if (!location) return;
  if (!isCardCursorLocation(location)) return location.type === "solitaire_slot" ?
    getPlayerStackLocation(location.player, location.pileIndex, 0) :
    [550 + location.position[0] * FIELD_PILE_AREA_SIZE, 50 + location.position[1] * FIELD_PILE_AREA_SIZE];
  const center = board.piles.findIndex((pile) => pile.some((card) => cardEquals(card, location)));
  if (center >= 0) return getBoardPileLocation(board, center);
  const player = board.players[location.player];
  if (!player) return;
  for (let column = 0; column < player.stacks.length; column++) {
    const index = player.stacks[column].findIndex((card) => cardEquals(card, location));
    if (index >= 0) return getPlayerStackLocation(location.player, column, index);
  }
  if (cardEquals(peek(player.pounceDeck), location)) return getPlayerPounceCardLocation(location.player, player.pounceDeck.length - 1);
  if (cardEquals(peek(player.flippedDeck), location)) return getPlayerFlippedDeckLocation(location.player, player.flippedDeck.length - 1);
}

function isOverDestination(board: BoardState, seat: number, move: PounceMotorMove, location?: CursorLocation | null) {
  if (!location || move.type === "cycle") return false;
  if (move.type === "c2c") return isCardCursorLocation(location) && cardEquals(location, peek(board.piles[move.dest]));
  if (isCardCursorLocation(location)) return board.players[seat].stacks[move.dest].some((card) => cardEquals(location, card));
  return location.type === "solitaire_slot" && location.player === seat && location.pileIndex === move.dest;
}

/** An idle decision runs at its due time. Charge recovery only following a prior commit. */
export function getPounceMotorMeanMs(geometry: PounceMotorGeometry, aiLevel = MAX_AI_LEVEL, timescale = 1) {
  return geometry.legs.reduce<number>((sum, distance) => sum + (distance == null ? 1500 : 750 + 3 * distance), 0) /
    getAISpeedMultiplier(aiLevel) / timescale;
}

export function getPounceMotorRecoveryMs(aiLevel = MAX_AI_LEVEL, timescale = 1) {
  return 3500 / getAISpeedMultiplier(aiLevel) / timescale;
}
