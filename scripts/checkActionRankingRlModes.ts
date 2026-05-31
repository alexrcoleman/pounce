import assert from "assert/strict";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
} from "../shared/ActionRankingPolicy";
import {
  trainNeuralActionRankingPolicy,
  type NeuralTrainingResult,
} from "../shared/ActionRankingTraining";
import {
  createNeuralActionRankingModel,
  NeuralActionRankingPolicy,
  type NeuralActionRankingModelV2,
} from "../shared/NeuralActionRankingPolicy";
import { createBoard, type CardState } from "../shared/GameUtils";

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
const tacticalFeatureSurface = assertTacticalFeatureSurface();

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

const selfPlayEpisodePolicyGradient = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:self-play-episode-policy-gradient",
  rlOpponentMode: "self",
  rlCreditMode: "episode",
  rlEpisodes: 2,
  rlCounterfactualScanEpisodes: 2,
  rlUpdateScope: "all",
});
assert.equal(
  selfPlayEpisodePolicyGradient.reinforcement.opponentMode,
  "self",
  "self-play RL should report self opponent mode"
);
assert.equal(
  selfPlayEpisodePolicyGradient.reinforcement.averageTrainingPlayerCount,
  commonOptions.playerCount,
  "self-play RL should train from every active neural seat"
);
assert.ok(
  selfPlayEpisodePolicyGradient.reinforcement.averagePolicyUpdates > 0,
  "self-play episode RL should collect policy updates"
);

const championOpponentModel = createNeuralActionRankingModel(
  [16],
  "action-ranking-rl-mode-check:champion-opponent-model"
);
const championOpponentPolicyGradient = trainNeuralActionRankingPolicy({
  ...commonOptions,
  initialModel: championOpponentModel,
  rlOpponentModel: championOpponentModel,
  seed: "action-ranking-rl-mode-check:champion-opponent-policy-gradient",
  rlOpponentMode: "champion",
  rlCreditMode: "episode",
  rlEpisodes: 2,
  rlCounterfactualScanEpisodes: 2,
  rlUpdateScope: "all",
});
assert.equal(
  championOpponentPolicyGradient.reinforcement.opponentMode,
  "champion",
  "champion-opponent RL should report champion opponent mode"
);
assert.equal(
  championOpponentPolicyGradient.reinforcement.averageTrainingPlayerCount,
  1,
  "champion-opponent RL should train only the rotating learner seat"
);
assert.ok(
  championOpponentPolicyGradient.reinforcement.averagePolicyUpdates > 0,
  "champion-opponent episode RL should collect learner-seat policy updates"
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

const weightedPairwise = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:weighted-pairwise",
  rlCounterfactualTrainingMode: "pairwise",
  rlCounterfactualPairwiseWeightMode: "return_gap",
  rlCounterfactualPairwiseWeightScale: 100,
  rlCounterfactualPairwiseMaxWeight: 1,
});
assertCounterfactualWork(weightedPairwise, "pairwise");
assert.ok(
  weightedPairwise.reinforcement.counterfactualAveragePairWeight > 0 &&
    weightedPairwise.reinforcement.counterfactualAveragePairWeight < 1,
  "return-gap pairwise weighting should damp accepted counterfactual pair updates"
);
assert.equal(
  weightedPairwise.reinforcement.averagePolicyUpdates,
  0,
  "weighted pairwise mode should not fall back to policy-gradient updates"
);

const deltaPairwise = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:delta-pairwise",
  rlCounterfactualTrainingMode: "pairwise",
  rlCounterfactualPairwiseFeatureMode: "delta",
});
assertCounterfactualWork(deltaPairwise, "pairwise");
assert.equal(
  deltaPairwise.reinforcement.averagePolicyUpdates,
  0,
  "delta-feature pairwise mode should not fall back to policy-gradient updates"
);

const tacticalPairwise = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:tactical-pairwise",
  rlCounterfactualTrainingMode: "pairwise",
  rlCounterfactualPairwiseFeatureMode: "tactical",
});
assertCounterfactualWork(tacticalPairwise, "pairwise");
assert.equal(
  tacticalPairwise.reinforcement.averagePolicyUpdates,
  0,
  "tactical-feature pairwise mode should not fall back to policy-gradient updates"
);

const outputOnlyInitialModel = createNeuralActionRankingModel(
  [16],
  "action-ranking-rl-mode-check:output-only-model"
);
const outputOnlyValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  initialModel: outputOnlyInitialModel,
  seed: "action-ranking-rl-mode-check:output-only-value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
  rlTrainableLayers: "output",
});
assertCounterfactualWork(outputOnlyValue, "value");
assert.deepEqual(
  (outputOnlyValue.model as NeuralActionRankingModelV2).layerWeights,
  outputOnlyInitialModel.layerWeights,
  "output-only RL should leave hidden layer weights unchanged"
);
assert.deepEqual(
  (outputOnlyValue.model as NeuralActionRankingModelV2).layerBiases,
  outputOnlyInitialModel.layerBiases,
  "output-only RL should leave hidden layer biases unchanged"
);
assert.notDeepEqual(
  (outputOnlyValue.model as NeuralActionRankingModelV2).outputWeights,
  outputOnlyInitialModel.outputWeights,
  "output-only RL should still update output weights"
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

const pounceWeightedValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:pounce-weighted-value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualPounceRewardWeight: 1,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assertCounterfactualWork(pounceWeightedValue, "value");
assert.equal(
  pounceWeightedValue.reinforcement.averagePolicyUpdates,
  0,
  "pounce-weighted value mode should not fall back to policy-gradient updates"
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

const scanBudgetValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:scan-budget-value",
  rlEpisodes: 2,
  rlCounterfactualScanEpisodes: 4,
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.equal(
  scanBudgetValue.reinforcement.counterfactualScannedEpisodes,
  4,
  "supervised counterfactual scan budget should collect labels beyond RL episode metrics"
);
assert.ok(
  scanBudgetValue.reinforcement.counterfactualUpdateCount >
    scanBudgetValue.reinforcement.episodes,
  "supervised counterfactual scan budget should add accepted label opportunities"
);

const multiSeedScanValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:multi-seed-scan-value",
  rlEpisodes: 2,
  rlCounterfactualScanEpisodes: 3,
  rlCounterfactualScanSeedCount: 2,
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.equal(
  multiSeedScanValue.reinforcement.counterfactualScannedEpisodes,
  6,
  "supervised counterfactual scan seed count should multiply the scan budget"
);
assert.ok(
  multiSeedScanValue.reinforcement.counterfactualUpdateCount >
    multiSeedScanValue.reinforcement.episodes,
  "multi-seed scans should collect additional counterfactual labels"
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

const connectorAnchoredValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:connector-anchored-value:0",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
  rlCounterfactualConnectorAnchorWeight: 0.05,
  rlCounterfactualConnectorAnchorMaxExamples: 8,
});
assertCounterfactualWork(connectorAnchoredValue, "value");
assert.ok(
  connectorAnchoredValue.reinforcement
    .counterfactualConnectorAnchorExamples > 0,
  "connector-anchored value mode should collect connector-vs-cycle anchor examples"
);
assert.ok(
  connectorAnchoredValue.reinforcement
    .counterfactualConnectorAnchorUpdates > 0,
  "connector-anchored value mode should train connector-vs-cycle anchor updates"
);

const symmetricConnectorAnchoredValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:symmetric-connector-anchored-value:0",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
  rlCounterfactualConnectorAnchorWeight: 0.05,
  rlCounterfactualConnectorAnchorMaxExamples: 8,
  rlCounterfactualConnectorAnchorMode: "symmetric",
});
assertCounterfactualWork(symmetricConnectorAnchoredValue, "value");
assert.ok(
  symmetricConnectorAnchoredValue.reinforcement
    .counterfactualConnectorAnchorExamples > 0,
  "symmetric connector-anchored value mode should collect policy-ordered connector-vs-cycle anchor examples"
);
assert.ok(
  symmetricConnectorAnchoredValue.reinforcement
    .counterfactualConnectorAnchorUpdates > 0,
  "symmetric connector-anchored value mode should train policy-ordered connector-vs-cycle anchor updates"
);

const moveTypeAnchoredValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:move-type-anchored-value:0",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
  rlCounterfactualMoveTypeAnchorWeight: 0.05,
  rlCounterfactualMoveTypeAnchorMaxExamples: 8,
});
assertCounterfactualWork(moveTypeAnchoredValue, "value");
assert.ok(
  moveTypeAnchoredValue.reinforcement.counterfactualMoveTypeAnchorExamples > 0,
  "move-type anchored value mode should collect same-type label-state anchor examples"
);
assert.ok(
  moveTypeAnchoredValue.reinforcement.counterfactualMoveTypeAnchorUpdates > 0,
  "move-type anchored value mode should train same-type label-state anchor updates"
);

const scoreGapPrefiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:score-gap-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMaxScoreGap: 0.001,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.equal(
  scoreGapPrefiltered.reinforcement.counterfactualScoreGapSkippedCount,
  0,
  "strict score-gap prefiltering should not spend rollouts on labels that will be skipped by score gap"
);
assert.ok(
  scoreGapPrefiltered.reinforcement.averageCounterfactualScoreGap <= 0.001,
  "strict score-gap filtering should keep accepted labels within the score-gap cap"
);

const behaviorGapFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:behavior-gap-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualRequireBehaviorGap: true,
  rlCounterfactualMinBehaviorImprovement: 100,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  behaviorGapFiltered.reinforcement.counterfactualBehaviorGapSkippedCount > 0,
  "behavior-gap filtering should skip labels whose winner does not improve on greedy behavior"
);

const confidenceFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:confidence-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualRolloutCount: 3,
  rlCounterfactualRolloutMoves: 40,
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualGapStandardErrorMultiplier: 100,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  confidenceFiltered.reinforcement.counterfactualConfidenceSkippedCount > 0,
  "confidence filtering should skip labels with unstable rollout gaps"
);

const behaviorWinRateFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:behavior-win-rate-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualRolloutCount: 3,
  rlCounterfactualRolloutMoves: 40,
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualMinBehaviorWinRate: 1,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  behaviorWinRateFiltered.reinforcement
    .counterfactualBehaviorWinRateSkippedCount > 0,
  "behavior-win-rate filtering should skip labels whose winner is not consistently better than greedy behavior"
);

const behaviorWinsFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:behavior-wins-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualRolloutCount: 3,
  rlCounterfactualRolloutMoves: 40,
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualMinBehaviorWins: 3,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  behaviorWinsFiltered.reinforcement
    .counterfactualBehaviorWinRateSkippedCount > 0,
  "behavior-win-count filtering should skip labels that do not beat greedy behavior enough times"
);

const policyMarginFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:policy-margin-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMaxPolicyMargin: 0.001,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  policyMarginFiltered.reinforcement.counterfactualPolicyMarginSkippedCount > 0,
  "policy-margin filtering should skip settled high-margin decision states"
);

const policyChangeFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:policy-change-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  policyChangeFiltered.reinforcement.counterfactualPolicyChangeSkippedCount > 0,
  "policy-change filtering should skip labels whose rollout winner is already greedy"
);

const behaviorCorrectionValue = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:behavior-correction-value",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualBehaviorCorrectionWeight: 0.5,
  rlCounterfactualBehaviorCorrectionMargin: 0.03,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  behaviorCorrectionValue.reinforcement
    .counterfactualBehaviorCorrectionUpdates > 0,
  "behavior-correction value mode should train winner-vs-greedy auxiliary updates"
);

const scoreGapBudgetFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:score-gap-budget-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualScoreGapBudget: 4,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  scoreGapBudgetFiltered.reinforcement.counterfactualUpdateCount <= 4 &&
    scoreGapBudgetFiltered.reinforcement
      .counterfactualScoreGapBudgetSkippedCount > 0,
  "score-gap budget filtering should keep only the closest deployable labels"
);

const movePairBudgetFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:move-pair-budget-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualScoreGapBudget: 8,
  rlCounterfactualMaxLabelsPerMovePair: 1,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  movePairBudgetFiltered.reinforcement.counterfactualUpdateCount > 0 &&
    Object.values(
      movePairBudgetFiltered.reinforcement.counterfactualAcceptedMovePairCounts
    ).every((count) => count <= 1),
  "move-pair budget filtering should cap accepted labels by winner-vs-behavior move pair"
);

const movePairExcluded = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:move-pair-excluded",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualExcludedMovePairs: [
    "c2c>cycle",
    "c2s>cycle",
    "s2s>cycle",
    "cycle>c2s",
    "cycle>s2s",
    "c2c>c2c",
    "s2s>s2s",
    "c2s>c2s",
  ],
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  movePairExcluded.reinforcement.counterfactualMovePairExcludedSkippedCount > 0,
  "move-pair exclusion should skip matching supervised labels"
);
assert.ok(
  !Object.keys(
    movePairExcluded.reinforcement.counterfactualAcceptedMovePairCounts
  ).some((pair) =>
    [
      "c2c>cycle",
      "c2s>cycle",
      "s2s>cycle",
      "cycle>c2s",
      "cycle>s2s",
      "c2c>c2c",
      "s2s>s2s",
      "c2s>c2s",
    ].includes(pair)
  ),
  "move-pair exclusion should remove excluded pairs from accepted labels"
);

const sameMoveTypeFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:same-move-type-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualRequireSameMoveType: true,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.equal(
  sameMoveTypeFiltered.reinforcement.counterfactualMoveTypeMismatchSkippedCount,
  0,
  "same-move-type filtering should prefilter mismatched rollout candidates"
);
assert.ok(
  Object.keys(
    sameMoveTypeFiltered.reinforcement.counterfactualAcceptedMovePairCounts
  ).every(isSameMoveTypePair),
  "same-move-type filtering should only accept same-family move pairs"
);

const differentMoveTypeFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:different-move-type-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualRequireDifferentMoveType: true,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.equal(
  differentMoveTypeFiltered.reinforcement.counterfactualMoveTypeMatchSkippedCount,
  0,
  "different-move-type filtering should prefilter same-family rollout candidates"
);
assert.ok(
  Object.keys(
    differentMoveTypeFiltered.reinforcement.counterfactualAcceptedMovePairCounts
  ).every((pair) => !isSameMoveTypePair(pair)),
  "different-move-type filtering should only accept cross-family move pairs"
);

const behaviorMoveTypeFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:behavior-move-type-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualBehaviorMoveTypes: ["c2s"],
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  behaviorMoveTypeFiltered.reinforcement
    .counterfactualBehaviorMoveTypeSkippedCount > 0,
  "behavior-move-type filtering should skip off-family greedy behavior states"
);
assert.ok(
  Object.keys(
    behaviorMoveTypeFiltered.reinforcement.counterfactualAcceptedMovePairCounts
  ).every((pair) => isBehaviorMoveTypePair(pair, "c2s")),
  "behavior-move-type filtering should only accept labels with matching behavior move types"
);

const cappedScoreGapBudgetFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:capped-score-gap-budget-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualMaxScoreGap: 0.05,
  rlCounterfactualScoreGapBudget: 4,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  cappedScoreGapBudgetFiltered.reinforcement.counterfactualUpdateCount > 0 &&
    cappedScoreGapBudgetFiltered.reinforcement.counterfactualUpdateCount <= 4,
  "score-gap cap should keep a non-empty label set within the score-gap budget"
);
assert.equal(
  cappedScoreGapBudgetFiltered.reinforcement.counterfactualScoreGapSkippedCount,
  0,
  "score-gap cap should prefilter candidates before recording skipped labels"
);
assert.ok(
  cappedScoreGapBudgetFiltered.reinforcement.averageCounterfactualScoreGap <=
    0.05,
  "score-gap cap should keep accepted labels inside the configured score gap"
);

const validationFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:validation-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualValidationRolloutCount: 1,
  rlCounterfactualMinValidationWins: 2,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  validationFiltered.reinforcement.counterfactualValidationSkippedCount > 0,
  "held-out validation should skip labels that miss the validation win threshold"
);
assert.equal(
  validationFiltered.reinforcement.counterfactualUpdateCount,
  0,
  "an impossible held-out validation win threshold should reject every label"
);

const labelTargetStopped = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:label-target-stopped",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualStateSource: "greedy",
  rlCounterfactualScanEpisodes: 12,
  rlUpdateScope: "all",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMinReturnGap: 0,
  rlCounterfactualRequirePolicyChange: true,
  rlCounterfactualScoreGapBudget: 4,
  rlCounterfactualStopAfterLabels: 4,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  labelTargetStopped.reinforcement.counterfactualStoppedAfterLabelTarget &&
    labelTargetStopped.reinforcement.counterfactualScannedEpisodes < 12,
  "counterfactual label-target stopping should end broad scans early"
);

const maxReturnGapFiltered = trainNeuralActionRankingPolicy({
  ...commonOptions,
  seed: "action-ranking-rl-mode-check:max-return-gap-filtered",
  rlCounterfactualTrainingMode: "value",
  rlCounterfactualCandidateLimit: 5,
  rlCounterfactualMaxReturnGap: 0.001,
  rlCounterfactualValueTargetScale: 4,
  rlCounterfactualValueCenterTargets: true,
  rlCounterfactualValueHuberDelta: 0,
});
assert.ok(
  maxReturnGapFiltered.reinforcement.counterfactualMaxReturnGapSkippedCount > 0,
  "max-return-gap filtering should skip extreme counterfactual labels"
);

console.log(
  JSON.stringify(
    {
      featureExpansion,
      tacticalFeatureSurface,
      policyGradient: summarize(policyGradient),
      selfPlayEpisodePolicyGradient: summarize(selfPlayEpisodePolicyGradient),
      championOpponentPolicyGradient: summarize(
        championOpponentPolicyGradient
      ),
      value: summarize(value),
      weightedPairwise: summarize(weightedPairwise),
      deltaPairwise: summarize(deltaPairwise),
      tacticalPairwise: summarize(tacticalPairwise),
      outputOnlyValue: summarize(outputOnlyValue),
      scoreWeightedValue: summarize(scoreWeightedValue),
      pounceWeightedValue: summarize(pounceWeightedValue),
      residualValue: summarize(residualValue),
      broadValue: summarize(broadValue),
      greedyStateValue: summarize(greedyStateValue),
      scanBudgetValue: summarize(scanBudgetValue),
      anchoredValue: summarize(anchoredValue),
      connectorAnchoredValue: summarize(connectorAnchoredValue),
      symmetricConnectorAnchoredValue: summarize(
        symmetricConnectorAnchoredValue
      ),
      scoreGapPrefiltered: summarize(scoreGapPrefiltered),
      behaviorGapFiltered: summarize(behaviorGapFiltered),
      confidenceFiltered: summarize(confidenceFiltered),
      behaviorWinRateFiltered: summarize(behaviorWinRateFiltered),
      policyMarginFiltered: summarize(policyMarginFiltered),
      policyChangeFiltered: summarize(policyChangeFiltered),
      behaviorCorrectionValue: summarize(behaviorCorrectionValue),
      scoreGapBudgetFiltered: summarize(scoreGapBudgetFiltered),
      movePairBudgetFiltered: summarize(movePairBudgetFiltered),
      movePairExcluded: summarize(movePairExcluded),
      sameMoveTypeFiltered: summarize(sameMoveTypeFiltered),
      differentMoveTypeFiltered: summarize(differentMoveTypeFiltered),
      cappedScoreGapBudgetFiltered: summarize(cappedScoreGapBudgetFiltered),
      validationFiltered: summarize(validationFiltered),
      labelTargetStopped: summarize(labelTargetStopped),
      maxReturnGapFiltered: summarize(maxReturnGapFiltered),
    },
    null,
    2
  )
);

function assertCounterfactualWork(
  result: NeuralTrainingResult,
  mode: "policy_gradient" | "pairwise" | "value"
): void {
  assert.ok(
    result.reinforcement.counterfactualUpdateCount > 0,
    `${mode} should collect counterfactual decision updates`
  );
  assert.ok(
    result.reinforcement.counterfactualTrainingUpdates > 0,
    `${mode} should apply training updates`
  );
  if (mode !== "policy_gradient") {
    assert.equal(
      result.reinforcement.counterfactualPolicyShift.examples,
      result.reinforcement.counterfactualUpdateCount,
      `${mode} should report policy-shift diagnostics for supervised labels`
    );
  }
}

function summarize(result: NeuralTrainingResult) {
  return {
    opponentMode: result.reinforcement.opponentMode,
    averageTrainingPlayerCount:
      result.reinforcement.averageTrainingPlayerCount,
    counterfactualUpdateCount: result.reinforcement.counterfactualUpdateCount,
    counterfactualScannedEpisodes:
      result.reinforcement.counterfactualScannedEpisodes,
    counterfactualStoppedAfterLabelTarget:
      result.reinforcement.counterfactualStoppedAfterLabelTarget,
    averageCounterfactualCandidateCount:
      result.reinforcement.averageCounterfactualCandidateCount,
    averageCounterfactualScannedDecisionCount:
      result.reinforcement.averageCounterfactualScannedDecisionCount,
    counterfactualTrainingUpdates:
      result.reinforcement.counterfactualTrainingUpdates,
    counterfactualMaxReturnGapSkippedCount:
      result.reinforcement.counterfactualMaxReturnGapSkippedCount,
    counterfactualPolicyMarginSkippedCount:
      result.reinforcement.counterfactualPolicyMarginSkippedCount,
    counterfactualPolicyChangeSkippedCount:
      result.reinforcement.counterfactualPolicyChangeSkippedCount,
    counterfactualBehaviorGapSkippedCount:
      result.reinforcement.counterfactualBehaviorGapSkippedCount,
    counterfactualBehaviorConfidenceSkippedCount:
      result.reinforcement.counterfactualBehaviorConfidenceSkippedCount,
    counterfactualBehaviorWinRateSkippedCount:
      result.reinforcement.counterfactualBehaviorWinRateSkippedCount,
    counterfactualConfidenceSkippedCount:
      result.reinforcement.counterfactualConfidenceSkippedCount,
    counterfactualScoreGapSkippedCount:
      result.reinforcement.counterfactualScoreGapSkippedCount,
    counterfactualScoreGapBudgetSkippedCount:
      result.reinforcement.counterfactualScoreGapBudgetSkippedCount,
    counterfactualMovePairBudgetSkippedCount:
      result.reinforcement.counterfactualMovePairBudgetSkippedCount,
    counterfactualMovePairExcludedSkippedCount:
      result.reinforcement.counterfactualMovePairExcludedSkippedCount,
    counterfactualBehaviorMoveTypeSkippedCount:
      result.reinforcement.counterfactualBehaviorMoveTypeSkippedCount,
    counterfactualMoveTypeMismatchSkippedCount:
      result.reinforcement.counterfactualMoveTypeMismatchSkippedCount,
    counterfactualMoveTypeMatchSkippedCount:
      result.reinforcement.counterfactualMoveTypeMatchSkippedCount,
    counterfactualValidationSkippedCount:
      result.reinforcement.counterfactualValidationSkippedCount,
    counterfactualScoreReturnGapSkippedCount:
      result.reinforcement.counterfactualScoreReturnGapSkippedCount,
    counterfactualPounceProgressGapSkippedCount:
      result.reinforcement.counterfactualPounceProgressGapSkippedCount,
    counterfactualFeatureTieSkippedCount:
      result.reinforcement.counterfactualFeatureTieSkippedCount,
    counterfactualConnectorCycleSkippedCount:
      result.reinforcement.counterfactualConnectorCycleSkippedCount,
    counterfactualWeakConnectorCycleSkippedCount:
      result.reinforcement.counterfactualWeakConnectorCycleSkippedCount,
    counterfactualUsefulCycleSkippedCount:
      result.reinforcement.counterfactualUsefulCycleSkippedCount,
    counterfactualAcceptedMovePairCounts:
      result.reinforcement.counterfactualAcceptedMovePairCounts,
    averageCounterfactualBehaviorWinRate:
      result.reinforcement.averageCounterfactualBehaviorWinRate,
    averageCounterfactualValidationReturnGap:
      result.reinforcement.averageCounterfactualValidationReturnGap,
    averageCounterfactualValidationWinRate:
      result.reinforcement.averageCounterfactualValidationWinRate,
    counterfactualAveragePairWeight:
      result.reinforcement.counterfactualAveragePairWeight,
    counterfactualAnchorExamples:
      result.reinforcement.counterfactualAnchorExamples,
    counterfactualAnchorUpdates:
      result.reinforcement.counterfactualAnchorUpdates,
    counterfactualBehaviorCorrectionUpdates:
      result.reinforcement.counterfactualBehaviorCorrectionUpdates,
    counterfactualConnectorAnchorExamples:
      result.reinforcement.counterfactualConnectorAnchorExamples,
    counterfactualConnectorAnchorUpdates:
      result.reinforcement.counterfactualConnectorAnchorUpdates,
    counterfactualMoveTypeAnchorExamples:
      result.reinforcement.counterfactualMoveTypeAnchorExamples,
    counterfactualMoveTypeAnchorUpdates:
      result.reinforcement.counterfactualMoveTypeAnchorUpdates,
    counterfactualPolicyShift:
      result.reinforcement.counterfactualPolicyShift,
    averageCounterfactualScoreGap:
      result.reinforcement.averageCounterfactualScoreGap,
    averagePolicyUpdates: result.reinforcement.averagePolicyUpdates,
    averageGradientUpdates: result.reinforcement.averageGradientUpdates,
    averageRawAdvantage: result.reinforcement.averageRawAdvantage,
    rawAdvantageStdDev: result.reinforcement.rawAdvantageStdDev,
  };
}

function isSameMoveTypePair(movePair: string): boolean {
  const [winnerType, behaviorType] = movePair.split(">");
  return (
    winnerType != null &&
    behaviorType != null &&
    winnerType.trim().toLowerCase() === behaviorType.trim().toLowerCase()
  );
}

function isBehaviorMoveTypePair(movePair: string, moveType: string): boolean {
  const [, behaviorType] = movePair.split(">");
  return behaviorType?.trim().toLowerCase() === moveType.toLowerCase();
}

function assertLegacyFeatureExpansion() {
  const baseModel = createNeuralActionRankingModel(
    [8],
    "action-ranking-feature-expansion-check"
  );
  const droppedFeatures = [
    "own.pointDifferential",
    "source.stackHeight",
    "source.bottomValue",
    "source.exposesCard",
    "source.exposedValue",
    "source.exposedCenterPlayable",
    "source.exposedCanPlaySoon",
    "source.exposedMatchesPounceParity",
    "source.exposedPounceConnectorCloseness",
    "source.exposedOwnSolitaireDestinationCount",
    "cycle.revealsCard",
    "cycle.revealedValue",
    "cycle.revealedCenterPlayable",
    "cycle.revealedCanPlaySoon",
    "cycle.revealedOwnSolitaireDestinationCount",
    "cycle.revealedOwnSolitaireConnectorForPounce",
    "cycle.revealedMatchesPounceParity",
    "cycle.revealedPounceConnectorCloseness",
    "cycle.resetsWaste",
    "cycle.stockFractionAfter",
    "cycle.cardsAdvanced",
    "own.wasteCanPlaySoon",
    "own.wasteOwnSolitaireDestinationCount",
    "own.wasteOwnSolitaireConnectorForPounce",
    "own.wasteMatchesPounceParity",
    "own.wastePounceConnectorCloseness",
    "dest.bottomValue",
    "card.stackParity",
    "card.matchesPounceParity",
    "card.pounceConnectorCloseness",
    "center.opponentPounceCanFollowAfter",
    "center.opponentDeckCanFollowAfter",
    "center.opponentStackCanFollowAfter",
    "center.opponentPounceCanPlaySameNow",
    "card.centerPlayableDestinationCount",
    "card.ownSolitaireDestinationCount",
    "card.ownSolitaireConnectorForPounce",
    "solitaire.postTopConnectorCount",
    "solitaire.postTopConnectorCloseness",
    "solitaire.postTopConnectsPounce",
    "solitaire.postTopConnectsStackRoot",
    "solitaire.deckStockFraction",
    "cycle.resetRevealsCard",
    "cycle.resetRevealedValue",
    "cycle.resetRevealedCenterPlayable",
    "cycle.resetRevealedCanPlaySoon",
    "cycle.resetRevealedOwnSolitaireDestinationCount",
    "cycle.resetRevealedOwnSolitaireConnectorForPounce",
    "cycle.resetRevealedMatchesPounceParity",
    "cycle.resetRevealedPounceConnectorCloseness",
    "cycle.lookaheadCenterPlayableReach",
    "cycle.lookaheadCanPlaySoonReach",
    "cycle.lookaheadOwnSolitaireDestinationReach",
    "cycle.lookaheadOwnSolitaireConnectorForPounceReach",
    "cycle.lookaheadPounceConnectorReach",
    "own.stockLookaheadCenterPlayableReach",
    "own.stockLookaheadCanPlaySoonReach",
    "own.stockLookaheadOwnSolitaireDestinationReach",
    "own.stockLookaheadOwnSolitaireConnectorForPounceReach",
    "own.stockLookaheadPounceConnectorReach",
    "own.pounceCenterPlayable",
    "own.deckCenterPlayable",
    "own.stackCenterPlayableCount",
    "own.stackTopCanPlaySoonCount",
    "own.stackNextCenterPlayableCount",
    "own.stackNextCanPlaySoonCount",
    "own.stackNextPounceConnectorCloseness",
    "own.stackBottomPounceConnectorCloseness",
    "own.pounceCanPlaySoon",
    "opponent.pounceCenterPlayableCount",
    "opponent.deckCenterPlayableCount",
    "opponent.stackCenterPlayableCount",
    "opponent.pounceCanPlaySoonCount",
    "own.stockFraction",
    "own.wasteFraction",
    "own.pounceValue",
    "own.pounceStackParity",
    "opponent.minPounceCount",
    "opponent.maxPouncePressure",
    "center.ownPounceCanFollowAfter",
    "center.ownDeckCanFollowAfter",
    "center.ownStackCanFollowAfter",
    "center.opponentFollowPressureAfter",
    "center.opponentPounceFollowPressureAfter",
    "center.opponentSameNowPressure",
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

function assertTacticalFeatureSurface() {
  const board = createBoard(2);
  board.isActive = true;
  board.isDealt = true;
  board.piles = [
    [card("hearts", 4, -1)],
    [card("clubs", 3, -1)],
    [card("spades", 5, -1)],
    [card("diamonds", 4, -1)],
    [],
    [],
    [],
    [],
  ];
  board.players[0].pounceDeck = [card("clubs", 4, 0)];
  board.players[0].deck = [];
  board.players[0].flippedDeck = [card("hearts", 5, 0)];
  board.players[0].stacks = [
    [card("spades", 6, 0), card("hearts", 5, 0)],
    [card("hearts", 7, 0)],
    [],
    [],
  ];
  board.players[1].pounceDeck = [card("spades", 6, 1)];
  board.players[1].deck = [];
  board.players[1].flippedDeck = [card("diamonds", 5, 1)];
  board.players[1].stacks = [[card("hearts", 5, 1)], [], [], []];

  const cycleCandidate = enumerateActionRankingCandidates(board, 0).find(
    (candidate) => candidate.move.type === "cycle"
  );
  assert.ok(cycleCandidate, "feature check should include a cycle candidate");

  assert.equal(
    getFeature(cycleCandidate, "cycle.resetRevealsCard"),
    1,
    "cycle reset should expose the remembered next-pass waste card"
  );
  assert.equal(
    getFeature(cycleCandidate, "cycle.resetRevealedCenterPlayable"),
    1,
    "cycle reset memory should report center-playable next-pass cards"
  );
  assert.equal(
    getFeature(
      cycleCandidate,
      "cycle.resetRevealedOwnSolitaireConnectorForPounce"
    ),
    1,
    "cycle reset memory should report next-pass pounce connectors"
  );
  assert.ok(
    getFeature(cycleCandidate, "cycle.resetRevealedPounceConnectorCloseness") >
      0,
    "cycle reset memory should carry pounce connector closeness"
  );
  assert.ok(
    getFeature(
      cycleCandidate,
      "cycle.lookaheadOwnSolitaireConnectorForPounceReach"
    ) > 0,
    "cycle lookahead should see useful deck cards after a waste reset"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.pounceCenterPlayable"),
    1,
    "visible pressure should mark own playable pounce card"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.deckCenterPlayable"),
    1,
    "visible pressure should mark own playable waste card"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.wasteCanPlaySoon"),
    1,
    "deck context should mark visible waste cards close to center play"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.wasteOwnSolitaireDestinationCount") > 0,
    "deck context should count solitaire destinations for visible waste cards"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.wasteOwnSolitaireConnectorForPounce"),
    1,
    "deck context should mark waste cards that make the pounce card playable"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.wasteMatchesPounceParity"),
    1,
    "deck context should expose waste-card pounce parity"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.wastePounceConnectorCloseness") > 0,
    "deck context should expose waste-card pounce connector closeness"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.wasteFraction"),
    1,
    "deck context should expose how far through the current waste pass we are"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.pounceValue"),
    4 / 13,
    "board context should expose the current pounce card value"
  );
  assert.equal(
    getFeature(cycleCandidate, "own.pounceStackParity"),
    1,
    "board context should expose the current pounce card stack parity"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.stackCenterPlayableCount") > 0,
    "visible pressure should count own playable solitaire tops"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.stackTopCanPlaySoonCount") > 0,
    "solitaire context should count own stack tops close to center play"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.stackNextCenterPlayableCount") > 0,
    "solitaire context should count buried cards that can play if exposed"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.stackNextCanPlaySoonCount") > 0,
    "solitaire context should count buried cards close to center play"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.stackNextPounceConnectorCloseness") > 0,
    "solitaire context should expose buried pounce connector closeness"
  );
  assert.ok(
    getFeature(cycleCandidate, "own.stackBottomPounceConnectorCloseness") > 0,
    "solitaire context should expose bottom-card pounce connector closeness"
  );
  assert.ok(
    getFeature(cycleCandidate, "opponent.pounceCenterPlayableCount") > 0,
    "visible pressure should count opponent playable pounce cards"
  );
  assert.ok(
    getFeature(cycleCandidate, "opponent.deckCenterPlayableCount") > 0,
    "visible pressure should count opponent playable waste cards"
  );
  assert.ok(
    getFeature(cycleCandidate, "opponent.stackCenterPlayableCount") > 0,
    "visible pressure should count opponent playable solitaire tops"
  );
  assert.ok(
    getFeature(cycleCandidate, "opponent.pounceCanPlaySoonCount") > 0,
    "visible pressure should count opponent pounce cards close to center play"
  );

  const exposingCenterCandidate = enumerateActionRankingCandidates(
    board,
    0
  ).find(
    (candidate) =>
      candidate.move.type === "c2c" &&
      candidate.move.source.type === "solitaire"
  );
  assert.ok(
    exposingCenterCandidate,
    "feature check should include a center move exposing a solitaire card"
  );
  assert.ok(
    getFeature(
      exposingCenterCandidate,
      "source.exposedOwnSolitaireDestinationCount"
    ) > 0,
    "source exposure should count solitaire destinations for the exposed card"
  );

  const stockLookaheadBoard = createBoard(2);
  stockLookaheadBoard.isActive = true;
  stockLookaheadBoard.isDealt = true;
  stockLookaheadBoard.piles = [
    [card("hearts", 4, -1)],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  stockLookaheadBoard.players[0].pounceDeck = [card("clubs", 4, 0)];
  stockLookaheadBoard.players[0].flippedDeck = [];
  stockLookaheadBoard.players[0].stacks = [[card("spades", 6, 0)], [], [], []];
  stockLookaheadBoard.players[0].deck = [
    card("hearts", 5, 0),
    card("clubs", 8, 0),
    card("clubs", 9, 0),
    card("clubs", 10, 0),
    card("clubs", 11, 0),
    card("clubs", 12, 0),
  ];
  const stockLookaheadCycle = enumerateActionRankingCandidates(
    stockLookaheadBoard,
    0
  ).find((candidate) => candidate.move.type === "cycle");
  assert.ok(
    stockLookaheadCycle,
    "feature check should include a future-stock cycle candidate"
  );
  assert.equal(
    getFeature(stockLookaheadCycle, "cycle.revealedCenterPlayable"),
    0,
    "future stock check should not rely on the immediate cycle reveal"
  );
  assert.ok(
    getFeature(stockLookaheadCycle, "cycle.lookaheadCenterPlayableReach") > 0,
    "cycle lookahead should see center-playable cards beyond the next reveal"
  );
  assert.ok(
    getFeature(stockLookaheadCycle, "own.stockLookaheadCenterPlayableReach") > 0,
    "deck context should expose center-playable stock memory to every action"
  );
  assert.ok(
    getFeature(
      stockLookaheadCycle,
      "cycle.lookaheadOwnSolitaireDestinationReach"
    ) > 0,
    "cycle lookahead should see future stock cards with solitaire destinations"
  );
  assert.ok(
    getFeature(
      stockLookaheadCycle,
      "own.stockLookaheadOwnSolitaireDestinationReach"
    ) > 0,
    "deck context should expose future stock solitaire destinations"
  );
  assert.equal(
    getFeature(stockLookaheadCycle, "own.stockFraction"),
    1,
    "deck context should expose the stock fraction to every action"
  );
  assert.ok(
    getFeature(stockLookaheadCycle, "cycle.ownPounceCount") > 0,
    "cycle context should expose pounce count only on cycle-like actions"
  );

  const centerPressureBoard = createBoard(2);
  centerPressureBoard.isActive = true;
  centerPressureBoard.isDealt = true;
  centerPressureBoard.piles = [
    [card("hearts", 4, -1)],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  centerPressureBoard.players[0].pounceDeck = [card("hearts", 6, 0)];
  centerPressureBoard.players[0].deck = [];
  centerPressureBoard.players[0].flippedDeck = [card("hearts", 5, 0)];
  centerPressureBoard.players[0].stacks = [
    [card("hearts", 6, 0)],
    [],
    [],
    [],
  ];
  centerPressureBoard.players[1].pounceDeck = [
    card("clubs", 2, 1),
    card("hearts", 6, 1),
  ];
  centerPressureBoard.players[1].deck = [];
  centerPressureBoard.players[1].flippedDeck = [card("hearts", 5, 1)];
  centerPressureBoard.players[1].stacks = [
    [card("hearts", 6, 1)],
    [],
    [],
    [],
  ];
  const centerPressureCandidate = enumerateActionRankingCandidates(
    centerPressureBoard,
    0
  ).find(
    (candidate) =>
      candidate.move.type === "c2c" &&
      candidate.move.source.type === "deck"
  );
  assert.ok(
    centerPressureCandidate,
    "feature check should include a center move with follow pressure"
  );
  assert.ok(
    getFeature(centerPressureCandidate, "center.ownPounceCanFollowAfter") > 0,
    "center pressure should report own pounce follow-up cards"
  );
  assert.ok(
    getFeature(centerPressureCandidate, "center.ownStackCanFollowAfter") > 0,
    "center pressure should report own solitaire follow-up cards"
  );
  assert.ok(
    getFeature(centerPressureCandidate, "center.opponentFollowPressureAfter") >
      0,
    "center pressure should weight opponent follow-up cards by pounce urgency"
  );
  assert.ok(
    getFeature(
      centerPressureCandidate,
      "center.opponentPounceFollowPressureAfter"
    ) > 0,
    "center pressure should separately expose opponent pounce follow-ups"
  );
  assert.ok(
    getFeature(centerPressureCandidate, "center.opponentSameNowPressure") > 0,
    "center pressure should weight opponents that could race the same center card"
  );
  assert.ok(
    getFeature(centerPressureCandidate, "opponent.minPounceCount") > 0,
    "visible pressure should expose the closest opponent pounce count"
  );
  assert.ok(
    getFeature(centerPressureCandidate, "opponent.maxPouncePressure") > 0,
    "visible pressure should expose low-pounce opponent urgency"
  );
  assert.equal(
    getFeature(centerPressureCandidate, "cycle.ownPounceCount"),
    0,
    "cycle context should stay inactive on non-cycle actions"
  );

  return {
    featureCount: ACTION_RANKING_FEATURE_NAMES.length,
    cycleResetRevealedValue: getFeature(
      cycleCandidate,
      "cycle.resetRevealedValue"
    ),
    cycleLookaheadCenterPlayableReach: getFeature(
      stockLookaheadCycle,
      "cycle.lookaheadCenterPlayableReach"
    ),
    stockLookaheadCenterPlayableReach: getFeature(
      stockLookaheadCycle,
      "own.stockLookaheadCenterPlayableReach"
    ),
    opponentPouncePressure: getFeature(
      cycleCandidate,
      "opponent.pounceCenterPlayableCount"
    ),
    cycleOwnPounceCount: getFeature(stockLookaheadCycle, "cycle.ownPounceCount"),
  };
}

function getFeature(
  candidate: { features: readonly number[] },
  featureName: (typeof ACTION_RANKING_FEATURE_NAMES)[number]
): number {
  const index = ACTION_RANKING_FEATURE_NAMES.indexOf(featureName);
  assert.ok(index >= 0, `${featureName} should exist`);
  return candidate.features[index] ?? 0;
}

function card(
  suit: CardState["suit"],
  value: CardState["value"],
  player: number
): CardState {
  return { suit, value, player };
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
