import { enumerateLegalMoves, getCurrentPointsFromCards } from "./ActionRankingPolicy";
import { canPlayOnCenterPile, peek } from "./CardUtils";
import { isGameOver, type BoardState, type CardState, type PlayerState } from "./GameUtils";
import { executeMove, type Move } from "./MoveHandler";

export type PouncePublicMove = Extract<Move, { type: "c2c" | "c2s" | "s2s" }>;
export type PouncePublicAfterstate = {
  features: number[];
  immediatePoints: number;
  finished: boolean;
};
export type PouncePublicValueModel = {
  version: 1;
  horizonAttempts: number;
  inputMean: number[];
  inputScale: number[];
  targetMean: number[];
  targetScale: number[];
  hiddenWeights: number[][];
  hiddenBiases: number[];
  outputWeights: number[][];
  outputBiases: number[];
};

const suits = ["hearts", "spades", "diamonds", "clubs"] as const;
const ranks = Array.from({ length: 13 }, (_, index) => index + 1);
export const POUNCE_PUBLIC_AFTERSTATE_TARGETS = ["terminalMargin", "shortMargin", "shortPounce"] as const;

export function isPouncePublicMove(move: Move): move is PouncePublicMove {
  return move.type === "c2c" || move.type === "c2s" || move.type === "s2s";
}

export function pounceAfterstateSource(move: PouncePublicMove): "tableau" | "pounce" | "waste" {
  if (move.type === "s2s") return "tableau";
  const source = move.type === "c2c" ? move.source.type : move.source;
  return source === "deck" ? "waste" : source === "pounce" ? "pounce" : "tableau";
}

export function getPouncePublicMoveCard(player: PlayerState, move: PouncePublicMove): CardState | undefined {
  if (move.type === "s2s") {
    const stack = player.stacks[move.source];
    return stack?.[stack.length - move.count];
  }
  if (move.type === "c2s") return peek(move.source === "pounce" ? player.pounceDeck : player.flippedDeck);
  return move.source.type === "solitaire" ? peek(player.stacks[move.source.index])
    : peek(move.source.type === "pounce" ? player.pounceDeck : player.flippedDeck);
}

export function createPouncePublicBoard(board: BoardState): BoardState {
  return {
    ...board,
    isActive: true, isPaused: false, roundStartsAt: undefined,
    piles: board.piles.map((pile) => pile.slice(-1)),
    players: board.players.map((player) => ({
      ...player,
      // Preserve counts for scoring, terminal detection and remaining-card
      // features. Hidden identities are never copied into the projection.
      deck: new Array<CardState>(player.deck.length),
      pounceDeck: publicTop(player.pounceDeck),
      flippedDeck: publicTop(player.flippedDeck),
    })),
  };
}

export function projectPouncePublicAfterstate(
  publicBoard: BoardState,
  playerIndex: number,
  move: PouncePublicMove
): PouncePublicAfterstate | undefined {
  const board = projectPouncePublicPosition(publicBoard, playerIndex, move);
  if (!board) return;
  return {
    features: getPouncePublicAfterstateFeatures(board, playerIndex),
    immediatePoints: getCurrentPointsFromCards(board.players[playerIndex]) -
      getCurrentPointsFromCards(publicBoard.players[playerIndex]),
    finished: isGameOver(board),
  };
}

/** Project a productive move on a board already reduced by createPouncePublicBoard. */
export function projectPouncePublicPosition(
  publicBoard: BoardState,
  playerIndex: number,
  move: PouncePublicMove
): BoardState | undefined {
  const player = publicBoard.players[playerIndex];
  const own: PlayerState = {
    ...player,
    stacks: player.stacks.map((pile) => pile.slice()) as PlayerState["stacks"],
    pounceDeck: player.pounceDeck.slice(),
    flippedDeck: player.flippedDeck.slice(),
  };
  const board = {
    ...publicBoard,
    players: publicBoard.players.slice(),
    piles: publicBoard.piles.slice(),
  };
  board.players[playerIndex] = own;
  if (move.type === "c2c") {
    const target = board.piles[move.dest];
    const card = getPouncePublicMoveCard(player, move);
    if (!card || !target || !canPlayOnCenterPile(target, card)) return;
    board.piles[move.dest] = target.slice();
  }
  const projectedMove = move.type === "c2c" ? { ...move, position: undefined } : move;
  if (!executeMove(board, playerIndex, projectedMove, undefined, 0)?.boardChanged) return;
  return board;
}

function publicTop(pile: CardState[]): CardState[] {
  const known = new Array<CardState>(pile.length);
  const top = peek(pile);
  if (top) known[known.length - 1] = top;
  return known;
}

export function getPouncePublicAfterstateFeatures(board: BoardState, seat: number): number[] {
  const player = board.players[seat];
  const rivals = board.players.filter((rival, index) => index !== seat && !rival.isSpectating);
  const center = board.piles.map(peek);
  const pounce = peek(player.pounceDeck);
  const waste = peek(player.flippedDeck);
  const sources = [pounce, waste, ...player.stacks.map(peek)];
  const ownEmpty = player.stacks.filter((stack) => stack.length === 0).length;
  const ownPoints = getCurrentPointsFromCards(player);
  const rivalPoints = rivals.map(getCurrentPointsFromCards);
  const rivalPounce = rivals.map((rival) => rival.pounceDeck.length);
  const ourMoves = enumerateLegalMoves(board, seat, { includeCycle: false, includeFlipDeck: false });
  const pounceToTableau = ourMoves.filter((move) => move.type === "c2s" && move.source === "pounce").length;
  const wasteToTableau = ourMoves.filter((move) => move.type === "c2s" && move.source === "deck").length;
  const merges = ourMoves.filter((move) => move.type === "s2s" && move.count === player.stacks[move.source].length &&
    player.stacks[move.dest].length > 0).length;
  const isReady = (card: CardState | undefined) =>
    card != null && board.piles.some((pile) => canPlayOnCenterPile(pile, card));
  const rivalReadyPounce = rivals.filter((rival) => isReady(peek(rival.pounceDeck)));
  const rivalReady = rivals.map((rival) =>
    [peek(rival.pounceDeck), peek(rival.flippedDeck), ...rival.stacks.map(peek)].filter(isReady).length);
  const emptyCenter = center.filter((top) => top == null).length;
  return [
    Number(rivals.length === 1), player.pounceDeck.length / 13, player.deck.length / 35,
    player.flippedDeck.length / 35, Number(!pounce && player.pounceDeck.length > 0),
    Number(!waste && player.flippedDeck.length > 0),
    ownEmpty / 4, ownPoints / 52, (ownPoints - mean(rivalPoints)) / 52,
    (ownPoints - Math.max(...rivalPoints)) / 52,
    Math.min(...rivalPounce) / 13, mean(rivalPounce) / 13, emptyCenter / board.piles.length,
    mean(rivals.map((rival) => rival.stacks.filter((stack) => stack.length === 0).length)) / 4,
    mean(rivalReady) / 6, rivalReadyPounce.length / Math.max(1, rivals.length),
    Number(rivalReadyPounce.some((rival) => rival.pounceDeck.length === 1)),
    sources.filter(isReady).length / 6, pounceToTableau / 4, wasteToTableau / 4,
    Math.min(1, merges / 8),
    ...suits.flatMap((suit) => ranks.map((rank) =>
      center.filter((top) => top?.suit === suit && top.value === rank).length / board.players.length)),
    ...sources.flatMap((card) => cardFeatures(center, emptyCenter, card)),
    ...player.stacks.flatMap((stack) => [
      stack.length / 13,
      ...cardFeatures(center, emptyCenter, stack[stack.length - 2]),
      ...cardFeatures(center, emptyCenter, stack[0]),
    ]),
  ];
}

function cardFeatures(center: (CardState | undefined)[], emptyCenter: number, card: CardState | undefined): number[] {
  if (!card) return [0, 0, 0, 0, 0, 0, 0, 0];
  let distance = emptyCenter > 0 ? card.value - 1 : 13;
  for (const top of center) {
    if (top?.suit === card.suit && top.value < card.value) {
      distance = Math.min(distance, card.value - top.value - 1);
    }
  }
  return [1, card.value / 13, ...suits.map((suit) => Number(card.suit === suit)),
    Number(distance === 0), distance / 13];
}

export function predictPouncePublicValue(model: PouncePublicValueModel, features: readonly number[]): number[] {
  const normalized = features.map((value, index) =>
    Math.max(-5, Math.min(5, (value - model.inputMean[index]) / model.inputScale[index])));
  const hidden = model.hiddenWeights.map((weights, index) =>
    Math.tanh(dot(weights, normalized) + model.hiddenBiases[index]));
  return model.outputWeights.map((weights, index) =>
    (dot(weights, hidden) + model.outputBiases[index]) * model.targetScale[index] + model.targetMean[index]);
}

function dot(one: readonly number[], other: readonly number[]): number {
  return one.reduce((sum, value, index) => sum + value * other[index], 0);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
