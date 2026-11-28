import { ACTION_RANKING_FEATURE_NAMES, type ActionRankingCandidate } from "../ActionRankingPolicy";
import type { PlayerState } from "../GameUtils";
import type { Move } from "../MoveHandler";
import type { NeuralActionRankingModel, NeuralActionRankingPolicy } from "../NeuralActionRankingPolicy";
import { hasDirectPounceUnload, hasEarlyFullTableau } from "../PounceActionAdvantage";
import type { ActionRankingDecisionReviewer, PounceRoomReviewer } from "./types";

type Decision = Parameters<ActionRankingDecisionReviewer>[0];
type GreedyGuard = {
  earlyStallScope: boolean;
  protectNonproductiveChanges: boolean;
};

const usefulLayoutFeatures = [
  "solitaire.makesPouncePlayable", "solitaire.exposesCenterPlayable", "strategy.lastSlotOpened",
  "strategy.buriedPounceConnectorExposed", "connector.slotGain", "solitaire.postTopConnectsPounce",
] as const;
const usefulLayoutIndices = usefulLayoutFeatures.map((name) => ACTION_RANKING_FEATURE_NAMES.indexOf(name));
const directUnblockIndices = (["solitaire.makesPouncePlayable", "strategy.lastSlotOpened"] as const)
  .map((name) => ACTION_RANKING_FEATURE_NAMES.indexOf(name));
const exposedCenterIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.buriedCenterExposed");

export function isEarlyStall({ board, playerIndex, candidates }: Decision): boolean {
  return hasEarlyFullTableau(board.players[playerIndex]) && !hasDirectPounceUnload(candidates);
}

export function isStallRescue(player: PlayerState, candidate: ActionRankingCandidate): boolean {
  const { move, features } = candidate;
  if (move.type === "c2c") return move.source.type === "solitaire" &&
    (player.stacks[move.source.index].length === 1 || features[exposedCenterIndex] > 0);
  return isLayoutMove(move) && isUsefulLayout(player, candidate);
}

export function canTradeLayoutForCycle({ move, features }: ActionRankingCandidate): boolean {
  return isLayoutMove(move) && !directUnblockIndices.some((index) => features[index] > 0);
}

function isLayoutMove(move: Move): boolean {
  return move.type === "s2s" || (move.type === "c2s" && move.source === "deck");
}

export function isUsefulLayout(player: PlayerState, candidate: ActionRankingCandidate): boolean {
  const { move, features } = candidate;
  if (move.type !== "s2s" && (move.type !== "c2s" || move.source === "pounce")) return true;
  if (move.type === "s2s" && move.count === player.stacks[move.source].length) {
    return player.stacks[move.dest].length > 0;
  }
  return usefulLayoutIndices.some((index) => features[index] > 0);
}

export function bestIndex(scores: readonly number[]): number {
  return scores.reduce((best, score, index) => score > scores[best] ? index : best, 0);
}

export function prefer(scores: readonly number[], choice: number): number[] {
  const high = Math.max(...scores);
  return scores.map((score, index) => index === choice ? high + 1 : score);
}

export function isProductive(move: Move): boolean {
  return move.type === "c2c" || move.type === "c2s" || move.type === "s2s";
}

function isDirectPounce(move: Move): boolean {
  return (move.type === "c2c" && move.source.type === "pounce") ||
    (move.type === "c2s" && move.source === "pounce");
}

export function scorePouncePpoReference(anchor: NeuralActionRankingPolicy, decision: Decision): number[] {
  return decision.candidates.map(({ features }) => anchor.scoreFeatures(features, decision.memoryState));
}

export function greedyGuard(
  decision: Decision, reference: readonly number[], options: GreedyGuard, allowsLayout?: (move: Move) => boolean
): number[] | undefined {
  const { board, playerIndex, candidates, scores } = decision;
  if (options.earlyStallScope && !isEarlyStall(decision)) return reference.slice();
  const referenceIndex = bestIndex(reference);
  const learnedIndex = bestIndex(scores);
  if (referenceIndex === learnedIndex) return;
  const previous = candidates[referenceIndex];
  const next = candidates[learnedIndex];
  const pounceDowngrade = isDirectPounce(previous.move) &&
    (!isDirectPounce(next.move) || next.immediatePointDelta < previous.immediatePointDelta ||
      (previous.endsRound && !next.endsRound));
  const player = board.players[playerIndex];
  const nonProductiveChange = options.protectNonproductiveChanges && !isDirectPounce(next.move) &&
    (!isProductive(previous.move) || !isProductive(next.move));
  const allowedCycleChange = nonProductiveChange && isEarlyStall(decision) &&
    ((previous.move.type === "cycle" && isStallRescue(player, next)) ||
      (next.move.type === "cycle" && canTradeLayoutForCycle(previous)));
  if (pounceDowngrade || !isUsefulLayout(player, next) || (nonProductiveChange && !allowedCycleChange) ||
      (allowsLayout && !allowsLayout(next.move))) {
    return prefer(scores, referenceIndex);
  }
}

export function reviewProtectedPouncePpoDecision(
  base: PounceRoomReviewer, decision: Decision, protectedScores?: number[]
): readonly number[] | undefined {
  return base.reviewDecision(protectedScores ? { ...decision, scores: protectedScores } : decision) ?? undefined;
}

export function assertCompatiblePouncePpoReference(reference: NeuralActionRankingModel, model: NeuralActionRankingModel) {
  const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);
  if (reference.version === 1 || model.version === 1 || reference.version !== model.version ||
      !same(reference.hiddenLayerSizes, model.hiddenLayerSizes) || !same(reference.featureNames, model.featureNames)) {
    throw new Error("The initial checkpoint and frozen comparator must have the same canonical model shape.");
  }
  if (reference.version === 3 && model.version === 3 &&
      (!same(reference.recurrentInputWeights, model.recurrentInputWeights) ||
        !same(reference.recurrentStateWeights, model.recurrentStateWeights) ||
        !same(reference.recurrentBiases, model.recurrentBiases))) {
    throw new Error("Recurrent dynamics changed during a frozen PPO update");
  }
}
