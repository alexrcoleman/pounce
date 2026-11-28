import {
  ACTION_RANKING_FEATURE_NAMES,
  getActionRankingMoveKey,
} from "./ActionRankingPolicy";
import {
  createActionRankingConnectorContext,
  getActionRankingConnectorPlan,
} from "./ActionRankingConnectorFeatures";
import type {
  ActionRankingDecisionReviewer,
  ActionRankingMoveReviewer,
} from "./pounceChampion/types";
import { cardEquals, peek } from "./CardUtils";
import type { CardState } from "./GameUtils";
import {
  getConnectorGateInputs,
  predictConnectorGate,
  type PounceConnectorGate,
} from "./PounceConnectorGate";

type RankedCandidate = { score: number; index: number };
type ConnectorRestriction = { centerIndex: number; source: string; passedOnly: boolean };
const passedIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("connector.partnerCenterPassed");

export function findPounceConnectorPair(
  { board, playerIndex, hands, candidates }: Parameters<ActionRankingDecisionReviewer>[0],
  ranked: readonly RankedCandidate[],
  used: ReadonlySet<string>,
  restrict?: ConnectorRestriction
): {
  key: string;
  source: string;
  setup: RankedCandidate;
  center: RankedCandidate;
  followUp?: string;
} | undefined {
  const context = createActionRankingConnectorContext(board, playerIndex, hands);
  const player = board.players[playerIndex];
  const centers = ranked.flatMap((item) => {
    const { move, endsRound } = candidates[item.index];
    if (move.type !== "c2c" || endsRound || (restrict && item.index !== restrict.centerIndex)) return [];
    const { source } = move;
    const card: CardState | undefined = source.type === "pounce" ? peek(player.pounceDeck)
      : source.type === "deck" ? peek(player.flippedDeck) : peek(player.stacks[source.index]);
    return card ? [{ item, card }] : [];
  });
  if (centers.length === 0) return;
  for (const setup of ranked) {
    const { move, features } = candidates[setup.index];
    if (move.type !== "c2s" && move.type !== "s2s") continue;
    if (restrict?.passedOnly && features[passedIndex] <= 0) continue;
    const plan = getActionRankingConnectorPlan(context, move);
    if (!plan) continue;
    if (restrict && restrict.source !== "all" && plan.source !== restrict.source) continue;
    const key = `${playerIndex}:${plan.source}:${plan.pivot.suit}:${plan.pivot.value}`;
    if (used.has(key)) continue;
    const center = centers.find(({ card }) => cardEquals(card, plan.pivot));
    if (center) {
      return {
        key, source: plan.source, setup, center: center.item,
        followUp: plan.followUp && getActionRankingMoveKey(plan.followUp),
      };
    }
  }
}

export function createPounceConnectorPolicy(
  { source, passedOnly = false, gate }: { source: string; passedOnly?: boolean; gate?: PounceConnectorGate }
) {
  const pending: ({ keys: string[]; attempts: number } | undefined)[] = [];
  const tried = new Set<string>();
  const stats = { decisions: 0, starts: 0, completions: 0, considered: 0 };
  const rankDecision = (decision: Parameters<ActionRankingDecisionReviewer>[0], commit: boolean) => {
    const { playerIndex, candidates, scores } = decision;
    if (candidates.length === 0) return;
    if (commit) stats.decisions++;
    const ranked = scores.map((score, index) => ({ score, index }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const best = ranked[0];
    const move = candidates[best.index];
    const prefer = (index: number) =>
      scores.map((score, candidate) => candidate === index ? best.score + 1 : score);
    const plan = pending[playerIndex];
    if (plan) {
      const next = candidates.findIndex(({ key }) => key === plan.keys[0]);
      if (next < 0 || plan.attempts >= 4 || move.endsRound) {
        if (commit) pending[playerIndex] = undefined;
        return;
      }
      if (commit) plan.attempts++;
      return prefer(next);
    }
    if (move.move.type !== "c2c" || move.endsRound) return;
    const connector = findPounceConnectorPair(decision, ranked, tried, {
      centerIndex: best.index, source, passedOnly,
    });
    if (!connector) return;
    if (commit) stats.considered++;
    const setup = candidates[connector.setup.index];
    if (gate && predictConnectorGate(gate, getConnectorGateInputs(connector.source, setup.features)) < gate.threshold) {
      return;
    }
    if (commit) {
      const keys = [setup.key];
      if (connector.followUp) keys.push(connector.followUp);
      tried.add(connector.key);
      pending[playerIndex] = { keys, attempts: 1 };
      stats.starts++;
    }
    return prefer(connector.setup.index);
  };

  const reviewMove: ActionRankingMoveReviewer = ({ playerIndex, move, result }) => {
    const plan = pending[playerIndex];
    if (!plan || !result?.boardChanged) return;
    if (getActionRankingMoveKey(move) === plan.keys[0]) {
      plan.keys.shift();
      plan.attempts = 0;
      if (plan.keys.length > 0) return;
      stats.completions++;
    }
    pending[playerIndex] = undefined;
  };

  const reviewDecision: ActionRankingDecisionReviewer = (decision) => rankDecision(decision, true);
  const previewDecision: ActionRankingDecisionReviewer = (decision) => rankDecision(decision, false);
  return { reviewDecision, previewDecision, reviewMove, stats };
}
