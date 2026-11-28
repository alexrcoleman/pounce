import { canMoveToSolitairePile, couldMatch, peek } from "./CardUtils";
import type { BoardState, CardState, PlayerState, Suits } from "./GameUtils";
import type { Move } from "./MoveHandler";

export const STRATEGY_FEATURE_NAMES = [
  "strategy.lastSlotUsed",
  "strategy.lastSlotOpened",
  "strategy.slotBuriedAccessDelta",
  "strategy.slotPounceAccessDelta",
  "strategy.slotPounceTuckDelta",
  "strategy.buriedCenterExposed",
  "strategy.buriedPounceConnectorExposed",
  "strategy.centerOpponentPounceAccess",
  "strategy.centerOpponentPounceDenial",
  "strategy.centerOpponentFinishFeed",
  "strategy.centerWinningFinishFeed",
  "strategy.centerOwnPounceFollow",
  "strategy.centerOwnFinishFollow",
] as const;

export type ActionRankingStrategyFeatureName = typeof STRATEGY_FEATURE_NAMES[number];
export type ActionRankingStrategyFeatureSet = Readonly<Record<ActionRankingStrategyFeatureName, number>>;

type SlotAccess = { slots: number; buried: number; pounce: number; tuck: number };
type CardAccess = (card: CardState) => number;
type CenterMove = Extract<Move, { type: "c2c" }>;
type Opponent = { pounce: CardState; pounceCount: number; points: number; otherBest: number };

export type ActionRankingStrategyContext = {
  player: PlayerState;
  pounce: CardState | undefined;
  centerPiles: readonly CardState[][];
  centerAccess: CardAccess;
  initialSlots: SlotAccess;
  opponents: Opponent[];
};

const ZERO: ActionRankingStrategyFeatureSet = {
  "strategy.lastSlotUsed": 0,
  "strategy.lastSlotOpened": 0,
  "strategy.slotBuriedAccessDelta": 0,
  "strategy.slotPounceAccessDelta": 0,
  "strategy.slotPounceTuckDelta": 0,
  "strategy.buriedCenterExposed": 0,
  "strategy.buriedPounceConnectorExposed": 0,
  "strategy.centerOpponentPounceAccess": 0,
  "strategy.centerOpponentPounceDenial": 0,
  "strategy.centerOpponentFinishFeed": 0,
  "strategy.centerWinningFinishFeed": 0,
  "strategy.centerOwnPounceFollow": 0,
  "strategy.centerOwnFinishFollow": 0,
};

const SUIT_INDEX: Record<Suits, number> = { hearts: 0, spades: 1, diamonds: 2, clubs: 3 };

export function createActionRankingStrategyContext(
  board: BoardState,
  playerIndex: number
): ActionRankingStrategyContext | undefined {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) {
    return;
  }
  const counts = new Uint8Array(56);
  let emptyPiles = 0;
  for (const pile of board.piles) {
    const top = peek(pile);
    if (!top) {
      emptyPiles++;
    } else if (top.value < 13) {
      counts[SUIT_INDEX[top.suit] * 14 + top.value + 1]++;
    }
  }
  // Counts let us distinguish opening or closing the only destination from
  // creating or removing one of several equivalent destinations.
  const centerAccess: CardAccess = (card) =>
    card.value === 1 ? emptyPiles : counts[SUIT_INDEX[card.suit] * 14 + card.value];
  const pounce = peek(player.pounceDeck);
  const opponents: Opponent[] = [];
  board.players.forEach((opponent, index) => {
    const top = peek(opponent.pounceDeck);
    if (index === playerIndex || opponent.isSpectating || !top) {
      return;
    }
    let otherBest = Number.NEGATIVE_INFINITY;
    if (opponent.pounceDeck.length === 1) {
      board.players.forEach((other, otherIndex) => {
        if (otherIndex !== index && otherIndex !== playerIndex && !other.isSpectating) {
          otherBest = Math.max(otherBest, other.currentPoints);
        }
      });
    }
    opponents.push({
      pounce: top,
      pounceCount: opponent.pounceDeck.length,
      points: opponent.currentPoints,
      otherBest,
    });
  });
  return {
    player,
    pounce,
    centerPiles: board.piles,
    centerAccess,
    initialSlots: getSlotAccess(player.stacks, pounce, centerAccess),
    opponents,
  };
}

export function getActionRankingStrategyFeatures(
  context: ActionRankingStrategyContext | undefined,
  move: Move
): number[] {
  const values = evaluateActionRankingStrategyMove(context, move);
  return STRATEGY_FEATURE_NAMES.map((name) => values[name]);
}

/** Projects a legal move without accessing cards it would turn face up. */
export function evaluateActionRankingStrategyMove(
  context: ActionRankingStrategyContext | undefined,
  move: Move
): ActionRankingStrategyFeatureSet {
  if (!context || (move.type !== "c2c" && move.type !== "c2s" && move.type !== "s2s")) {
    return ZERO;
  }
  const { player, pounce, centerAccess, initialSlots } = context;
  const stacks = player.stacks.slice();
  let nextPounce = pounce;
  let exposed: CardState | undefined;
  let afterCenterAccess = centerAccess;
  const result = { ...ZERO };

  if (move.type === "c2c") {
    const card = getCenterMoveCard(context, move);
    if (!card) {
      return ZERO;
    }
    const oldTop = peek(context.centerPiles[move.dest]);
    afterCenterAccess = (candidate) => centerAccess(candidate)
      - Number(canFollow(oldTop, candidate)) + Number(canFollow(card, candidate));
    if (move.source.type === "pounce") {
      nextPounce = undefined;
      if (player.pounceDeck.length === 1) {
        return ZERO;
      }
    } else if (move.source.type === "solitaire") {
      const index = move.source.index;
      stacks[index] = stacks[index].slice(0, -1);
      exposed = peek(stacks[index]);
    }
    addCenterFeatures(result, context, afterCenterAccess, nextPounce, card, oldTop, move);
  } else if (move.type === "c2s") {
    const card = move.source === "pounce" ? pounce : peek(player.flippedDeck);
    if (!card) {
      return ZERO;
    }
    const dest = stacks[move.dest];
    stacks[move.dest] = canTuck(card, dest) ? [card, ...dest] : [...dest, card];
    if (move.source === "pounce") {
      nextPounce = undefined;
      if (player.pounceDeck.length === 1) {
        return ZERO;
      }
    }
  } else {
    const source = stacks[move.source];
    stacks[move.source] = source.slice(0, -move.count);
    stacks[move.dest] = stacks[move.dest].concat(source.slice(-move.count));
    exposed = peek(stacks[move.source]);
  }

  const after = getSlotAccess(stacks, nextPounce, afterCenterAccess);
  result["strategy.lastSlotUsed"] = Number(initialSlots.slots === 1 && after.slots === 0);
  result["strategy.lastSlotOpened"] = Number(initialSlots.slots === 0 && after.slots === 1);
  result["strategy.slotBuriedAccessDelta"] = Math.max(-1, Math.min(1, (after.buried - initialSlots.buried) / 4));
  // Spending the visible pounce card itself is a realization of the slot's
  // value. A newly exposed pounce card is still unknown at decision time.
  if (pounce && nextPounce) {
    result["strategy.slotPounceAccessDelta"] = after.pounce - initialSlots.pounce;
    result["strategy.slotPounceTuckDelta"] = after.tuck - initialSlots.tuck;
  }
  if (exposed) {
    result["strategy.buriedCenterExposed"] = Number(afterCenterAccess(exposed) > 0);
    if (nextPounce && afterCenterAccess(nextPounce) === 0) {
      result["strategy.buriedPounceConnectorExposed"] = Number(
        !hasOccupiedLanding(nextPounce, player.stacks) &&
        canMoveToSolitairePile(nextPounce, [exposed])
      );
    }
  }
  return result;
}

function getCenterMoveCard(context: ActionRankingStrategyContext, move: CenterMove) {
  if (move.source.type === "pounce") {
    return context.pounce;
  }
  return move.source.type === "deck"
    ? peek(context.player.flippedDeck)
    : peek(context.player.stacks[move.source.index]);
}

function canFollow(top: CardState | undefined, card: CardState): boolean {
  return top == null
    ? card.value === 1
    : card.suit === top.suit && card.value === top.value + 1;
}

function addCenterFeatures(
  result: Record<ActionRankingStrategyFeatureName, number>,
  context: ActionRankingStrategyContext,
  after: CardAccess,
  ownPounce: CardState | undefined,
  card: CardState,
  oldTop: CardState | undefined,
  move: CenterMove
): void {
  const ownPoints = context.player.currentPoints + (move.source.type === "pounce" ? 3 : 1);
  for (const opponent of context.opponents) {
    const pressure = 1 / Math.sqrt(opponent.pounceCount);
    if (canFollow(card, opponent.pounce) && context.centerAccess(opponent.pounce) === 0) {
      result["strategy.centerOpponentPounceAccess"] = Math.max(result["strategy.centerOpponentPounceAccess"], pressure);
      if (opponent.pounceCount === 1) {
        result["strategy.centerOpponentFinishFeed"] = 1;
        if (opponent.points + 3 > Math.max(ownPoints, opponent.otherBest)) {
          result["strategy.centerWinningFinishFeed"] = 1;
        }
      }
    } else if (canFollow(oldTop, opponent.pounce) && after(opponent.pounce) === 0) {
      result["strategy.centerOpponentPounceDenial"] = Math.max(result["strategy.centerOpponentPounceDenial"], pressure);
    }
  }
  if (ownPounce && canFollow(card, ownPounce) && context.centerAccess(ownPounce) === 0) {
    result["strategy.centerOwnPounceFollow"] = 1;
    result["strategy.centerOwnFinishFollow"] = Number(context.player.pounceDeck.length === 1);
  }
}

function getSlotAccess(
  stacks: readonly CardState[][],
  pounce: CardState | undefined,
  centerAccess: CardAccess
): SlotAccess {
  const slots = stacks.filter((stack) => stack.length === 0).length;
  if (slots === 0) {
    return { slots, buried: 0, pounce: 0, tuck: 0 };
  }
  let buried = 0;
  stacks.forEach((stack, sourceIndex) => {
    for (let index = 0; index < stack.length - 1; index++) {
      const cover = stack[index + 1];
      const canPeelToCenter = index + 2 === stack.length && centerAccess(cover) > 0;
      if (centerAccess(stack[index]) > 0 && !canPeelToCenter &&
          !hasOccupiedLanding(cover, stacks, sourceIndex)) {
        buried++;
      }
    }
  });
  const needsSlot = pounce != null && centerAccess(pounce) === 0 && !hasOccupiedLanding(pounce, stacks);
  return {
    slots,
    buried,
    pounce: Number(needsSlot),
    tuck: Number(pounce != null && stacks.some((stack) => canTuck(pounce, stack))),
  };
}

function hasOccupiedLanding(card: CardState, stacks: readonly CardState[][], excludeIndex = -1): boolean {
  return stacks.some((stack, index) =>
    index !== excludeIndex && stack.length > 0 && canMoveToSolitairePile(card, stack)
  );
}

function canTuck(card: CardState, stack: readonly CardState[]): boolean {
  const root = stack[0];
  return root != null && card.value === root.value + 1 && couldMatch(card, root);
}
