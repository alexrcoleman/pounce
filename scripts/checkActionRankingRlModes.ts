import assert from "assert/strict";
import { ACTION_RANKING_FEATURE_NAMES } from "../shared/ActionRankingPolicy";
import {
  trainNeuralActionRankingPolicy,
  type NeuralTrainingResult,
} from "../shared/ActionRankingTraining";
import {
  createNeuralActionRankingModel,
  NeuralActionRankingPolicy,
  type NeuralActionRankingModelV2,
} from "../shared/NeuralActionRankingPolicy";

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
  rlCounterfactualScoreRewardWeight: 0,
  rlUpdateEpochs: 1,
  rlUpdateScope: "exploratory" as const,
  rlNormalizeAdvantages: true,
  rlAdvantageClip: 3,
  maxMovesPerGame: 180,
};

const featureExpansion = assertLegacyFeatureExpansion();

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
  value.reinforcement.averageCounterfactualCandidateCount,
  2,
  "default value mode should evaluate selected and greedy candidates"
);
assert.equal(
  value.reinforcement.averagePolicyUpdates,
  0,
  "value mode should not fall back to policy-gradient updates"
);

const scoreWeightedValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:score-weighted-value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualScoreRewardWeight: 0.5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assertCounterfactualWork(scoreWeightedValue, "value");
assert.equal(
  scoreWeightedValue.reinforcement.counterfactualTrainingUpdates,
  scoreWeightedValue.reinforcement.counterfactualUpdateCount * 2,
  "score-weighted value mode should regress selected and greedy candidate targets"
);
assert.equal(
  scoreWeightedValue.reinforcement.averagePolicyUpdates,
  0,
  "score-weighted value mode should not fall back to policy-gradient updates"
);

const residualValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:residual-value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueTargetMode: "residual",
  rlCounterfactualValueHuberDelta: 0,
});
assertCounterfactualWork(residualValue, "value");
assert.equal(
  residualValue.reinforcement.counterfactualTrainingUpdates,
  residualValue.reinforcement.counterfactualUpdateCount * 2,
  "residual value mode should regress both selected and greedy candidate targets"
);
assert.equal(
  residualValue.reinforcement.averagePolicyUpdates,
  0,
  "residual value mode should not fall back to policy-gradient updates"
);

const broadValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:broad-value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assertCounterfactualWork(broadValue, "value");
assert.ok(
  broadValue.reinforcement.averageCounterfactualCandidateCount > 2,
  "broad value mode should evaluate more than selected and greedy candidates"
);
assert.ok(
  broadValue.reinforcement.counterfactualTrainingUpdates >
    broadValue.reinforcement.counterfactualUpdateCount * 2,
  "broad value mode should train extra candidate value targets"
);
assert.equal(
  broadValue.reinforcement.averagePolicyUpdates,
  0,
  "broad value mode should not fall back to policy-gradient updates"
);

const greedyStateValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:greedy-state-value",
  rlCounterfactualStateSource: "greedy",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assertCounterfactualWork(greedyStateValue, "value");
assert.equal(
  greedyStateValue.reinforcement.averageExploratoryDecisionCount,
  0,
  "greedy-state value mode should collect non-exploratory policy states"
);
assert.ok(
  greedyStateValue.reinforcement.counterfactualUpdateCount >
    greedyStateValue.reinforcement.averageExploratoryDecisionCount,
  "greedy-state value mode should bypass exploratory filtering for supervised counterfactual labels"
);
assert.equal(
  greedyStateValue.reinforcement.averagePolicyUpdates,
  0,
  "greedy-state value mode should not fall back to policy-gradient updates"
);

const anchoredValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:anchored-value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
  rlCounterfactualAnchorWeight: 0.05,
  rlCounterfactualAnchorMaxExamples: 8,
});
assertCounterfactualWork(anchoredValue, "value");
assert.ok(
  anchoredValue.reinforcement.counterfactualAnchorExamples > 0,
  "anchored value mode should collect anchor examples"
);
assert.ok(
  anchoredValue.reinforcement.counterfactualAnchorUpdates > 0,
  "anchored value mode should train anchor updates"
);
assert.ok(
  anchoredValue.reinforcement.counterfactualTrainingUpdates >
    anchoredValue.reinforcement.counterfactualUpdateCount * 2,
  "anchored value mode should include value and anchor updates"
);

const scoreGapFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:score-gap-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMaxScoreGap: 0.001,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  scoreGapFiltered.reinforcement.counterfactualScoreGapSkippedCount > 0,
  "score-gap filtering should skip labels that fight a large policy score gap"
);

console.log(
  JSON.stringify(
    {
      featureExpansion,
      policyGradient: summarize(policyGradient),
      value: summarize(value),
      scoreWeightedValue: summarize(scoreWeightedValue),
      residualValue: summarize(residualValue),
      broadValue: summarize(broadValue),
      greedyStateValue: summarize(greedyStateValue),
      anchoredValue: summarize(anchoredValue),
      scoreGapFiltered: summarize(scoreGapFiltered),
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
    averageCounterfactualCandidateCount:
      result.reinforcement.averageCounterfactualCandidateCount,
    counterfactualTrainingUpdates:
      result.reinforcement.counterfactualTrainingUpdates,
    counterfactualScoreGapSkippedCount:
      result.reinforcement.counterfactualScoreGapSkippedCount,
    counterfactualAnchorExamples:
      result.reinforcement.counterfactualAnchorExamples,
    counterfactualAnchorUpdates:
      result.reinforcement.counterfactualAnchorUpdates,
    averagePolicyUpdates: result.reinforcement.averagePolicyUpdates,
    averageGradientUpdates: result.reinforcement.averageGradientUpdates,
    averageRawAdvantage: result.reinforcement.averageRawAdvantage,
    rawAdvantageStdDev: result.reinforcement.rawAdvantageStdDev,
  };
}

function assertLegacyFeatureExpansion() {
  const baseModel = createNeuralActionRankingModel(
    [8],
    "action-ranking-feature-expansion-check"
  );
  const droppedFeatures = [
    "card.centerPlayableDestinationCount",
    "card.ownSolitaireDestinationCount",
    "card.ownSolitaireConnectorForPounce",
  ].filter((featureName) => baseModel.featureNames.includes(featureName));
  assert.ok(
    droppedFeatures.length > 0,
    "feature expansion check should drop at least one current feature"
  );

  const legacyFeatureNames = baseModel.featureNames.filter(
    (featureName) => !droppedFeatures.includes(featureName)
  );
  const legacyInputWeights = baseModel.layerWeights[0].map((weights) =>
    legacyFeatureNames.map((featureName) => {
      const oldIndex = baseModel.featureNames.indexOf(featureName);
      return weights[oldIndex] ?? 0;
    })
  );
  const legacyModel: NeuralActionRankingModelV2 = {
    ...baseModel,
    featureNames: legacyFeatureNames,
    inputSize: legacyFeatureNames.length,
    layerWeights: [
      legacyInputWeights,
      ...baseModel.layerWeights
        .slice(1)
        .map((layer) => layer.map((weights) => weights.slice())),
    ],
    layerBiases: baseModel.layerBiases.map((biases) => biases.slice()),
    outputWeights: baseModel.outputWeights.slice(),
  };
  const features = ACTION_RANKING_FEATURE_NAMES.map(
    (_, index) => ((index % 11) - 5) / 5
  );
  const legacyScore = scoreModelOnCurrentFeatures(legacyModel, features);
  const expandedPolicy = new NeuralActionRankingPolicy(legacyModel);
  const expandedModel = expandedPolicy.getModel() as NeuralActionRankingModelV2;
  const expandedScore = expandedPolicy.scoreFeatures(features);

  assert.equal(expandedModel.inputSize, ACTION_RANKING_FEATURE_NAMES.length);
  assert.deepEqual(expandedModel.featureNames, ACTION_RANKING_FEATURE_NAMES);
  assert.ok(
    Math.abs(legacyScore - expandedScore) < 1e-12,
    "expanding legacy feature weights should preserve scores"
  );
  droppedFeatures.forEach((featureName) => {
    const featureIndex = expandedModel.featureNames.indexOf(featureName);
    assert.ok(featureIndex >= 0, `${featureName} should be present after expand`);
    expandedModel.layerWeights[0].forEach((weights) => {
      assert.equal(
        weights[featureIndex],
        0,
        `${featureName} should start with zero input weight`
      );
    });
  });

  return {
    legacyFeatureCount: legacyModel.featureNames.length,
    expandedFeatureCount: expandedModel.featureNames.length,
    droppedFeatures,
    maxScoreDelta: Math.abs(legacyScore - expandedScore),
  };
}

function scoreModelOnCurrentFeatures(
  model: NeuralActionRankingModelV2,
  features: readonly number[]
): number {
  let previousActivation = model.layerWeights[0].map((weights, hiddenIndex) => {
    const raw =
      model.layerBiases[0][hiddenIndex] +
      weights.reduce((sum, weight, featureIndex) => {
        const featureName = model.featureNames[featureIndex];
        const currentFeatureIndex = ACTION_RANKING_FEATURE_NAMES.indexOf(
          featureName as (typeof ACTION_RANKING_FEATURE_NAMES)[number]
        );
        assert.ok(
          currentFeatureIndex >= 0,
          `${featureName} should exist in the current feature list`
        );
        return sum + weight * features[currentFeatureIndex];
      }, 0);
    return Math.tanh(raw);
  });

  for (let layerIndex = 1; layerIndex < model.layerWeights.length; layerIndex++) {
    previousActivation = model.layerWeights[layerIndex].map(
      (weights, hiddenIndex) => {
        const raw =
          model.layerBiases[layerIndex][hiddenIndex] +
          weights.reduce(
            (sum, weight, inputIndex) =>
              sum + weight * previousActivation[inputIndex],
            0
          );
        return Math.tanh(raw);
      }
    );
  }

  return (
    model.outputBias +
    model.outputWeights.reduce(
      (sum, weight, hiddenIndex) =>
        sum + weight * previousActivation[hiddenIndex],
      0
    )
  );
}
