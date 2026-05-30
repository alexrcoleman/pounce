import assert from "assert/strict";
import {
  trainNeuralActionRankingPolicy,
  type NeuralTrainingResult,
} from "../shared/ActionRankingTraining";

const commonOptions = {
  playerCount: 4,
  hiddenLayerSizes: [16],
  imitationDeals: 0,
  imitationEpochs: 1,
  imitationLearningRate: 0.02,
  improvementStates: 0,
  improvementEpochs: 1,
  improvementLearningRate: 0.01,
  rlEpisodes: 4,
  rlLearningRate: 0.00001,
  rlTemperature: 1.3,
  rlLocalRewardWeight: 0,
  rlLocalRewardDiscount: 0,
  rlBaselineMode: "greedy" as const,
  rlCommonRandom: true,
  rlCreditMode: "counterfactual" as const,
  rlCounterfactualRolloutCount: 1,
  rlCounterfactualRolloutMoves: 80,
  rlCounterfactualMinReturnGap: 0,
  rlUpdateEpochs: 1,
  rlUpdateScope: "exploratory" as const,
  rlNormalizeAdvantages: true,
  rlAdvantageClip: 3,
  maxMovesPerGame: 180,
};

const policyGradient = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:policy-gradient",
  rlCounterfactualTrainingMode: "policy_gradient",
});
assertCounterfactualWork(policyGradient, "policy_gradient");
assert.equal(
  policyGradient.reinforcement.counterfactualTrainingUpdates,
  policyGradient.reinforcement.counterfactualUpdateCount,
  "policy_gradient should train one policy update for each accepted counterfactual decision"
);
assert.ok(
  policyGradient.reinforcement.averagePolicyUpdates > 0,
  "policy_gradient should report policy updates"
);

const value = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assertCounterfactualWork(value, "value");
assert.equal(
  value.reinforcement.counterfactualTrainingUpdates,
  value.reinforcement.counterfactualUpdateCount * 2,
  "value mode should regress both selected and greedy candidate targets"
);
assert.equal(
  value.reinforcement.averagePolicyUpdates,
  0,
  "value mode should not fall back to policy-gradient updates"
);

console.log(
  JSON.stringify(
    {
      policyGradient: summarize(policyGradient),
      value: summarize(value),
    },
    null,
    2
  )
);

function assertCounterfactualWork(
  result: NeuralTrainingResult,
  mode: "policy_gradient" | "value"
): void {
  assert.ok(
    result.reinforcement.counterfactualUpdateCount > 0,
    `${mode} should collect counterfactual decision updates`
  );
  assert.ok(
    result.reinforcement.counterfactualTrainingUpdates > 0,
    `${mode} should apply training updates`
  );
}

function summarize(result: NeuralTrainingResult) {
  return {
    counterfactualUpdateCount: result.reinforcement.counterfactualUpdateCount,
    counterfactualTrainingUpdates:
      result.reinforcement.counterfactualTrainingUpdates,
    averagePolicyUpdates: result.reinforcement.averagePolicyUpdates,
    averageGradientUpdates: result.reinforcement.averageGradientUpdates,
    averageRawAdvantage: result.reinforcement.averageRawAdvantage,
    rawAdvantageStdDev: result.reinforcement.rawAdvantageStdDev,
  };
}
