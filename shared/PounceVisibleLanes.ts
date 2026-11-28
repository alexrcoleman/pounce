import type { ActionRankingCandidate } from "./ActionRankingPolicy";
import { canPlayOnCenterPile, cardEquals, couldMatch, peek } from "./CardUtils";
import type { BoardState, CardState, CursorState, PlayerState, Suits } from "./GameUtils";
import type { Move } from "./MoveHandler";

const suits: readonly Suits[] = ["hearts", "spades", "diamonds", "clubs"];
const cardCount = 52;
const pivotOffsets = [-2, -1, 0, 1, 2, 3] as const;
const companionOffsets = [-1, 0, 1] as const;
const laneFields = [
  "validRank", "centerNext", "centerAtOrPast", "centerNextDelta",
  "ownPounce", "ownWaste", "ownTableau", "ownBuried", "ownAccessibleAfter",
  "rivalPounce", "rivalLastPounce", "rivalWaste", "rivalTableau", "rivalBuried", "rivalHolding",
] as const;

function laneNames(anchor: string, offsets: readonly number[]): string[] {
  return offsets.flatMap((offset) => laneFields.map((field) =>
    `lane.${anchor}.${offset > 0 ? "+" : ""}${offset}.${field}`));
}

export const POUNCE_VISIBLE_LANE_FEATURE_NAMES: readonly string[] = [
  "lane.pivot.present", "lane.pivot.rank", "lane.pivot.red",
  "lane.move.targetEmpty", "lane.move.tuck", "lane.move.cardCount",
  ...laneNames("pivot", pivotOffsets),
  "lane.exposed.present", "lane.exposed.rankOffset", "lane.exposed.sameSuit", "lane.exposed.sameColor",
  ...laneNames("exposed", companionOffsets),
  "lane.partner.present", "lane.partner.rankOffset", "lane.partner.sameSuit", "lane.partner.sameColor",
  ...laneNames("partner", companionOffsets),
];

type Availability = {
  pounce: Float64Array;
  lastPounce: Float64Array;
  waste: Float64Array;
  tableau: Float64Array;
  buried: Float64Array;
  holding: Float64Array;
};

type VisiblePosition = {
  own: Availability;
  rivals: Availability;
  centerNext: Uint16Array;
  centerAtOrPast: Uint16Array;
  centerCountsBySuit: Uint16Array;
  emptyCenters: number;
  centerCount: number;
  rivalCount: number;
};

type TopChange = { before?: CardState; after?: CardState };
type MoveProjection = {
  pivot: CardState;
  exposed?: CardState;
  partner?: CardState;
  centerBefore?: CardState;
  toCenter: boolean;
  consumesPounce: boolean;
  consumesWaste: boolean;
  targetEmpty: boolean;
  tuck: boolean;
  movedCards: number;
  tableauTops: TopChange[];
};

export type PounceVisibleLaneDecision = {
  board: BoardState;
  playerIndex: number;
  candidates: readonly Pick<ActionRankingCandidate, "move">[];
  hands?: readonly CursorState[];
};

/**
 * Returns one fixed-width row per candidate. Source cards come only from the
 * public Pounce top, waste top, tableau, and center. A stock advance and the
 * face-down card under an unloaded Pounce card have no projected identity.
 */
export function getPounceVisibleLaneFeatures({
  board, playerIndex, candidates, hands,
}: PounceVisibleLaneDecision): number[][] {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) return candidates.map(() => neutral());
  const position = indexVisiblePosition(board, playerIndex, hands);
  return candidates.map(({ move }) => {
    const projection = projectMove(board, player, move);
    if (!projection) return neutral();
    const { pivot, exposed, partner, targetEmpty, tuck, movedCards } = projection;
    return [
      1, (pivot.value - 1) / 12, Number(isRed(pivot)),
      Number(targetEmpty), Number(tuck), Math.min(13, movedCards) / 13,
      ...encodeLanes(position, projection, pivot, pivotOffsets),
      ...companionFeatures(pivot, exposed),
      ...encodeLanes(position, projection, exposed, companionOffsets),
      ...companionFeatures(pivot, partner),
      ...encodeLanes(position, projection, partner, companionOffsets),
    ];
  });
}

function neutral(length = POUNCE_VISIBLE_LANE_FEATURE_NAMES.length): number[] {
  return new Array<number>(length).fill(0);
}

function availability(): Availability {
  return {
    pounce: new Float64Array(cardCount),
    lastPounce: new Float64Array(cardCount),
    waste: new Float64Array(cardCount),
    tableau: new Float64Array(cardCount),
    buried: new Float64Array(cardCount),
    holding: new Float64Array(cardCount),
  };
}

function indexVisiblePosition(
  board: BoardState,
  playerIndex: number,
  hands: readonly CursorState[] | undefined
): VisiblePosition {
  const own = availability();
  const rivals = availability();
  let rivalCount = 0;
  board.players.forEach((player, index) => {
    if (player.isSpectating) return;
    const observed = index === playerIndex ? own : rivals;
    if (index !== playerIndex) rivalCount++;
    const held = hands?.[index]?.item;
    const record = (card: CardState | undefined, source: "pounce" | "waste" | "tableau") => {
      if (!card) return;
      const id = cardIndex(card.suit, card.value);
      observed[source][id]++;
      if (source === "pounce" && player.pounceDeck.length === 1) observed.lastPounce[id]++;
      // Check the held identity only against visible, individually playable cards.
      if (cardEquals(card, held)) observed.holding[id]++;
    };
    record(peek(player.pounceDeck), "pounce");
    record(peek(player.flippedDeck), "waste");
    for (const stack of player.stacks) {
      record(peek(stack), "tableau");
      for (let index = 0; index < stack.length - 1; index++) {
        const card = stack[index];
        observed.buried[cardIndex(card.suit, card.value)] += 1 / (stack.length - 1 - index);
      }
    }
  });

  const centerNext = new Uint16Array(cardCount);
  const centerAtOrPast = new Uint16Array(cardCount);
  const centerCountsBySuit = new Uint16Array(suits.length);
  let emptyCenters = 0;
  for (const pile of board.piles) {
    const top = peek(pile);
    if (!top) {
      emptyCenters++;
      continue;
    }
    centerCountsBySuit[suits.indexOf(top.suit)]++;
    if (top.value < 13) centerNext[cardIndex(top.suit, top.value + 1)]++;
    for (let value = 1; value <= top.value; value++) {
      centerAtOrPast[cardIndex(top.suit, value)]++;
    }
  }
  return { own, rivals, centerNext, centerAtOrPast, centerCountsBySuit,
    emptyCenters, centerCount: board.piles.length, rivalCount };
}

function projectMove(board: BoardState, player: PlayerState, move: Move): MoveProjection | undefined {
  let pivot: CardState | undefined;
  let exposed: CardState | undefined;
  let partner: CardState | undefined;
  let centerBefore: CardState | undefined;
  let toCenter = false;
  let consumesPounce = false;
  let consumesWaste = false;
  let targetEmpty = false;
  let tuck = false;
  let movedCards = 1;
  const tableauTops: TopChange[] = [];

  if (move.type === "c2c" || move.type === "premove") {
    const source = move.source;
    const pile = source.type === "solitaire" ? player.stacks[source.index] : undefined;
    pivot = source.type === "pounce" ? peek(player.pounceDeck)
      : source.type === "deck" ? peek(player.flippedDeck)
      : pile && peek(pile);
    if (move.type === "c2c" && pivot) {
      const destination = board.piles[move.dest];
      if (destination && canPlayOnCenterPile(destination, pivot)) {
        toCenter = true;
        centerBefore = peek(destination);
        targetEmpty = centerBefore == null;
        consumesPounce = source.type === "pounce";
        consumesWaste = source.type === "deck";
        if (pile) {
          exposed = pile[pile.length - 2];
          tableauTops.push({ before: pivot, after: exposed });
        }
      }
    }
    if (move.type === "premove") movedCards = 0;
  } else if (move.type === "c2s") {
    const destination = player.stacks[move.dest];
    pivot = move.source === "pounce" ? peek(player.pounceDeck) : peek(player.flippedDeck);
    if (pivot && destination) {
      const top = peek(destination);
      const bottom = destination[0];
      tuck = bottom != null && pivot.value === bottom.value + 1 && couldMatch(pivot, bottom);
      partner = tuck ? bottom : top;
      targetEmpty = top == null;
      consumesPounce = move.source === "pounce";
      consumesWaste = move.source === "deck";
      if (!tuck) tableauTops.push({ before: top, after: pivot });
    }
  } else if (move.type === "s2s") {
    const source = player.stacks[move.source];
    const destination = player.stacks[move.dest];
    if (!source || !destination || move.count < 1 || move.count > source.length) return;
    const boundary = source.length - move.count;
    pivot = source[boundary];
    exposed = source[boundary - 1];
    partner = peek(destination);
    targetEmpty = partner == null;
    movedCards = move.count;
    tableauTops.push({ before: peek(source), after: exposed }, { before: partner, after: peek(source) });
  }
  return pivot && { pivot, exposed, partner, centerBefore, toCenter, consumesPounce,
    consumesWaste, targetEmpty, tuck, movedCards, tableauTops };
}

function companionFeatures(pivot: CardState, card: CardState | undefined): number[] {
  return card ? [1, (card.value - pivot.value) / 12,
    Number(card.suit === pivot.suit), Number(isRed(card) === isRed(pivot))] : neutral(4);
}

function encodeLanes(
  position: VisiblePosition,
  projection: MoveProjection,
  anchor: CardState | undefined,
  offsets: readonly number[]
): number[] {
  if (!anchor) return neutral(offsets.length * laneFields.length);
  const { own, rivals, centerCountsBySuit, emptyCenters, centerCount, rivalCount } = position;
  const suit = anchor.suit;
  const sameSuitCenters = centerCountsBySuit[suits.indexOf(suit)];
  const rivalsScale = Math.max(1, rivalCount);
  return offsets.flatMap((offset) => {
    const rank = anchor.value + offset;
    if (rank < 1 || rank > 13) return neutral(laneFields.length);
    const index = cardIndex(suit, rank);
    const centerScale = Math.max(1, rank === 1 ? centerCount : rivalCount + 1, sameSuitCenters);
    const next = rank === 1 ? emptyCenters : position.centerNext[index];
    let nextDelta = 0;
    if (projection.toCenter) {
      nextDelta = Number(projection.pivot.suit === suit && projection.pivot.value + 1 === rank)
        - Number(projection.centerBefore
          ? projection.centerBefore.suit === suit && projection.centerBefore.value + 1 === rank
          : rank === 1);
    }
    const tableauDelta = projection.tableauTops.reduce((delta, { before, after }) =>
      delta + Number(matches(after, suit, rank)) - Number(matches(before, suit, rank)), 0);
    const accessibleAfter = own.tableau[index] + tableauDelta > 0 ||
      (own.pounce[index] > 0 && !projection.consumesPounce) ||
      (own.waste[index] > 0 && !projection.consumesWaste);
    return [
      1, next / centerScale, position.centerAtOrPast[index] / Math.max(1, rivalCount + 1, sameSuitCenters),
      nextDelta / centerScale,
      Math.min(1, own.pounce[index]), Math.min(1, own.waste[index]), Math.min(1, own.tableau[index]),
      Math.min(1, own.buried[index]), Number(accessibleAfter),
      Math.min(1, rivals.pounce[index] / rivalsScale), Math.min(1, rivals.lastPounce[index] / rivalsScale),
      Math.min(1, rivals.waste[index] / rivalsScale), Math.min(1, rivals.tableau[index] / rivalsScale),
      Math.min(1, rivals.buried[index] / rivalsScale), Math.min(1, rivals.holding[index] / rivalsScale),
    ];
  });
}

function cardIndex(suit: Suits, rank: number): number {
  return suits.indexOf(suit) * 13 + rank - 1;
}

function matches(card: CardState | undefined, suit: Suits, rank: number): boolean {
  return card?.suit === suit && card.value === rank;
}

function isRed(card: CardState): boolean {
  return card.suit === "hearts" || card.suit === "diamonds";
}
