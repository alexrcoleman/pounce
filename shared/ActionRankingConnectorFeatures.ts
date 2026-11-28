import { cardEquals, couldMatch, peek } from "./CardUtils";
import type { BoardState, CardState, CursorState, PlayerState, Suits } from "./GameUtils";
import type { Move } from "./MoveHandler";

export const CONNECTOR_FEATURE_NAMES = [
  "connector.tableauBridge",
  "connector.wasteBridge",
  "connector.pounceBridge",
  "connector.slotGain",
  "connector.partnerCenterAccess",
  "connector.partnerCenterPassed",
  "connector.coveredCenterAccess",
  "connector.partnerCenterCompetition",
  "connector.wasteStockFraction",
] as const;

export type ActionRankingConnectorFeatureName = typeof CONNECTOR_FEATURE_NAMES[number];
type ConnectorFeatures = Readonly<Record<ActionRankingConnectorFeatureName, number>>;
type SolitaireMove = Extract<Move, { type: "c2s" | "s2s" }>;
type ConnectorSource = "tableau" | "waste" | "pounce";

export type ActionRankingConnectorPlan = {
  pivot: CardState;
  source: ConnectorSource;
  setup: SolitaireMove;
  followUp?: Extract<Move, { type: "s2s" }>;
  partners: readonly CardState[];
  covered: readonly CardState[];
  slots: number;
};

type CenterProfile = { access: number; passed: boolean; competition: number };

export type ActionRankingConnectorContext = {
  player: PlayerState;
  plans: () => readonly ActionRankingConnectorPlan[];
  center: (card: CardState) => CenterProfile;
};

const ZERO: ConnectorFeatures = {
  "connector.tableauBridge": 0,
  "connector.wasteBridge": 0,
  "connector.pounceBridge": 0,
  "connector.slotGain": 0,
  "connector.partnerCenterAccess": 0,
  "connector.partnerCenterPassed": 0,
  "connector.coveredCenterAccess": 0,
  "connector.partnerCenterCompetition": 0,
  "connector.wasteStockFraction": 0,
};

const SUIT_INDEX: Record<Suits, number> = { hearts: 0, spades: 1, diamonds: 2, clubs: 3 };

export function createActionRankingConnectorContext(
  board: BoardState,
  playerIndex: number,
  hands?: readonly CursorState[]
): ActionRankingConnectorContext | undefined {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) {
    return;
  }
  let plans: ActionRankingConnectorPlan[] | undefined;
  let center: ((card: CardState) => CenterProfile) | undefined;
  return {
    player,
    plans: () => plans ??= createPlans(player),
    center: (card) => (center ??= createCenterProfiles(board, playerIndex, hands))(card),
  };
}

export function getActionRankingConnectorFeatures(
  context: ActionRankingConnectorContext | undefined,
  move: Move
): number[] {
  const features = evaluateActionRankingConnectorMove(context, move);
  return CONNECTOR_FEATURE_NAMES.map((name) => features[name]);
}

export function evaluateActionRankingConnectorMove(
  context: ActionRankingConnectorContext | undefined,
  move: Move
): ConnectorFeatures {
  if (!context) {
    return ZERO;
  }
  const plan = getActionRankingConnectorPlan(context, move);
  if (!plan) {
    return ZERO;
  }

  const direction = move.type === "c2c" ? -1 : 1;
  // Centering a one-card tableau stack already frees its own slot.
  const slotAlreadyFreed = move.type === "c2c" && move.source.type === "solitaire" &&
    context.player.stacks[move.source.index].length === 1 ? 1 : 0;
  const profiles = plan.partners.map(context.center);
  const count = profiles.length;
  const stock = context.player.deck.length;
  return {
    "connector.tableauBridge": plan.source === "tableau" ? direction : 0,
    "connector.wasteBridge": plan.source === "waste" ? direction : 0,
    "connector.pounceBridge": plan.source === "pounce" ? direction : 0,
    "connector.slotGain": direction * (plan.slots - slotAlreadyFreed) / 2 || 0,
    "connector.partnerCenterAccess": direction * profiles.reduce((sum, row) => sum + row.access, 0) / count || 0,
    "connector.partnerCenterPassed": direction * profiles.filter(({ passed }) => passed).length / count || 0,
    "connector.coveredCenterAccess": direction * Math.max(...plan.covered.map((card) => context.center(card).access)) || 0,
    "connector.partnerCenterCompetition": direction * profiles.reduce((sum, row) => sum + row.competition, 0) / count || 0,
    "connector.wasteStockFraction": plan.source === "waste" && stock > 0
      ? direction * stock / (stock + context.player.flippedDeck.length)
      : 0,
  };
}

/** Finds a concrete setup (including the next merge when needed) or the setup foregone by centering its pivot. */
export function getActionRankingConnectorPlan(
  context: ActionRankingConnectorContext | undefined,
  move: Move,
  requiredPivot?: CardState
): ActionRankingConnectorPlan | undefined {
  if (!context || (move.type !== "c2c" && move.type !== "c2s" && move.type !== "s2s")) {
    return;
  }
  const player = context.player;
  const centerCard = move.type === "c2c"
    ? move.source.type === "solitaire" ? peek(player.stacks[move.source.index])
      : move.source.type === "deck" ? peek(player.flippedDeck) : peek(player.pounceDeck)
    : undefined;
  if (move.type === "c2c" && centerCard == null) {
    return;
  }

  let best: ActionRankingConnectorPlan | undefined;
  for (const plan of context.plans()) {
    if (requiredPivot && !cardEquals(plan.pivot, requiredPivot)) {
      continue;
    }
    const matches = move.type === "c2c" ? cardEquals(plan.pivot, centerCard) : sameSetup(move, plan.setup);
    if (matches && (!best || plan.slots > best.slots ||
        (plan.slots === best.slots && plan.partners.length > best.partners.length))) {
      best = plan;
    }
  }
  return best;
}

function createPlans(player: PlayerState): ActionRankingConnectorPlan[] {
  const stacks = player.stacks;
  const roots = stacks.map((stack) => stack[0] as CardState | undefined);
  const tops = stacks.map(peek);
  const empty = tops.some((card) => card == null);
  const plans: ActionRankingConnectorPlan[] = [];
  stacks.forEach((source, from) => stacks.forEach((dest, to) => {
    const base = roots[from];
    const top = tops[from];
    const support = tops[to];
    if (from === to || !base || !top || !support) {
      return;
    }
    const lowerIndex = roots.findIndex((card, index) => index !== from && index !== to && canJoin(card, top));
    const lower = roots[lowerIndex];
    const followUp = lower ? {
      type: "s2s" as const, source: lowerIndex, dest: to, count: stacks[lowerIndex].length,
    } : undefined;
    if (canJoin(base, support)) {
      const setup: SolitaireMove = { type: "s2s", source: from, dest: to, count: source.length };
      plans.push({
        pivot: base,
        source: "tableau",
        setup,
        followUp,
        partners: lower ? [support, lower] : [support],
        covered: [support],
        slots: lower ? 2 : 1,
      });
      // This is the same merge viewed as retaining the destination's exposed pivot.
      const aboveIndex = tops.findIndex((card, index) => index !== from && index !== to && canJoin(roots[to], card));
      const above = tops[aboveIndex];
      plans.push({
        pivot: support,
        source: "tableau",
        setup,
        followUp: above ? { type: "s2s", source: to, dest: aboveIndex, count: dest.length + source.length } : undefined,
        partners: above ? [base, above] : [base],
        covered: above ? [support, above] : [support],
        slots: above ? 2 : 1,
      });
    } else if (source.length > 1 && lower && canJoin(top, support)) {
      plans.push({
        pivot: top,
        source: "tableau",
        setup: { type: "s2s", source: from, dest: to, count: 1 },
        followUp,
        partners: [support, lower],
        covered: [support],
        slots: 1,
      });
    }
  }));

  addLooseCardPlans("deck", peek(player.flippedDeck));
  if (player.pounceDeck.length > 1) {
    addLooseCardPlans("pounce", peek(player.pounceDeck));
  }
  return plans;

  function addLooseCardPlans(source: "deck" | "pounce", pivot: CardState | undefined) {
    if (!pivot) {
      return;
    }
    tops.forEach((upper, upperIndex) => {
      if (!upper || !canJoin(pivot, upper)) {
        return;
      }
      roots.forEach((lower, lowerIndex) => {
        if (!lower || upperIndex === lowerIndex || !canJoin(lower, pivot)) {
          return;
        }
        const fields = {
          pivot,
          source: source === "deck" ? "waste" as const : "pounce" as const,
          partners: [upper, lower],
          covered: [upper],
          slots: 1,
        };
        const followUp = { type: "s2s" as const, source: lowerIndex, dest: upperIndex, count: stacks[lowerIndex].length };
        plans.push({ ...fields, setup: { type: "c2s", source, dest: upperIndex }, followUp });
        if (empty) {
          plans.push({
            ...fields,
            setup: { type: "c2s", source, dest: lowerIndex },
            followUp: { ...followUp, count: followUp.count + 1 },
          });
        }
      });
    });
  }
}

function canJoin(card: CardState | undefined, support: CardState | undefined): boolean {
  return card != null && support != null && card.value + 1 === support.value && couldMatch(card, support);
}

function sameSetup(a: SolitaireMove, b: SolitaireMove): boolean {
  return a.source === b.source && a.dest === b.dest && (
    (a.type === "c2s" && b.type === "c2s") || (a.type === "s2s" && b.type === "s2s" && a.count === b.count)
  );
}

function createCenterProfiles(
  board: BoardState,
  playerIndex: number,
  hands?: readonly CursorState[]
): (card: CardState) => CenterProfile {
  const topValues: number[][] = [[], [], [], []];
  let empty = 0;
  for (const pile of board.piles) {
    const top = peek(pile);
    if (top) {
      topValues[SUIT_INDEX[top.suit]].push(top.value);
    } else {
      empty++;
    }
  }

  const competitiveCopies = new Uint8Array(56);
  let activePlayers = 0;
  board.players.forEach((player, index) => {
    if (player.isSpectating) {
      return;
    }
    activePlayers++;
    if (index === playerIndex) {
      return;
    }
    const visible = new Set<number>();
    for (const card of [peek(player.pounceDeck), peek(player.flippedDeck), ...player.stacks.map(peek), hands?.[index]?.item]) {
      if (card && card.player === index) {
        visible.add(cardKey(card));
      }
    }
    visible.forEach((key) => competitiveCopies[key]++);
  });

  const profiles = new Map<number, CenterProfile>();
  return (card) => {
    const key = cardKey(card);
    const known = profiles.get(key);
    if (known) {
      return known;
    }
    const lanes = topValues[SUIT_INDEX[card.suit]];
    const canStart = empty > 0 && lanes.length < activePlayers;
    let gap = canStart ? card.value - 1 : Number.POSITIVE_INFINITY;
    let nextDestinations = canStart && card.value === 1 ? Math.min(empty, activePlayers - lanes.length) : 0;
    let lowerLane = false;
    for (const top of lanes) {
      if (top < card.value) {
        lowerLane = true;
        const distance = card.value - top - 1;
        gap = Math.min(gap, distance);
        nextDestinations += Number(distance === 0);
      }
    }
    const access = 1 / (1 + gap);
    const copies = competitiveCopies[key];
    const result = {
      access,
      passed: lanes.length > 0 && !lowerLane,
      competition: copies > 0 ? access * copies / (copies + Math.max(1, nextDestinations)) : 0,
    };
    profiles.set(key, result);
    return result;
  };
}

function cardKey(card: CardState): number {
  return SUIT_INDEX[card.suit] * 14 + card.value;
}
