import { ACTION_RANKING_FEATURE_NAMES, type ActionRankingFeatureName } from "../ActionRankingPolicy";
import { isProductiveMove, type Move } from "../MoveHandler";
import {
  allowsVisibleLaneOverride,
  createPounceLaneLayoutTracker,
  reviewPounceActionAdvantage,
  type PounceActionAdvantageModel,
} from "../PounceActionAdvantage";
import { createPounceConnectorPolicy } from "../PounceConnectorPolicy";
import { reviewIncomingPremove } from "../PounceIncomingPremove";
import { getLateCenterRaces } from "../PouncePlanner";
import incomingModel from "../models/pounceChampion/pounce-incoming-advantage-model-1.json";
import outcomeModel from "../models/pounceChampion/pounce-whole-round-delayed-tuner-weights.json";
import type { PounceRoomReviewer } from "./types";
import { bestIndex, prefer } from "./upperPolicyUtils";

const incoming = incomingModel as PounceActionAdvantageModel;
const outcomeUnits: readonly [number, readonly [ActionRankingFeatureName, number][]][] = [
  [5, [["source.exposedCenterPlayable", 2], ["solitaire.exposesCenterPlayable", 2]]],
  [9, [["strategy.centerOwnPounceFollow", 1]]],
  [10, [["strategy.centerOpponentPounceAccess", 1]]],
  [11, [["strategy.centerWinningFinishFeed", 1]]],
];
const activeUnits = new Set(outcomeUnits.map(([index]) => index));
if (outcomeModel.weights.length !== 12 || outcomeModel.weights.some((weight, index) =>
  !Number.isFinite(weight) || (weight !== 0 && !activeUnits.has(index)))) {
  throw new Error("Unexpected Pounce outcome readout terms");
}
const outcomeTerms = outcomeUnits.map(([weightIndex, inputs]) => ({
  weight: outcomeModel.weights[weightIndex],
  inputs: inputs.map(([name, coefficient]) => [ACTION_RANKING_FEATURE_NAMES.indexOf(name), coefficient] as const),
}));
const lastSlot = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.lastSlotUsed");
const connectsPounce = ACTION_RANKING_FEATURE_NAMES.indexOf("solitaire.postTopConnectsPounce");

function createReactiveReviewer(): PounceRoomReviewer {
  const connector = createPounceConnectorPolicy({ source: "waste" });
  return {
    reviewDecision(decision) {
      const { board, playerIndex, candidates, hands, scores } = decision;
      const lost = getLateCenterRaces(board, playerIndex, candidates, hands, 1.1);
      const masked = lost.length ? scores.map((score, index) => lost.includes(index) ? -Infinity : score) : undefined;
      const context = masked ? { ...decision, scores: masked } : decision;
      return reviewIncomingPremove(context, "unblock", 1) ??
        reviewPounceActionAdvantage(context, incoming) ?? connector.reviewDecision(context) ?? masked;
    },
    reviewMove: connector.reviewMove,
  };
}

function pouncePriority(move: Move): number {
  if (move.type === "c2c" && move.source.type === "pounce") return 3;
  if (move.type === "c2s" && move.source === "pounce") return 2;
  return 0;
}

function outcomeAdjustment(features: readonly number[]): number {
  return outcomeTerms.reduce((sum, { weight, inputs }) => {
    if (!weight) return sum;
    const activation = inputs.reduce((value, [index, coefficient]) => value + features[index] * coefficient, 0);
    return sum + weight * (Math.tanh(activation) + 1);
  }, 0);
}

export function createDelayedOutcomeReviewer(side: "candidate" | "baseline"): PounceRoomReviewer {
  const actual = createReactiveReviewer();
  if (side === "baseline") return actual;
  const track = createPounceLaneLayoutTracker();
  return {
    ...actual,
    reviewDecision(decision) {
      const { board, candidates, scores, hands, playerIndex } = decision;
      if (board.players.filter((player) => !player.isSpectating).length !== 4) return actual.reviewDecision(decision);
      const visited = track(decision);
      const ordinary = actual.reviewDecision(decision);
      if (ordinary?.some((score, index) => Number.isFinite(score) && score > scores[index])) return ordinary;
      if (candidates.length < 2 || hands[playerIndex]?.item) return ordinary;
      const masked = ordinary ?? scores;
      const raw = bestIndex(masked);
      const usual = candidates[raw];
      if (usual.endsRound || (!isProductiveMove(usual.move) && usual.move.type !== "cycle")) return ordinary;
      const protectedPounce = candidates.reduce((value, candidate, index) =>
        Number.isFinite(masked[index]) ? Math.max(value, pouncePriority(candidate.move)) : value, pouncePriority(usual.move));
      const adjusted = masked.map((score, index) => {
        if (index === raw) return score + outcomeAdjustment(candidates[index].features);
        if (!Number.isFinite(score)) return score;
        const candidate = candidates[index];
        const { move, features } = candidate;
        if ((!isProductiveMove(move) && move.type !== "cycle") || pouncePriority(move) < protectedPounce ||
          !allowsVisibleLaneOverride(usual, candidate) || !visited(move) ||
          (move.type === "c2s" && move.source === "deck" && features[lastSlot] > 0 && features[connectsPounce] <= 0)) {
          return -Infinity;
        }
        return score + outcomeAdjustment(features);
      });
      const next = bestIndex(adjusted);
      return candidates[next].equivalenceKey === usual.equivalenceKey ? ordinary : prefer(masked, next);
    },
  };
}
