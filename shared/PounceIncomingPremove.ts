import type { ActionRankingCandidate } from "./ActionRankingPolicy";
import {
  FIELD_PILE_AREA_SIZE,
  getApproximateCardLocation,
  getBoardPileLocation,
  getPlayerStackLocation,
} from "./CardLocations";
import { canMoveToSolitairePile, canPlayOnCenterPile, cardEquals, peek } from "./CardUtils";
import { getCurrentAIDragMove } from "./ComputerV1";
import {
  isCardCursorLocation,
  type BoardState,
  type CardState,
  type CursorState,
  type PlayerState,
} from "./GameUtils";
import { getDistance, type Move } from "./MoveHandler";

type Premove = Extract<Move, { type: "premove" }>;

export type IncomingPremoveMode = "pounce" | "pounce-when-idle" | "scoring" | "unblock";
export type IncomingPremoveSource = Premove["source"]["type"];
export type IncomingPremoveTiming = Readonly<Record<IncomingPremoveSource, number>>;

type IncomingPremoveDecision = {
  board: BoardState;
  playerIndex: number;
  candidates: readonly ActionRankingCandidate[];
  scores: readonly number[];
  hands: readonly CursorState[];
};

type IncomingPlay = { card: CardState; dragMs: number };
type Position = readonly [number, number];

export const POUNCE_INCOMING_STAGE_FEATURE_NAMES = [
  "stage.acquisition",
  "stage.predecessorDrag",
  "stage.acquisitionToDragRatio",
  "stage.matchingPredecessors",
  "stage.rivalFollowUps",
  "stage.directPounceAvailable",
  "stage.opensBlockedPounce",
] as const;

export function getPounceIncomingStageFeatures(
  { board, playerIndex, candidates, hands }: IncomingPremoveDecision,
  stagedIndex: number
): number[] {
  const move = candidates[stagedIndex]?.move;
  const player = board.players[playerIndex];
  const card = move?.type === "premove" ? getSourceCard(player, move.source) : undefined;
  if (move?.type !== "premove" || !card) return POUNCE_INCOMING_STAGE_FEATURE_NAMES.map(() => 0);

  const hand = hands[playerIndex];
  const atSource = isCardCursorLocation(hand?.location) && cardEquals(hand.location, card);
  const acquisition = atSource ? 0
    : cursorMoveTime(cursorPosition(board, hand?.location), getApproximateCardLocation(board, card));
  const incoming = getIncomingPlays(board, playerIndex, hands).filter(({ card: predecessor }) =>
    predecessor.suit === card.suit && predecessor.value + 1 === card.value);
  const drag = incoming.length ? Math.min(...incoming.map(({ dragMs }) => dragMs)) : 0;
  const rivalFollowUps = board.players.filter((rival, index) => index !== playerIndex && !rival.isSpectating &&
    [peek(rival.pounceDeck), peek(rival.flippedDeck), ...rival.stacks.map(peek)].some((rivalCard) =>
      rivalCard?.suit === card.suit && rivalCard.value === card.value)).length;
  const directPounce = candidates.some(({ move: choice }) => isPounceMove(choice));
  const pounce = peek(player.pounceDeck);
  return [
    Math.min(1, acquisition / 10000),
    Math.min(1, drag / 10000),
    incoming.length ? Math.min(2, acquisition / Math.max(750, drag)) : 0,
    Math.min(1, incoming.length / 3),
    Math.min(1, rivalFollowUps / 3),
    Number(directPounce),
    Number(pounce != null && move.source.type !== "pounce" && !directPounce &&
      opensBlockedPounce(player, move, card, pounce)),
  ];
}

/** Stages a visible card while a rival is dragging its predecessor to the center. */
export function reviewIncomingPremove(
  { board, playerIndex, candidates, scores, hands }: IncomingPremoveDecision,
  mode: IncomingPremoveMode = "pounce",
  timingScale = 1,
  sources?: readonly IncomingPremoveSource[],
  sourceTiming?: IncomingPremoveTiming
): readonly number[] | undefined {
  if (candidates.length === 0) {
    return;
  }
  const player = board.players[playerIndex];
  const hand = hands[playerIndex];
  const pounce = peek(player.pounceDeck);
  if (hand?.item) {
    return;
  }
  const usual = scores.reduce(
    (best, score, index) => score > scores[best] ? index : best,
    0
  );
  const usualMove = candidates[usual].move;
  if (isPounceMove(usualMove) || (mode === "pounce-when-idle" && isProductive(usualMove))) {
    return;
  }

  const allowsOtherSources = mode === "scoring" || mode === "unblock";
  const canAlreadyPlayPounce = pounce != null && (
    board.piles.some((pile) => canPlayOnCenterPile(pile, pounce)) ||
    player.stacks.some((stack) => canMoveToSolitairePile(pounce, stack))
  );
  const from = cursorPosition(board, hand?.location);
  let incoming: IncomingPlay[] | undefined;
  let bestIndex = -1;
  let bestPriority = Number.NEGATIVE_INFINITY;

  candidates.forEach(({ move }, index) => {
    if (move.type !== "premove" || !Number.isFinite(scores[index]) ||
        (sources && !sources.includes(move.source.type))) {
      return;
    }
    const isPounce = move.source.type === "pounce";
    if (!isPounce && !allowsOtherSources) {
      return;
    }
    const card = getSourceCard(player, move.source);
    if (!card) {
      return;
    }
    const opensPounce = mode === "unblock" && !isPounce && !canAlreadyPlayPounce &&
      pounce != null && opensBlockedPounce(player, move, card, pounce);
    if (!isPounce && !opensPounce && isProductive(usualMove)) {
      return;
    }
    incoming ??= getIncomingPlays(board, playerIndex, hands);
    const travelMs = cursorMoveTime(from, getApproximateCardLocation(board, card));
    const confidence = (isPounce ? mode === "pounce-when-idle" ? 0.42 : 0.29 : opensPounce ? 0.37 : 0.49)
      * timingScale * (sourceTiming?.[move.source.type] ?? 1);
    const readyInTime = incoming.some(({ card: predecessor, dragMs }) =>
      predecessor.suit === card.suit &&
      predecessor.value + 1 === card.value &&
      travelMs >= confidence * dragMs
    );
    const priority = (isPounce ? 3 : opensPounce ? 2.3 : 1) - travelMs / 9000;
    if (readyInTime && priority > bestPriority) {
      bestIndex = index;
      bestPriority = priority;
    }
  });

  if (bestIndex >= 0) {
    return scores.map((score, index) => index === bestIndex ? scores[usual] + 0.01 : score);
  }
}

/** Stage a direct score when the regular move would park the pounce card in the tableau. */
export function reviewPounceIncomingCenterUpgrade(
  { board, playerIndex, candidates, scores, hands }: IncomingPremoveDecision,
  staged: number,
  timingScale: number
): readonly number[] | undefined {
  const highest = Math.max(...scores);
  const chosen = candidates[scores.indexOf(highest)]?.move;
  const hand = hands[playerIndex];
  if (chosen?.type !== "c2s" || chosen.source !== "pounce" || hand?.item) return;
  const pounce = peek(board.players[playerIndex].pounceDeck);
  if (!pounce) return;
  const acquisition = isCardCursorLocation(hand?.location) && cardEquals(hand.location, pounce)
    ? 0 : cursorMoveTime(cursorPosition(board, hand?.location), getApproximateCardLocation(board, pounce));
  const isEmpty = board.players[playerIndex].stacks[chosen.dest].length === 0;
  const allowance = acquisition + (isEmpty ? 1100 : 600);
  if (!getIncomingPlays(board, playerIndex, hands).some(({ card, dragMs }) =>
    card.suit === pounce.suit && card.value + 1 === pounce.value && dragMs * timingScale <= allowance)) return;
  return scores.map((score, index) => index === staged ? highest + 1 : score);
}

function getIncomingPlays(
  board: BoardState,
  playerIndex: number,
  hands: readonly CursorState[]
): IncomingPlay[] {
  return board.players.flatMap((rival, index) => {
    const hand = hands[index];
    if (index === playerIndex || rival.isSpectating || !hand?.item) {
      return [];
    }
    const move = getCurrentAIDragMove(board, index, hand);
    if (move?.type !== "c2c" || (move.source.type === "pounce" && rival.pounceDeck.length === 1)) {
      return [];
    }
    const card = hand.item;
    const dragMs = card.value === 1 ? 0 : cursorMoveTime(
      getApproximateCardLocation(board, card),
      getBoardPileLocation(board, move.dest)
    );
    return [{ card, dragMs }];
  });
}

export function seesIncomingPredecessor(
  board: BoardState, playerIndex: number, hands: readonly CursorState[], card: CardState
): boolean {
  return getIncomingPlays(board, playerIndex, hands).some(({ card: predecessor }) =>
    predecessor.suit === card.suit && predecessor.value + 1 === card.value);
}

function getSourceCard(player: PlayerState, source: Premove["source"]): CardState | undefined {
  if (source.type === "pounce") {
    return peek(player.pounceDeck);
  }
  if (source.type === "deck") {
    return peek(player.flippedDeck);
  }
  return peek(player.stacks[source.index]);
}

function opensBlockedPounce(
  player: PlayerState,
  move: Premove,
  card: CardState,
  pounce: CardState
): boolean {
  if (pounce.suit === card.suit && pounce.value === card.value + 1) {
    return true;
  }
  return move.source.type === "solitaire" &&
    canMoveToSolitairePile(pounce, player.stacks[move.source.index].slice(0, -1));
}

function isPounceMove(move: Move): boolean {
  return (move.type === "c2c" && move.source.type === "pounce") ||
    (move.type === "c2s" && move.source === "pounce");
}

function isProductive(move: Move): boolean {
  return move.type === "c2c" || move.type === "c2s" || move.type === "s2s";
}

function cursorPosition(board: BoardState, location: CursorState["location"]): Position | undefined {
  if (!location) {
    return;
  }
  if (isCardCursorLocation(location)) {
    return getApproximateCardLocation(board, location);
  }
  if (location.type === "solitaire_slot") {
    return getPlayerStackLocation(location.player, location.pileIndex, 0);
  }
  return [
    550 + location.position[0] * FIELD_PILE_AREA_SIZE,
    50 + location.position[1] * FIELD_PILE_AREA_SIZE,
  ];
}

function cursorMoveTime(from: Position | undefined, to: Position): number {
  return from ? 750 + 3 * getDistance(from, to) : 1500;
}
