import fs from "fs";
import path from "path";
import {
  compareNeuralModels,
  trainNeuralActionRankingPolicy,
} from "../shared/ActionRankingTraining";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

const modelIn = process.env.MODEL_IN;
if (!modelIn) {
  throw new Error("MODEL_IN is required.");
}

const initialModel = readModel(modelIn);
const outputDir = process.env.TUNE_OUT_DIR ?? ".\\node_modules\\pounce-tuning";
const modelOut = process.env.MODEL_OUT;
const rounds = readIntegerEnv("TUNE_ROUNDS", 3);
const seed = process.env.SEED ?? "action-ranking-tune";
const promoteMinDelta = readNumberEnv("PROMOTE_MIN_DELTA", 0);
const promoteStandardErrorMultiplier = readNumberEnv(
  "PROMOTE_SE_MULTIPLIER",
  1
);
const keepCandidates = readBooleanEnv("TUNE_KEEP_CANDIDATES", true);
const playerCount = readIntegerEnv("PLAYERS", 4);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const compareGames = readIntegerEnv("COMPARE_GAMES", 48);
const compareRuns = readIntegerEnv("COMPARE_RUNS", 2);

fs.mkdirSync(outputDir, { recursive: true });

let bestModel = initialModel;
let bestModelPath = modelIn;
const roundResults = [];

for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
  const roundNumber = roundIndex + 1;
  const candidateResult = trainNeuralActionRankingPolicy({
    playerCount,
    initialModel: bestModel,
    seed: `${seed}:round:${roundNumber}`,
    imitationDeals: readIntegerEnv("IMITATION_DEALS", 0),
    imitationEpochs: readIntegerEnv("IMITATION_EPOCHS", 1),
    imitationLearningRate: readNumberEnv("IMITATION_LR", 0.02),
    imitationEquivalentTargets: readBooleanEnv(
      "IMITATION_EQUIVALENT_TARGETS",
      false
    ),
    improvementStates: readIntegerEnv("IMPROVEMENT_STATES", 80),
    improvementStateSource: readImprovementStateSourceEnv(
      "IMPROVEMENT_STATE_SOURCE",
      "policy"
    ),
    improvementStateTemperature: readNumberEnv(
      "IMPROVEMENT_STATE_TEMPERATURE",
      0.9
    ),
    improvementStateSample: readBooleanEnv("IMPROVEMENT_STATE_SAMPLE", true),
    improvementCandidateLimit: readIntegerEnv("IMPROVEMENT_CANDIDATES", 8),
    improvementRolloutMoves: readIntegerEnv("IMPROVEMENT_ROLLOUT_MOVES", 450),
    improvementRolloutCount: readIntegerEnv("IMPROVEMENT_ROLLOUT_COUNT", 1),
    improvementCommonRandom: readBooleanEnv("IMPROVEMENT_COMMON_RANDOM", true),
    improvementTrainingMode: readImprovementTrainingModeEnv(
      "IMPROVEMENT_MODE",
      "pairwise"
    ),
    improvementMinReturnGap: readNumberEnv("IMPROVEMENT_MIN_RETURN_GAP", 2),
    improvementMaxPairsPerExample: readIntegerEnv("IMPROVEMENT_MAX_PAIRS", 8),
    improvementPreferenceTemperature: readNumberEnv(
      "IMPROVEMENT_PREFERENCE_TEMPERATURE",
      1
    ),
    improvementPreferenceScope: readImprovementPreferenceScopeEnv(
      "IMPROVEMENT_PREFERENCE_SCOPE",
      "all"
    ),
    improvementValueTargetScale: readNumberEnv("IMPROVEMENT_VALUE_SCALE", 4),
    improvementValueCenterTargets: readBooleanEnv(
      "IMPROVEMENT_VALUE_CENTER",
      true
    ),
    improvementValueHuberDelta: readNumberEnv("IMPROVEMENT_VALUE_HUBER", 0),
    improvementRequireBehaviorGap: readBooleanEnv(
      "IMPROVEMENT_REQUIRE_BEHAVIOR_GAP",
      false
    ),
    improvementMinBehaviorImprovement: readNumberEnv(
      "IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT",
      2
    ),
    improvementEpochs: readIntegerEnv("IMPROVEMENT_EPOCHS", 1),
    improvementLearningRate: readNumberEnv("IMPROVEMENT_LR", 0.0005),
    improvementTargetTemperature: readNumberEnv("IMPROVEMENT_TEMPERATURE", 4),
    rlEpisodes: readIntegerEnv("RL_EPISODES", 0),
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
    rlCounterfactualTrainingMode: readRlCounterfactualTrainingModeEnv(
      "RL_COUNTERFACTUAL_MODE",
      "policy_gradient"
    ),
    rlCounterfactualPreferenceScope: readImprovementPreferenceScopeEnv(
      "RL_COUNTERFACTUAL_PREFERENCE_SCOPE",
      "all"
    ),
    rlCounterfactualValueTargetScale: readNumberEnv(
      "RL_COUNTERFACTUAL_VALUE_SCALE",
      4
    ),
    rlCounterfactualValueCenterTargets: readBooleanEnv(
      "RL_COUNTERFACTUAL_VALUE_CENTER",
      true
    ),
    rlCounterfactualValueHuberDelta: readNumberEnv(
      "RL_COUNTERFACTUAL_VALUE_HUBER",
      0
    ),
    rlUpdateEpochs: readIntegerEnv("RL_UPDATE_EPOCHS", 1),
    rlUpdateScope: readRlUpdateScopeEnv("RL_UPDATE_SCOPE", "all"),
    rlNormalizeAdvantages: readBooleanEnv("RL_NORMALIZE_ADVANTAGES", true),
    rlAdvantageClip: readNumberEnv("RL_ADVANTAGE_CLIP", 3),
    maxMovesPerGame,
  });
  const candidateModel = candidateResult.model;
  const candidatePath = path.join(
    outputDir,
    `round-${roundNumber}-candidate.json`
  );
  if (keepCandidates) {
    writeModel(candidatePath, candidateModel);
  }

  const comparisons = Array.from({ length: Math.max(1, compareRuns) }, (_, index) =>
    compareNeuralModels(candidateModel, bestModel, {
      playerCount,
      games: compareGames,
      seed:
        compareRuns === 1
          ? `${seed}:compare:${roundNumber}`
          : `${seed}:compare:${roundNumber}:${index}`,
      maxMovesPerGame,
    })
  );
  const comparison =
    comparisons.length === 1
      ? comparisons[0]
      : summarizeComparisons(comparisons);
  const lowerBound =
    comparison.averagePointDifferentialDelta -
    promoteStandardErrorMultiplier *
      comparison.pointDifferentialDeltaStandardError;
  const promoted = lowerBound > promoteMinDelta;

  if (promoted) {
    bestModel = candidateModel;
    bestModelPath = path.join(outputDir, `round-${roundNumber}-best.json`);
    writeModel(bestModelPath, bestModel);
  }

  roundResults.push({
    round: roundNumber,
    promoted,
    lowerBound,
    candidatePath: keepCandidates ? candidatePath : null,
    bestModelPath,
    training: {
      improvement: candidateResult.improvement,
      reinforcement: candidateResult.reinforcement,
      evaluation: candidateResult.evaluation,
    },
    comparison,
    perCompareRun: comparisons.length === 1 ? undefined : comparisons,
  });
}

const finalModelPath = modelOut ?? path.join(outputDir, "best-model.json");
writeModel(finalModelPath, bestModel);

console.log(
  JSON.stringify(
    {
      modelIn,
      finalModelPath,
      rounds,
      promotionRule: {
        promoteMinDelta,
        promoteStandardErrorMultiplier,
      },
      roundResults,
    },
    null,
    2
  )
);

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}

function writeModel(filePath: string, model: NeuralActionRankingModel): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(model, null, 2));
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
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

function summarizeComparisons(
  comparisons: ReturnType<typeof compareNeuralModels>[]
) {
  const games = comparisons.reduce((sum, item) => sum + item.games, 0);
  return {
    games,
    seedCount: comparisons.length,
    averageModelAPointDifferential: weightedMean(
      comparisons,
      "averageModelAPointDifferential"
    ),
    averageModelBPointDifferential: weightedMean(
      comparisons,
      "averageModelBPointDifferential"
    ),
    averagePointDifferentialDelta: weightedMean(
      comparisons,
      "averagePointDifferentialDelta"
    ),
    pointDifferentialDeltaStandardError: standardError(
      comparisons.map((item) => item.averagePointDifferentialDelta)
    ),
    modelABetterRate: weightedMean(comparisons, "modelABetterRate"),
    modelBBetterRate: weightedMean(comparisons, "modelBBetterRate"),
    tiedPointDifferentialRate: weightedMean(
      comparisons,
      "tiedPointDifferentialRate"
    ),
    averageModelAScore: weightedMean(comparisons, "averageModelAScore"),
    averageModelBScore: weightedMean(comparisons, "averageModelBScore"),
    averageScoreDelta: weightedMean(comparisons, "averageScoreDelta"),
    averageModelADecisionCount: weightedMean(
      comparisons,
      "averageModelADecisionCount"
    ),
    averageModelBDecisionCount: weightedMean(
      comparisons,
      "averageModelBDecisionCount"
    ),
    averageModelACenterMoveRate: weightedMean(
      comparisons,
      "averageModelACenterMoveRate"
    ),
    averageModelBCenterMoveRate: weightedMean(
      comparisons,
      "averageModelBCenterMoveRate"
    ),
    averageModelASolitaireMoveRate: weightedMean(
      comparisons,
      "averageModelASolitaireMoveRate"
    ),
    averageModelBSolitaireMoveRate: weightedMean(
      comparisons,
      "averageModelBSolitaireMoveRate"
    ),
    averageModelACycleMoveRate: weightedMean(
      comparisons,
      "averageModelACycleMoveRate"
    ),
    averageModelBCycleMoveRate: weightedMean(
      comparisons,
      "averageModelBCycleMoveRate"
    ),
    averageModelAPounceRemaining: weightedMean(
      comparisons,
      "averageModelAPounceRemaining"
    ),
    averageModelBPounceRemaining: weightedMean(
      comparisons,
      "averageModelBPounceRemaining"
    ),
    modelAPounceOutRate: weightedMean(comparisons, "modelAPounceOutRate"),
    modelBPounceOutRate: weightedMean(comparisons, "modelBPounceOutRate"),
  };
}

function weightedMean<T extends { games: number }>(
  comparisons: T[],
  key: keyof T
): number {
  const games = comparisons.reduce((sum, item) => sum + item.games, 0);
  if (games === 0) {
    return 0;
  }
  return (
    comparisons.reduce((sum, item) => {
      const value = item[key];
      return sum + (typeof value === "number" ? value * item.games : 0);
    }, 0) / games
  );
}

function standardError(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) /
    (values.length - 1);
  return Math.sqrt(variance / values.length);
}
