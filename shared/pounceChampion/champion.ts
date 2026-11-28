import { createPounceLaneLayoutTracker } from "../PounceActionAdvantage";
import { NeuralActionRankingPolicy, type NeuralActionRankingModel } from "../NeuralActionRankingPolicy";
import championModel from "../models/pounceChampion/strategy-format-candidate.json";
import scopedCheckpoint from "../models/pounceChampion/pounce-gpu-ppo-wide-terminal-v1.json";
import { createCenterDeadlineReviewer } from "./centerDeadline";
import { createDelayedOutcomeReviewer, createObservedDeadlineReviewer } from "./foundation";
import { createIncomingBoardReviewer } from "./incomingBoard";
import { createParallelLanesReviewer } from "./parallelLanes";
import { createTerminalReadoutReviewer } from "./terminalReadout";
import type { PounceRoomReviewer } from "./types";
import { assertCompatiblePouncePpoReference, greedyGuard, isEarlyStall, reviewProtectedPouncePpoDecision, scorePouncePpoReference } from "./upperPolicyUtils";

export const pounceChampionModel = championModel as NeuralActionRankingModel;
let scorer: NeuralActionRankingPolicy | undefined;
let scopedPolicy: NeuralActionRankingPolicy | undefined;

export function getPounceChampionScorer(): NeuralActionRankingPolicy {
  return scorer ??= new NeuralActionRankingPolicy(pounceChampionModel);
}

function getScopedPolicy(): NeuralActionRankingPolicy {
  if (!scopedPolicy) {
    const policy = new NeuralActionRankingPolicy(scopedCheckpoint as NeuralActionRankingModel);
    assertCompatiblePouncePpoReference(getPounceChampionScorer().getModel(), policy.getModel());
    scopedPolicy = policy;
  }
  return scopedPolicy;
}

function createScopedPpoReviewer(base: PounceRoomReviewer): PounceRoomReviewer {
  const scoped = getScopedPolicy();
  const layout = createPounceLaneLayoutTracker();
  const options = { earlyStallScope: true, protectNonproductiveChanges: true };
  return {
    ...base,
    reviewDecision(decision) {
      const scores = decision.scores.slice();
      const inScope = decision.board.players.filter((player) => !player.isSpectating).length === 4;
      const updated = inScope && isEarlyStall(decision)
        ? { ...decision, scores: scorePouncePpoReference(scoped, decision) }
        : decision;
      const allowsLayout = inScope ? layout(decision) : undefined;
      const protectedScores = inScope ? greedyGuard(updated, scores, options, allowsLayout) : scores;
      return reviewProtectedPouncePpoDecision(base, updated, protectedScores) ?? protectedScores ??
        (updated === decision ? undefined : updated.scores);
    },
  };
}

/** Build the same reviewer stack for live rooms and benchmark replays. */
export function createPounceChampionReviewer(): PounceRoomReviewer {
  const observed = createObservedDeadlineReviewer();
  const center = createCenterDeadlineReviewer(observed, createDelayedOutcomeReviewer("baseline"));
  const lanes = createParallelLanesReviewer(center);
  const terminal = createTerminalReadoutReviewer(lanes, createDelayedOutcomeReviewer("baseline"));
  return createIncomingBoardReviewer(createScopedPpoReviewer(terminal));
}
