import { getActionRankingMoveKey, type ActionRankingCandidate } from "./ActionRankingPolicy";
import {
  FIELD_PILE_AREA_SIZE,
  getApproximateCardLocation,
  getBoardPileLocation,
  getPlayerDeckLocation,
  getPlayerFlippedDeckLocation,
  getPlayerPounceCardLocation,
  getPlayerStackLocation,
} from "./CardLocations";
import { canMoveToSolitairePile, cardEquals, couldMatch } from "./CardUtils";
import { getNearestEmptyCenterPileToBoardCenter } from "./CenterPileUtils";
import { isCardCursorLocation, type BoardState, type CardState, type CursorState, type Suits, type Values } from "./GameUtils";
import type { Move } from "./MoveHandler";

type Location = readonly [number, number];
type KnownCard = CardState | undefined;
type CenterSource = Extract<Move, { type: "c2c" }>["source"];
type Source = Exclude<CenterSource, { type: "solitaire" }> | { type: "solitaire"; index: number; count?: number };
type Position = {
  center: KnownCard[];
  stacks: CardState[][];
  pounce: KnownCard;
  pounceCount: number;
  stock: KnownCard[];
  waste: KnownCard[];
  cursor?: Location;
  cursorCard?: KnownCard;
};
type OpponentCard = {
  card: CardState;
  pounce: boolean;
  pounceCount: number;
  canTuckPounce: boolean;
  cursorTime: number;
  position: Location;
  holding: boolean;
  heldElsewhere: boolean;
  after?: KnownCard;
};
type PlanningContext = {
  playerIndex: number;
  centerLocations: readonly Location[];
  emptyCenterIndex: number;
  opponents: readonly OpponentCard[];
  opponentCount: number;
  maxBranches: number;
  slotWeight: number;
  raceWeight: number;
  tempoWeight: number;
  discountTime: number;
  followRaceWeight: number;
  initialCenter: readonly KnownCard[];
  pounceGoalPointTime: number;
  pounceGoalCycleOnly: boolean;
  forecastWeight: number;
  nextPounceWeight: number;
  rankAvailability: Float64Array;
  possiblePounce: readonly CardState[];
};
type Step = {
  after: Position;
  gain: number;
  elapsed: number;
  unknownReveal: boolean;
  move: Move;
};
type PlannerOptions = {
  depth?: number;
  maxBranches?: number;
  slotWeight?: number;
  raceWeight?: number;
  tempoWeight?: number;
  discountTime?: number;
  followRaceWeight?: number;
  pounceGoalDepth?: number;
  pounceGoalPointTime?: number;
  pounceGoalCycleOnly?: boolean;
  forecastWeight?: number;
  nextPounceWeight?: number;
  stock?: readonly KnownCard[];
  waste?: readonly KnownCard[];
};

export type PouncePlanValue = {
  value: number;
  immediate: number;
  horizon: number;
  planned: boolean;
  pounceRoute?: PounceRoute;
};
export type PounceRoute = {
  time: number;
  moves: number;
  centerPlays: number;
  actionKeys: readonly string[];
};

const discountTime = 13000;
const roomCommitTime = 3500;
const suits: readonly Suits[] = ["hearts", "spades", "diamonds", "clubs"];

/**
 * Plan productive moves with the currently visible tableau and card identities
 * previously observed in our reserve. Unobserved reserve and Pounce identities
 * end that part of a line, while other lines can still use the visible cards.
 */
export function evaluatePouncePlans(
  board: BoardState,
  playerIndex: number,
  candidates: readonly ActionRankingCandidate[],
  hands: readonly CursorState[],
  options: PlannerOptions = {}
): PouncePlanValue[] {
  const player = board.players[playerIndex];
  const ownHand = hands[playerIndex];
  const position: Position = {
    center: board.piles.map(peek),
    stacks: player.stacks,
    pounce: peek(player.pounceDeck),
    pounceCount: player.pounceDeck.length,
    stock: matchingKnowledge(options.stock, player.deck.length),
    waste: matchingKnowledge(options.waste, player.flippedDeck.length),
    cursor: handLocation(board, ownHand),
    cursorCard: isCardCursorLocation(ownHand?.location) ? ownHand.location : undefined,
  };
  if (position.waste.length > 0) {
    position.waste[position.waste.length - 1] = peek(player.flippedDeck);
  }
  const opponents = readOpponents(board, playerIndex, hands);
  const forecastWeight = options.forecastWeight ?? 0;
  const nextPounceWeight = options.nextPounceWeight ?? 0;
  const context: PlanningContext = {
    playerIndex,
    centerLocations: board.piles.map((_, index) => getBoardPileLocation(board, index)),
    emptyCenterIndex: getNearestEmptyCenterPileToBoardCenter(board),
    opponents,
    opponentCount: board.players.filter((other, index) => index !== playerIndex && !other.isSpectating).length,
    maxBranches: options.maxBranches ?? 3,
    slotWeight: options.slotWeight ?? 1.2,
    raceWeight: options.raceWeight ?? 1,
    tempoWeight: options.tempoWeight ?? 0.12,
    discountTime: options.discountTime ?? discountTime,
    followRaceWeight: options.followRaceWeight ?? 0,
    initialCenter: position.center,
    pounceGoalPointTime: options.pounceGoalPointTime ?? 2400,
    pounceGoalCycleOnly: options.pounceGoalCycleOnly ?? false,
    forecastWeight,
    nextPounceWeight,
    rankAvailability: forecastWeight > 0 ? getRankAvailability(position, opponents) : new Float64Array(0),
    possiblePounce: nextPounceWeight > 0 ? getPossiblePounce(board, playerIndex, position) : [],
  };
  const depth = options.depth ?? 3;
  const initialUtility = utility(position, context);
  const initialKey = positionKey(position);
  const seen = new Set([initialKey]);
  const goalDepth = options.pounceGoalDepth ?? 0;
  const routes = new Map<string, PounceRoute | undefined>();
  const aces = new Map<string, PouncePlanValue>();
  return candidates.map((candidate) => {
    const move = candidate.move;
    const ace = move.type === "c2c" && getSourceCard(position, move.source)?.value === 1;
    const cached = ace ? aces.get(candidate.equivalenceKey) : undefined;
    if (cached) {
      const route = cached.pounceRoute;
      return route ? {
        ...cached,
        pounceRoute: { ...route, actionKeys: [candidate.key, ...route.actionKeys.slice(1)] },
      } : cached;
    }
    const step = evaluateStep(position, move, context, initialUtility, true);
    if (!step) {
      return { value: 0, immediate: 0, horizon: 0, planned: false };
    }
    const value = extend(step, context, depth, seen);
    const pounceRoute = goalDepth > 0 && (!context.pounceGoalCycleOnly || move.type !== "flip_deck")
      ? findPounceRoute(step, context, goalDepth, position.pounceCount, routes)
      : undefined;
    const result = { value, immediate: step.gain, horizon: value - step.gain, planned: true, pounceRoute };
    if (ace) aces.set(candidate.equivalenceKey, result);
    return result;
  });
}

/** Exclude a destination only if the rival is already over it with the matching card. */
export function getLateCenterRaces(
  board: BoardState,
  playerIndex: number,
  candidates: readonly ActionRankingCandidate[],
  hands: readonly CursorState[],
  opponentTimingRatio = 1.1
): number[] {
  if (!hands.some((hand, index) => index !== playerIndex && hand.item)) return [];
  const player = board.players[playerIndex];
  const hand = hands[playerIndex];
  const location = handLocation(board, hand);
  const rivals = readOpponents(board, playerIndex, hands).filter((card) => card.holding);
  if (rivals.length === 0) return [];
  return candidates.flatMap(({ move }, index) => {
    if (move.type !== "c2c") return [];
    const { source, dest } = move;
    const top = peek(board.piles[dest]);
    if (!top) return [];
    const card = source.type === "pounce" ? peek(player.pounceDeck)
      : source.type === "deck" ? peek(player.flippedDeck) : peek(player.stacks[source.index]);
    if (!card || hand?.item) return [];
    const enemy = rivals.find((rival) => {
      const enemyTarget = hands[rival.card.player]?.location;
      return rival.card.suit === card.suit && rival.card.value === card.value &&
        isCardCursorLocation(enemyTarget) && cardEquals(enemyTarget, top);
    });
    if (!enemy) return [];
    const target = getBoardPileLocation(board, dest);
    const origin = source.type === "pounce" ? getPlayerPounceCardLocation(playerIndex, player.pounceDeck.length - 1)
      : source.type === "deck" ? getPlayerFlippedDeckLocation(playerIndex, player.flippedDeck.length - 1)
      : getPlayerStackLocation(playerIndex, source.index, player.stacks[source.index].length - 1);
    const atSource = isCardCursorLocation(hand?.location) && cardEquals(hand.location, card);
    const ownTime = (atSource ? 0 : cursorTime(location, origin)) + cursorTime(origin, target);
    const enemyFullDragTime = cursorTime(enemy.position, target);
    return ownTime > opponentTimingRatio * enemyFullDragTime ? [index] : [];
  });
}

/** Seek the quickest way to unload the current Pounce card, counting every drag. */
function findPounceRoute(
  step: Step,
  context: PlanningContext,
  depth: number,
  pounceCount: number,
  routes: Map<string, PounceRoute | undefined>
): PounceRoute | undefined {
  const centerPlays = Number(step.move.type === "c2c");
  if (step.after.pounceCount < pounceCount) {
    return { time: step.elapsed - roomCommitTime, moves: 1, centerPlays,
      actionKeys: [getActionRankingMoveKey(step.move)] };
  }
  if (depth <= 1 || step.unknownReveal) return;
  const key = positionKey(step.after);
  const cursorKey = step.after.cursor?.map((coordinate) => Math.round(coordinate)).join(".") ?? "";
  const cacheKey = `${depth}:${key}:${cursorKey}:${cardKey(step.after.cursorCard)}`;
  if (!routes.has(cacheKey)) {
    let best: PounceRoute | undefined;
    for (const move of listMoves(step.after, !context.pounceGoalCycleOnly)) {
      const next = evaluateStep(step.after, move, context, 0, false, true);
      if (!next) continue;
      // A nonterminal move spends its commit time. The final move may have
      // zero cursor travel and earn one center bonus. For an ordinary cycle
      // route with nonnegative intermediate costs, longer continuations cannot
      // beat a route already cheaper than that lower bound.
      if (context.pounceGoalCycleOnly && best && next.after.pounceCount === pounceCount &&
          context.pounceGoalPointTime >= 0 && context.pounceGoalPointTime <= roomCommitTime &&
          next.elapsed - context.pounceGoalPointTime * (1 + Number(move.type === "c2c")) >=
            pounceRouteTime(best, context.pounceGoalPointTime)) continue;
      const route = findPounceRoute(next, context, depth - 1, pounceCount, routes);
      if (route && (!best || pounceRouteTime(route, context.pounceGoalPointTime) <
          pounceRouteTime(best, context.pounceGoalPointTime))) {
        best = route;
      }
    }
    routes.set(cacheKey, best);
  }
  const best = routes.get(cacheKey);
  if (!best) return;
  return { time: step.elapsed + best.time, moves: best.moves + 1,
    centerPlays: centerPlays + best.centerPlays,
    actionKeys: [getActionRankingMoveKey(step.move), ...best.actionKeys] };
}

export function pounceRouteTime(route: PounceRoute, pointTime = 2400): number {
  return route.time - pointTime * route.centerPlays;
}

function matchingKnowledge(cards: readonly KnownCard[] | undefined, length: number): KnownCard[] {
  return cards?.length === length ? Array.from(cards) : Array<KnownCard>(length).fill(undefined);
}

function extend(
  step: Step,
  context: PlanningContext,
  depth: number,
  seen: Set<string>,
  previousTime = 0
): number {
  if (depth <= 1 || step.after.pounceCount === 0 || step.unknownReveal) {
    return step.gain;
  }
  const next = step.after;
  const key = positionKey(next);
  if (seen.has(key)) return step.gain;
  seen.add(key);
  const status = utility(next, context);
  const startTime = previousTime + step.elapsed;
  const steps = listMoves(next).flatMap((move) => {
    const nextStep = evaluateStep(next, move, context, status, false, false, startTime);
    return nextStep && (nextStep.unknownReveal || !seen.has(positionKey(nextStep.after)))
      ? [nextStep] : [];
  });
  steps.sort((left, right) => right.gain - left.gain);
  let best = 0;
  for (const nextStep of steps.slice(0, context.maxBranches)) {
    best = Math.max(best, extend(nextStep, context, depth - 1, seen, startTime));
  }
  seen.delete(key);
  return step.gain + Math.exp(-step.elapsed / context.discountTime) * best;
}

function evaluateStep(
  before: Position,
  move: Move,
  context: PlanningContext,
  beforeUtility: number,
  isRoot: boolean,
  timeOnly = false,
  previousTime = 0
): Step | undefined {
  if (move.type === "wait" || move.type === "premove" || move.type === "move_field_stack") return;
  if (move.type === "cycle" || move.type === "flip_deck") {
    return evaluateCycle(before, move, context, beforeUtility, isRoot, timeOnly);
  }
  const source: Source = move.type === "c2c" ? move.source
    : move.type === "s2s" ? { type: "solitaire", index: move.source, count: move.count }
    : { type: move.source };
  const card = getSourceCard(before, source);
  if (!card) return;
  const from = sourceLocation(before, source, context.playerIndex);
  const timeToSource = cardEquals(before.cursorCard, card) ? 0 : cursorTime(before.cursor, from);
  const after = takeCard(before, source);
  let commitTime: number;
  let reward = before.pounceCount - after.pounceCount === 1 ? 2 : 0;
  if (move.type === "c2c") {
    const dest = card.value === 1 && !before.center[context.emptyCenterIndex]
      ? context.emptyCenterIndex : move.dest;
    const top = before.center[dest];
    if (dest < 0 || !canPlay(top, card)) return;
    after.center = before.center.slice();
    after.center[dest] = card;
    commitTime = timeToSource + (top ? cursorTime(from, context.centerLocations[dest]) : 0);
    const raceScale = isRoot ? 1 : timeOnly ? 0 : context.followRaceWeight;
    let race = 0;
    if (context.raceWeight > 0 && raceScale > 0) {
      const raceAge = previousTime === 0 || context.initialCenter.some((pile) => canPlay(pile, card))
        ? previousTime : Math.min(previousTime, roomCommitTime);
      race = raceScale * raceValue(before, after, card, dest, commitTime + raceAge, reward + 1, context);
    }
    reward += 1 + race;
    after.cursorCard = getSourceCard(after, source);
    after.cursor = after.cursorCard ? sourceLocation(after, source, context.playerIndex)
      : top ? from : context.centerLocations[dest];
  } else {
    const target = before.stacks[move.dest];
    const tuck = move.type === "c2s" && isTuck(target, card);
    if (!canPlace(before, target, card, move.type === "c2s")) return;
    const moved = source.type === "solitaire"
      ? before.stacks[source.index].slice(-(source.count ?? 1)) : [card];
    after.stacks = after.stacks.slice();
    after.stacks[move.dest] = tuck ? [...moved, ...target] : [...target, ...moved];
    after.cursorCard = peek(target);
    after.cursor = getPlayerStackLocation(context.playerIndex, move.dest, Math.max(0, target.length - 1));
    commitTime = timeToSource + cursorTime(from, after.cursor);
  }
  const elapsed = commitTime + roomCommitTime;
  const discount = Math.exp(-commitTime / context.discountTime);
  const afterUtility = timeOnly || after.pounceCount === 0 ? beforeUtility : utility(after, context);
  const finish = after.pounceCount === 0 ? 1.1 : 0;
  return {
    after,
    elapsed,
    gain: (reward + finish + afterUtility - beforeUtility) * discount -
      context.tempoWeight * elapsed / roomCommitTime,
    unknownReveal: false,
    move,
  };
}

function evaluateCycle(
  before: Position,
  move: Extract<Move, { type: "cycle" | "flip_deck" }>,
  context: PlanningContext,
  beforeUtility: number,
  isRoot: boolean,
  timeOnly: boolean
): Step | undefined {
  // The tabletop exposes the flip action on the face-up waste pile.
  if (move.type === "flip_deck" && before.waste.length === 0) return;
  const count = move.type === "flip_deck" ? before.stock.length : Math.min(3, before.stock.length);
  const reset = before.stock.length === 0;
  if (reset && before.waste.length === 0) return;
  const after = { ...before };
  if (reset) {
    after.stock = before.waste.slice().reverse();
    after.waste = [];
  } else {
    after.stock = before.stock.slice(0, -count);
    after.waste = before.waste.concat(before.stock.slice(-count).reverse());
  }
  const nextWaste = peek(after.waste);
  const canRevealKnownLater = before.stock.some(Boolean) || before.waste.some(Boolean);
  if (!isRoot && !nextWaste && !canRevealKnownLater) return;
  const target = reset
    ? getPlayerFlippedDeckLocation(context.playerIndex, before.waste.length - 1)
    : getPlayerDeckLocation(context.playerIndex, before.stock.length - count);
  const cursorTimeToAdvance = move.type === "flip_deck" ||
      (nextWaste && cardEquals(nextWaste, before.cursorCard)) ? 0 : cursorTime(before.cursor, target);
  const elapsed = cursorTimeToAdvance + roomCommitTime;
  after.cursor = after.waste.length > 0
    ? getPlayerFlippedDeckLocation(context.playerIndex, after.waste.length - 1)
    : getPlayerDeckLocation(context.playerIndex, after.stock.length - 1);
  after.cursorCard = nextWaste;
  return {
    after,
    elapsed,
    gain: (timeOnly ? 0 : utility(after, context) - beforeUtility) - context.tempoWeight * elapsed / roomCommitTime,
    unknownReveal: !nextWaste && !canRevealKnownLater,
    move,
  };
}

function listMoves(position: Position, allowFlip = true): Move[] {
  const moves: Move[] = [];
  const sources: CenterSource[] = [{ type: "pounce" }, { type: "deck" },
    ...position.stacks.map((_, index) => ({ type: "solitaire" as const, index }))];
  for (const source of sources) {
    const card = getSourceCard(position, source);
    if (!card) continue;
    const dest = position.center.findIndex((top) => canPlay(top, card));
    if (dest >= 0) moves.push({ type: "c2c", source, dest });
  }
  const empty = position.stacks.findIndex((stack) => stack.length === 0);
  for (let dest = 0; dest < position.stacks.length; dest++) {
    const target = position.stacks[dest];
    if (target.length === 0 && dest !== empty) continue;
    if (position.pounce && canPlace(position, target, position.pounce, true)) {
      moves.push({ type: "c2s", source: "pounce", dest });
    }
    const waste = peek(position.waste);
    if (waste && canPlace(position, target, waste, true)) {
      moves.push({ type: "c2s", source: "deck", dest });
    }
    for (let source = 0; source < position.stacks.length; source++) {
      if (source === dest) continue;
      const stack = position.stacks[source];
      for (let index = target.length === 0 ? 1 : 0; index < stack.length; index++) {
        if (canMoveToSolitairePile(stack[index], target)) {
          moves.push({ type: "s2s", source, dest, count: stack.length - index });
        }
      }
    }
  }
  if (position.stock.length > 0 || position.waste.length > 0) {
    moves.push({ type: "cycle" });
  }
  if (allowFlip && position.stock.length > 3 && position.waste.length > 0) moves.push({ type: "flip_deck" });
  return moves;
}

function takeCard(before: Position, source: Source): Position {
  const after = { ...before };
  if (source.type === "pounce") {
    after.pounce = undefined;
    after.pounceCount--;
  } else if (source.type === "deck") {
    after.waste = before.waste.slice(0, -1);
  } else {
    after.stacks = before.stacks.slice();
    const count = source.count ?? 1;
    after.stacks[source.index] = before.stacks[source.index].slice(0, -count);
  }
  return after;
}

function sourceLocation(position: Position, source: Source, playerIndex: number): Location {
  if (source.type === "pounce") return getPlayerPounceCardLocation(playerIndex, position.pounceCount - 1);
  if (source.type === "deck") return getPlayerFlippedDeckLocation(playerIndex, position.waste.length - 1);
  const count = source.count ?? 1;
  return getPlayerStackLocation(playerIndex, source.index, position.stacks[source.index].length - count);
}

function getSourceCard(position: Position, source: Source): KnownCard {
  if (source.type === "pounce") return position.pounce;
  if (source.type === "deck") return peek(position.waste);
  const count = source.count ?? 1;
  return position.stacks[source.index][position.stacks[source.index].length - count];
}

function isTuck(target: CardState[], card: CardState): boolean {
  const bottom = target[0];
  return bottom != null && card.value === bottom.value + 1 && couldMatch(card, bottom);
}

function canPlace(position: Position, target: CardState[], card: CardState, allowTuck: boolean): boolean {
  return allowTuck && isTuck(target, card)
    ? position.stacks.some((stack) => stack.length === 0)
    : canMoveToSolitairePile(card, target);
}

function canPlay(top: KnownCard, card: CardState): boolean {
  return top == null ? card.value === 1 : top.suit === card.suit && top.value + 1 === card.value;
}

function rankDistance(center: readonly KnownCard[], card: CardState): number {
  let distance = 14;
  for (const top of center) {
    const value = top?.value ?? 0;
    if (value < card.value && (!top || top.suit === card.suit)) {
      distance = Math.min(distance, card.value - value - 1);
    }
  }
  return distance;
}

function getRankAvailability(position: Position, opponents: readonly OpponentCard[]): Float64Array {
  const inclusion = new Float64Array(56);
  const record = (card: KnownCard, soon: number) => {
    if (!card) return;
    const index = cardKey(card);
    inclusion[index] = soon + inclusion[index] * (1 - soon);
  };
  record(position.pounce, 0.87);
  for (const stack of position.stacks) {
    record(peek(stack), 0.78);
    record(stack[stack.length - 2], 0.20);
  }
  record(peek(position.waste), 0.67);
  for (const foe of opponents) {
    record(foe.card, foe.holding ? 0.96 : foe.pounce ? 0.88 : 0.68);
    record(foe.after, 0.16);
  }
  return inclusion;
}

export function getPossiblePounce(
  board: BoardState,
  playerIndex: number,
  position: Pick<Position, "pounce" | "stacks" | "waste" | "stock">
): CardState[] {
  const known = new Set<number>();
  const exclude = (card: KnownCard) => {
    if (card?.player === playerIndex) known.add(cardKey(card));
  };
  exclude(position.pounce);
  position.stacks.forEach((stack) => stack.forEach(exclude));
  position.waste.forEach(exclude);
  position.stock.forEach(exclude);
  board.piles.forEach((pile) => pile.forEach(exclude));
  return suits.flatMap((suit) => Array.from({ length: 13 }, (_, rank) => ({
    player: playerIndex, value: (rank + 1) as Values, suit,
  })).filter((card) => !known.has(cardKey(card))));
}

function predictedDistance(position: Position, card: CardState, context: PlanningContext): number {
  let best = 14;
  const suitBase = cardKey(card) - card.value;
  let foundations = 0;
  for (const top of position.center) {
    if (top?.suit !== card.suit) continue;
    foundations++;
    if (top.value >= card.value) continue;
    let distance = 0;
    for (let value = top.value + 1; value < card.value; value++) {
      distance += 0.35 + 1.3 * (1 - context.rankAvailability[suitBase + value]);
    }
    best = Math.min(best, distance);
  }
  if (foundations <= context.opponentCount && position.center.includes(undefined)) {
    let distance = 0;
    for (let value = 1; value < card.value; value++) {
      distance += 0.35 + 1.3 * (1 - context.rankAvailability[suitBase + value]);
    }
    best = Math.min(best, distance);
  }
  return best;
}

function utility(position: Position, context: PlanningContext): number {
  let freedom = 0;
  let holes = 0;
  let layout = 0;
  let forecast = 0;
  for (const stack of position.stacks) {
    if (stack.length === 0) {
      holes++;
      continue;
    }
    const top = stack[stack.length - 1];
    const separation = rankDistance(position.center, top);
    freedom += 0.15 / (1 + separation);
    const predictedTop = context.forecastWeight > 0 ? predictedDistance(position, top, context) : 0;
    forecast += 0.25 / (1 + predictedTop);
    for (let index = stack.length - 2; index >= 0; index--) {
      const buried = stack[index];
      const distance = rankDistance(position.center, buried);
      if (distance < separation) {
        // A distinction between keeping a blocking higher card accessible and
        // storing it behind a card whose next foundation is farther away.
        layout -= (0.28 + 0.08 * Math.min(4, separation - distance)) /
          ((1 + distance) * (stack.length - index - 1));
      }
      if (context.forecastWeight > 0) {
        const predictedBuried = predictedDistance(position, buried, context);
        const blocked = 1 / (1 + predictedBuried) - 1 / (1 + predictedTop);
        forecast -= Math.max(0, blocked) / (stack.length - index - 1);
      }
    }
  }
  const pounceOptions = position.pounce ? position.stacks.filter((stack) => stack.length > 0 &&
    canPlace(position, stack, position.pounce!, true)).length : 0;
  const holeValue = holes === 0 ? 0 : (0.74 + 0.24 * (holes - 1)) * (pounceOptions ? 0.82 : 1);
  const pounceReady = position.pounce
    ? 0.29 / (1 + rankDistance(position.center, position.pounce)) + (pounceOptions ? 0.32 : 0)
    : 0;
  let nextPounce = 0;
  if (context.possiblePounce.length > 0 && position.pounceCount > 0) {
    for (const next of context.possiblePounce) {
      if (position.center.some((top) => canPlay(top, next))) {
        nextPounce += 1.25;
      } else if (holes || position.stacks.some((stack) => canMoveToSolitairePile(next, stack))) {
        nextPounce++;
      }
    }
    nextPounce /= context.possiblePounce.length;
  }
  return freedom + context.slotWeight * (holeValue + layout + pounceReady) +
    context.nextPounceWeight * nextPounce + context.forecastWeight * forecast;
}

function raceValue(
  before: Position,
  after: Position,
  card: CardState,
  dest: number,
  ownCommitTime: number,
  ownReward: number,
  context: PlanningContext
): number {
  if (context.opponents.length === 0 || after.pounceCount === 0) return 0;
  const spot = context.centerLocations[dest];
  const otherDestination = before.center.some((top, index) => index !== dest && canPlay(top, card));
  let denial = 0;
  let feed = 0;
  let ownLoss = 0;
  for (const enemy of context.opponents) {
    if (enemy.card.suit !== card.suit) continue;
    const rivalReward = enemy.pounce ? (enemy.canTuckPounce ? 1.35 : 3) : 1;
    const remainingDrag = enemy.holding ? 0 : cursorTime(enemy.position, spot);
    const optimisticRaceTime = enemy.cursorTime + remainingDrag;
    const risk = enemy.heldElsewhere ? 0.16 : enemy.pounce ? 0.87 : 0.62;
    if (enemy.card.value === card.value && !otherDestination) {
      const ownWin = logistic((optimisticRaceTime + 1500 - ownCommitTime) / 1700);
      denial += risk * ownWin * rivalReward;
      ownLoss = Math.max(ownLoss, risk * (1 - ownWin) * ownReward * 0.74);
    } else if (enemy.card.value === card.value + 1 &&
        !before.center.some((top) => canPlay(top, enemy.card))) {
      const finish = enemy.pounce && enemy.pounceCount === 1 ? 3 : 0;
      const chain = enemy.after?.suit === enemy.card.suit && enemy.after.value === enemy.card.value + 1 ? 0.7 : 0;
      feed += risk * (rivalReward + chain + finish);
    }
  }
  const playerScale = Math.max(1, context.opponentCount);
  return context.raceWeight * ((0.9 * denial - 0.85 * feed) / playerScale - ownLoss);
}

function readOpponents(board: BoardState, playerIndex: number, hands: readonly CursorState[]): OpponentCard[] {
  return board.players.flatMap((player, index) => {
    if (index === playerIndex || player.isSpectating) return [];
    const hand = hands[index];
    const location = handLocation(board, hand);
    const pounce = peek(player.pounceDeck);
    const empty = player.stacks.some((stack) => stack.length === 0);
    const pounceIsClearable = pounce != null && player.stacks.some((stack) =>
      canMoveToSolitairePile(pounce, stack) || (empty && isTuck(stack, pounce)));
    const sources = [
      { card: pounce, after: undefined, pounce: true,
        position: getPlayerPounceCardLocation(index, player.pounceDeck.length - 1) },
      { card: peek(player.flippedDeck), after: undefined, pounce: false,
        position: getPlayerFlippedDeckLocation(index, player.flippedDeck.length - 1) },
      ...player.stacks.map((stack, stackIndex) => ({
        card: peek(stack), after: stack[stack.length - 2], pounce: false,
        position: getPlayerStackLocation(index, stackIndex, stack.length - 1),
      })),
    ];
    return sources.flatMap((source): OpponentCard[] => {
      if (!source.card) return [];
      const holding = cardEquals(hand?.item, source.card);
      const atSource = isCardCursorLocation(hand?.location) && cardEquals(hand.location, source.card);
      return [{ ...source, card: source.card,
        pounceCount: player.pounceDeck.length,
        canTuckPounce: pounceIsClearable,
        holding,
        heldElsewhere: hand?.item != null && !holding,
        cursorTime: holding || atSource ? 0 : cursorTime(location, source.position),
      }];
    });
  });
}

function handLocation(board: BoardState, hand: CursorState | undefined): Location | undefined {
  const location = hand?.location;
  if (location == null) return;
  if (isCardCursorLocation(location)) return getApproximateCardLocation(board, location);
  return location.type === "solitaire_slot"
    ? getPlayerStackLocation(location.player, location.pileIndex, 0)
    : [550 + location.position[0] * FIELD_PILE_AREA_SIZE, 50 + location.position[1] * FIELD_PILE_AREA_SIZE];
}

function cursorTime(from: Location | undefined, to: Location): number {
  return from ? 750 + 3 * Math.hypot(from[0] - to[0], from[1] - to[1]) : 1500;
}

function positionKey(position: Position): string {
  const stackKeys = position.stacks.map((stack) => stack.map(cardKey).join("."));
  const knownStock = position.stock.map(cardKey).join(".");
  const knownWaste = position.waste.map(cardKey).join(".");
  const centerKey = position.center.map(cardKey).join(".");
  return `${stackKeys.join("_")}:${position.pounceCount}:${knownStock}:${knownWaste}:${centerKey}`;
}

function cardKey(card: KnownCard): number {
  if (!card) return 0;
  const suit = card.suit === "hearts" ? 0 : card.suit === "spades" ? 14 : card.suit === "diamonds" ? 28 : 42;
  return card.value + suit;
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function peek<T>(cards: readonly T[]): T | undefined {
  return cards[cards.length - 1];
}
