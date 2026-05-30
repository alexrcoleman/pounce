import fs from "fs";
import { trainNeuralActionRankingPolicy } from "../shared/ActionRankingTraining";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

const modelIn = process.env.MODEL_IN;
const initialModel = modelIn
  ? (JSON.parse(fs.readFileSync(modelIn, "utf8")) as NeuralActionRankingModel)
  : undefined;
const hiddenLayerSizes =
  initialModel == null
    ? readIntegerListEnv("HIDDEN_LAYERS", readIntegerListEnv("HIDDEN", [48]))
    : getModelHiddenLayerSizes(initialModel);

const options = {
  playerCount: readIntegerEnv("PLAYERS", 4),
  hiddenLayerSizes,
  seed: process.env.SEED ?? "action-ranking-training",
  imitationDeals: readIntegerEnv("IMITATION_DEALS", 24),
  imitationEpochs: readIntegerEnv("IMITATION_EPOCHS", 4),
  imitationLearningRate: readNumberEnv("IMITATION_LR", 0.02),
  imitationEquivalentTargets: readBooleanEnv("IMITATION_EQUIVALENT_TARGETS", false),
  improvementStates: readIntegerEnv("IMPROVEMENT_STATES", 0),
  improvementStateSource: readImprovementStateSourceEnv(
    "IMPROVEMENT_STATE_SOURCE",
    "teacher"
  ),
  improvementStateTemperature: readNumberEnv("IMPROVEMENT_STATE_TEMPERATURE", 1),
  improvementStateSample: readBooleanEnv("IMPROVEMENT_STATE_SAMPLE", false),
  improvementMaxPolicyScoreGap: readNumberEnv("IMPROVEMENT_MAX_SCORE_GAP", 0),
  improvementMaxWinnerPolicyScoreGap: readNumberEnv(
    "IMPROVEMENT_MAX_WINNER_SCORE_GAP",
    0
  ),
  improvementMaxCandidatePolicyScoreGap: readNumberEnv(
    "IMPROVEMENT_MAX_CANDIDATE_SCORE_GAP",
    0
  ),
  improvementPolicyCandidateLimit: readIntegerEnv(
    "IMPROVEMENT_POLICY_CANDIDATES",
    0
  ),
  improvementCandidateLimit: readIntegerEnv("IMPROVEMENT_CANDIDATES", 6),
  improvementRolloutMoves: readIntegerEnv("IMPROVEMENT_ROLLOUT_MOVES", 450),
  improvementRolloutCount: readIntegerEnv("IMPROVEMENT_ROLLOUT_COUNT", 1),
  improvementCommonRandom: readBooleanEnv("IMPROVEMENT_COMMON_RANDOM", true),
  improvementContinuationMode: readImprovementContinuationModeEnv(
    "IMPROVEMENT_CONTINUATION",
    "teacher"
  ),
  improvementTrainingMode: readImprovementTrainingModeEnv(
    "IMPROVEMENT_MODE",
    "softmax"
  ),
  improvementMinReturnGap: readNumberEnv("IMPROVEMENT_MIN_RETURN_GAP", 1),
  improvementMaxPairsPerExample: readIntegerEnv("IMPROVEMENT_MAX_PAIRS", 12),
  improvementPreferenceTemperature: readNumberEnv(
    "IMPROVEMENT_PREFERENCE_TEMPERATURE",
    1
  ),
  improvementPreferenceScope: readImprovementPreferenceScopeEnv(
    "IMPROVEMENT_PREFERENCE_SCOPE",
    "all"
  ),
  improvementPairwiseTargetMargin: readNumberEnv(
    "IMPROVEMENT_PAIRWISE_MARGIN",
    0
  ),
  improvementValueTargetScale: readNumberEnv("IMPROVEMENT_VALUE_SCALE", 4),
  improvementValueCenterTargets: readBooleanEnv(
    "IMPROVEMENT_VALUE_CENTER",
    true
  ),
  improvementValueTargetMode: readValueTargetModeEnv(
    "IMPROVEMENT_VALUE_TARGET_MODE",
    "absolute"
  ),
  improvementValueHuberDelta: readNumberEnv("IMPROVEMENT_VALUE_HUBER", 0),
  improvementScoreRewardWeight: readNumberEnv("IMPROVEMENT_SCORE_WEIGHT", 0),
  improvementRequireBehaviorGap: readBooleanEnv(
    "IMPROVEMENT_REQUIRE_BEHAVIOR_GAP",
    false
  ),
  improvementMinBehaviorImprovement: readNumberEnv(
    "IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT",
    2
  ),
  improvementBehaviorGapStandardErrorMultiplier: readNumberEnv(
    "IMPROVEMENT_BEHAVIOR_GAP_SE_MULTIPLIER",
    0
  ),
  improvementEpochs: readIntegerEnv("IMPROVEMENT_EPOCHS", 3),
  improvementLearningRate: readNumberEnv("IMPROVEMENT_LR", 0.01),
  improvementTargetTemperature: readNumberEnv("IMPROVEMENT_TEMPERATURE", 4),
  rlEpisodes: readIntegerEnv("RL_EPISODES", 32),
  rlLearningRate: readNumberEnv("RL_LR", 0.001),
  rlTemperature: readNumberEnv("RL_TEMPERATURE", 0.85),
  rlLocalRewardWeight: readNumberEnv("RL_LOCAL_REWARD_WEIGHT", 0.15),
  rlLocalRewardDiscount: readNumberEnv("RL_LOCAL_REWARD_DISCOUNT", 0),
  rlBaselineMode: readRlBaselineModeEnv("RL_BASELINE_MODE", "teacher"),
  rlCommonRandom: readBooleanEnv("RL_COMMON_RANDOM", true),
  rlCreditMode: readRlCreditModeEnv("RL_CREDIT_MODE", "episode"),
  rlCounterfactualRolloutCount: readIntegerEnv("RL_COUNTERFACTUAL_ROLLOUTS", 1),
  rlCounterfactualRolloutMoves: readIntegerEnv(
    "RL_COUNTERFACTUAL_ROLLOUT_MOVES",
    450
  ),
  rlCounterfactualCandidateLimit: readIntegerEnv(
    "RL_COUNTERFACTUAL_CANDIDATES",
    2
  ),
  rlCounterfactualMinReturnGap: readNumberEnv(
    "RL_COUNTERFACTUAL_MIN_RETURN_GAP",
    1
  ),
  rlCounterfactualStateSource: readRlCounterfactualStateSourceEnv(
    "RL_COUNTERFACTUAL_STATE_SOURCE",
    "sampled"
  ),
  rlCounterfactualTrainingMode: readRlCounterfactualTrainingModeEnv(
    "RL_COUNTERFACTUAL_MODE",
    "policy_gradient"
  ),
  rlCounterfactualGapStandardErrorMultiplier: readNumberEnv(
    "RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER",
    0
  ),
  rlCounterfactualPreferenceScope: readImprovementPreferenceScopeEnv(
    "RL_COUNTERFACTUAL_PREFERENCE_SCOPE",
    "all"
  ),
  rlCounterfactualPairwiseTargetMargin: readNumberEnv(
    "RL_COUNTERFACTUAL_PAIRWISE_MARGIN",
    0
  ),
  rlCounterfactualMaxScoreGap: readNumberEnv(
    "RL_COUNTERFACTUAL_MAX_SCORE_GAP",
    0
  ),
  rlCounterfactualScoreRewardWeight: readNumberEnv(
    "RL_COUNTERFACTUAL_SCORE_WEIGHT",
    0
  ),
  rlCounterfactualAnchorWeight: readNumberEnv(
    "RL_COUNTERFACTUAL_ANCHOR_WEIGHT",
    0
  ),
  rlCounterfactualAnchorMaxExamples: readIntegerEnv(
    "RL_COUNTERFACTUAL_ANCHOR_EXAMPLES",
    512
  ),
  rlCounterfactualAnchorTemperature: readNumberEnv(
    "RL_COUNTERFACTUAL_ANCHOR_TEMPERATURE",
    1
  ),
  rlCounterfactualValueTargetScale: readNumberEnv(
    "RL_COUNTERFACTUAL_VALUE_SCALE",
    4
  ),
  rlCounterfactualValueCenterTargets: readBooleanEnv(
    "RL_COUNTERFACTUAL_VALUE_CENTER",
    true
  ),
  rlCounterfactualValueTargetMode: readValueTargetModeEnv(
    "RL_COUNTERFACTUAL_VALUE_TARGET_MODE",
    "absolute"
  ),
  rlCounterfactualValueHuberDelta: readNumberEnv(
    "RL_COUNTERFACTUAL_VALUE_HUBER",
    0
  ),
  rlUpdateEpochs: readIntegerEnv("RL_UPDATE_EPOCHS", 1),
  rlUpdateScope: readRlUpdateScopeEnv("RL_UPDATE_SCOPE", "all"),
  rlNormalizeAdvantages: readBooleanEnv("RL_NORMALIZE_ADVANTAGES", true),
  rlAdvantageClip: readNumberEnv("RL_ADVANTAGE_CLIP", 3),
  maxMovesPerGame: readIntegerEnv("MAX_MOVES", 1800),
};

const result = trainNeuralActionRankingPolicy({ ...options, initialModel });
const modelOut = process.env.MODEL_OUT;

if (modelOut) {
  fs.writeFileSync(modelOut, JSON.stringify(result.model, null, 2));
}

console.log(
  JSON.stringify(
    {
      options,
      imitation: result.imitation,
      improvement: result.improvement,
      reinforcement: result.reinforcement,
      evaluation: result.evaluation,
      modelIn: modelIn ?? null,
      modelOut: modelOut ?? null,
    },
    null,
    2
  )
);

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function readIntegerListEnv(name: string, fallback: number[]): number[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(0, Math.floor(item)))
    .filter((item) => item > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }
  return fallback;
}

function readImprovementTrainingModeEnv(
  name: string,
  fallback: "softmax" | "pairwise" | "value"
): "softmax" | "pairwise" | "value" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === "pairwise" || normalized === "value") {
    return normalized;
  }
  return fallback;
}

function readImprovementStateSourceEnv(
  name: string,
  fallback: "teacher" | "policy"
): "teacher" | "policy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "policy" ? "policy" : fallback;
}

function readImprovementPreferenceScopeEnv(
  name: string,
  fallback: "all" | "behavior"
): "all" | "behavior" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "behavior" ? "behavior" : fallback;
}

function readImprovementContinuationModeEnv(
  name: string,
  fallback: "teacher" | "policy"
): "teacher" | "policy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "policy" ? "policy" : fallback;
}

function readValueTargetModeEnv(
  name: string,
  fallback: "absolute" | "residual"
): "absolute" | "residual" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "residual" ? "residual" : fallback;
}

function readRlBaselineModeEnv(
  name: string,
  fallback: "teacher" | "greedy"
): "teacher" | "greedy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "greedy" ? "greedy" : fallback;
}

function readRlCreditModeEnv(
  name: string,
  fallback: "episode" | "counterfactual"
): "episode" | "counterfactual" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "counterfactual"
    ? "counterfactual"
    : fallback;
}

function readRlCounterfactualTrainingModeEnv(
  name: string,
  fallback: "policy_gradient" | "pairwise" | "value"
): "policy_gradient" | "pairwise" | "value" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === "pairwise" || normalized === "value") {
    return normalized;
  }
  return fallback;
}

function readRlCounterfactualStateSourceEnv(
  name: string,
  fallback: "sampled" | "greedy"
): "sampled" | "greedy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "greedy" ? "greedy" : fallback;
}

function readRlUpdateScopeEnv(
  name: string,
  fallback: "all" | "exploratory"
): "all" | "exploratory" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "exploratory" ? "exploratory" : fallback;
}

function getModelHiddenLayerSizes(model: NeuralActionRankingModel): number[] {
  return model.version === 1 ? [model.hiddenSize] : model.hiddenLayerSizes.slice();
}
