import type { ActionRankingCandidate } from "./ActionRankingPolicy";
import { canPlayOnCenterPile, cardEquals, peek } from "./CardUtils";
import {
  FIELD_PILE_AREA_SIZE,
  getBoardPileLocation,
  getPlayerDeckLocation,
  getPlayerFlippedDeckLocation,
  getPlayerPounceCardLocation,
  getPlayerStackLocation,
} from "./CardLocations";
import {
  cursorLocationsEqual,
  isCardCursorLocation,
  type BoardState,
  type CardState,
  type CursorLocation,
  type CursorState,
  type PlayerState,
} from "./GameUtils";
import type { Move } from "./MoveHandler";

export const POUNCE_TIMING_FEATURE_NAMES = [
  "timing.cursorToSource",
  "timing.sourceToDestination",
  "timing.atSource",
  "timing.holdingSource",
  "timing.holdingAtDestination",
  "timing.ownArrival",
  "timing.contention",
  "timing.rivalHoldingAtDestination",
  "timing.minCompetingArrival",
  "timing.arrivalAdvantage",
] as const;

type Point = readonly [number, number];
type Source = {
  card?: CardState;
  point: Point;
};
type Destination = {
  point: Point;
  location?: CursorLocation;
  centerPile?: CardState[];
  skipsDrag?: boolean;
};
type TimingHand = { hand: CursorState | undefined; point?: Point };
type Rival = TimingHand & { sources: Source[] };
type TimingDecision = {
  board: BoardState;
  playerIndex: number;
  hands: readonly CursorState[];
  candidates: readonly Pick<ActionRankingCandidate, "move">[];
};

const MAX_ARRIVAL_MS = 10000;
const UNKNOWN_CURSOR_MS = 1500;
const HELD_OTHER_CARD_MS = 2000;

/**
 * Estimate relative cursor travel and center contention from the board and
 * cursor snapshot available to the scorer. The estimates omit server cooldowns
 * and never consult face-down card identities.
 */
export function getPounceTimingFeatures({
  board,
  playerIndex,
  hands,
  candidates,
}: TimingDecision): number[][] {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) return candidates.map(() => emptyFeatures());
  const centerPoints = board.piles.map((_, index) => getBoardPileLocation(board, index));
  const positionedCards = new Map<number, Point>();
  board.piles.forEach((pile, index) => {
    const card = peek(pile);
    if (card) positionedCards.set(cardKey(card), centerPoints[index]);
  });
  board.players.forEach((seat, index) => {
    visibleSources(seat, index).forEach(({ card, point }) => {
      if (card) positionedCards.set(cardKey(card), point);
    });
    seat.stacks.forEach((stack, stackIndex) => {
      stack.forEach((card, cardIndex) => {
        positionedCards.set(cardKey(card), getPlayerStackLocation(index, stackIndex, cardIndex));
      });
    });
  });

  const positionedHand = (seat: number): TimingHand => ({
    hand: hands[seat],
    point: handPoint(hands[seat]?.location, positionedCards),
  });
  const own = positionedHand(playerIndex);
  const rivals = board.players.flatMap((seat, index): Rival[] => {
    if (index === playerIndex || seat.isSpectating) return [];
    const hand = positionedHand(index);
    const sources = visibleSources(seat, index).filter((source) => source.card != null);
    const held = hand.hand?.item;
    if (held && hand.point && !sources.some(({ card }) => cardEquals(card, held))) {
      // A delayed board can still show the old source. Use the position
      // reported by the cursor for the newly visible held card.
      sources.push({ card: held, point: hand.point });
    }
    return [{ ...hand, sources }];
  });

  return candidates.map(({ move }) => {
    const source = moveSource(player, playerIndex, move);
    if (!source) return emptyFeatures();
    const destination = moveDestination(board, player, playerIndex, move, centerPoints);
    const ownMotion = estimateTravel(own, source, destination);
    const contest = destination?.centerPile
      ? getContest(rivals, destination, destination.centerPile)
      : undefined;
    const arrival = contest?.arrival;
    return [
      normalizeMs(ownMotion.acquire),
      normalizeMs(ownMotion.fullDrag),
      Number(ownMotion.atSource),
      Number(ownMotion.holding),
      Number(ownMotion.atDestination),
      normalizeMs(ownMotion.arrival),
      contest == null ? 0 : contest.count / Math.max(1, rivals.length),
      Number(contest?.holdingAtDestination ?? false),
      arrival == null ? 1 : normalizeMs(arrival),
      arrival == null ? 0 : Math.max(-1, Math.min(1, (arrival - ownMotion.arrival) / MAX_ARRIVAL_MS)),
    ];
  });
}

function visibleSources(player: PlayerState, seat: number): Source[] {
  return [
    pounceSource(player, seat),
    wasteSource(player, seat),
    ...player.stacks.map((stack, index) => ({
      card: peek(stack),
      point: getPlayerStackLocation(seat, index, Math.max(0, stack.length - 1)),
    })),
  ];
}

function moveSource(player: PlayerState, seat: number, move: Move): Source | undefined {
  if (move.type === "c2c" || move.type === "premove") {
    if (move.source.type === "pounce") return pounceSource(player, seat);
    if (move.source.type === "deck") return wasteSource(player, seat);
    return stackSource(player, seat, move.source.index, 1);
  }
  if (move.type === "c2s") {
    return move.source === "pounce" ? pounceSource(player, seat) : wasteSource(player, seat);
  }
  if (move.type === "s2s") {
    return stackSource(player, seat, move.source, move.count);
  }
  if (move.type === "cycle") {
    if (player.deck.length > 0) {
      return { point: getPlayerDeckLocation(seat, Math.max(0, player.deck.length - 3)) };
    }
    if (player.flippedDeck.length > 0) return wasteSource(player, seat);
  }
}

function pounceSource(player: PlayerState, index: number): Source {
  return {
    card: peek(player.pounceDeck),
    point: getPlayerPounceCardLocation(index, Math.max(0, player.pounceDeck.length - 1)),
  };
}

function wasteSource(player: PlayerState, index: number): Source {
  return {
    card: peek(player.flippedDeck),
    point: getPlayerFlippedDeckLocation(index, Math.max(0, player.flippedDeck.length - 1)),
  };
}

function stackSource(player: PlayerState, seat: number, index: number, count: number): Source | undefined {
  const stack = player.stacks[index];
  const bottom = stack ? stack.length - count : -1;
  if (bottom < 0 || !stack[bottom]) return;
  return { card: stack[bottom], point: getPlayerStackLocation(seat, index, bottom) };
}

function moveDestination(
  board: BoardState,
  player: PlayerState,
  seat: number,
  move: Move,
  centerPoints: readonly Point[]
): Destination | undefined {
  if (move.type === "c2c") {
    const pile = board.piles[move.dest];
    if (!pile) return;
    const top = peek(pile);
    return {
      point: centerPoints[move.dest],
      location: top ?? { type: "field_slot", position: [board.pileLocs[move.dest][0], board.pileLocs[move.dest][1]] },
      centerPile: pile,
      skipsDrag: top == null,
    };
  }
  if (move.type === "c2s" || move.type === "s2s") {
    const stack = player.stacks[move.dest];
    if (!stack) return;
    return {
      point: getPlayerStackLocation(seat, move.dest, Math.max(0, stack.length - 1)),
      location: peek(stack) ?? { type: "solitaire_slot", player: seat, pileIndex: move.dest },
    };
  }
}

function estimateTravel(cursor: TimingHand, source: Source, target?: Destination) {
  const { hand, point } = cursor;
  const holding = source.card != null && cardEquals(hand?.item, source.card);
  const location = hand?.location;
  const atSource = source.card != null && isCardCursorLocation(location) && cardEquals(location, source.card);
  const atDestination = holding && target?.location != null && cursorLocationsEqual(location, target.location);
  const acquire = holding || atSource ? 0 : moveMs(point, source.point);
  const fullDrag = !target || target.skipsDrag ? 0 : moveMs(source.point, target.point);
  const drag = !target || atDestination || (!holding && target.skipsDrag)
    ? 0 : holding ? moveMs(point ?? source.point, target.point) : fullDrag;
  const switching = hand?.item != null && !holding ? HELD_OTHER_CARD_MS : 0;
  return { atSource, holding, atDestination, acquire, fullDrag, arrival: acquire + drag + switching };
}

function getContest(rivals: readonly Rival[], destination: Destination, pile: CardState[]) {
  let count = 0;
  let arrival: number | undefined;
  let holdingAtDestination = false;
  for (const rival of rivals) {
    let competing = false;
    for (const source of rival.sources) {
      if (!source.card || !canPlayOnCenterPile(pile, source.card)) continue;
      const motion = estimateTravel(rival, source, destination);
      competing = true;
      holdingAtDestination ||= motion.atDestination;
      arrival = Math.min(arrival ?? Infinity, motion.arrival);
    }
    count += Number(competing);
  }
  return { count, arrival, holdingAtDestination };
}

function handPoint(location: CursorLocation | null | undefined, cards: ReadonlyMap<number, Point>): Point | undefined {
  if (!location) return;
  if (isCardCursorLocation(location)) return cards.get(cardKey(location));
  if (location.type === "solitaire_slot") {
    return getPlayerStackLocation(location.player, location.pileIndex, 0);
  }
  return [550 + location.position[0] * FIELD_PILE_AREA_SIZE, 50 + location.position[1] * FIELD_PILE_AREA_SIZE];
}

function moveMs(from: Point | undefined, to: Point): number {
  return from == null ? UNKNOWN_CURSOR_MS : 750 + 3 * Math.hypot(from[0] - to[0], from[1] - to[1]);
}

function cardKey(card: CardState): number {
  const suit = card.suit === "hearts" ? 0 : card.suit === "spades" ? 1 : card.suit === "diamonds" ? 2 : 3;
  return 64 * card.player + 13 * suit + card.value;
}

function normalizeMs(ms: number): number {
  return Math.min(1, ms / MAX_ARRIVAL_MS);
}

function emptyFeatures(): number[] {
  return [0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
}
