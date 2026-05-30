import fs from "fs";
import path from "path";
import {
  compareNeuralModels,
  trainNeuralActionRankingPolicy,
  type NeuralTrainingOptions,
} from "../shared/ActionRankingTraining";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

type ModelComparisonResult = ReturnType<typeof compareNeuralModels>;

type RlTuneRecipe = {
  name: string;
  options: NeuralTrainingOptions;
};

const modelIn = process.env.MODEL_IN;
if (!modelIn) {
  throw new Error("MODEL_IN is required.");
}

const initialModel = readModel(modelIn);
const outputDir = process.env.RL_TUNE_OUT_DIR ?? ".\\node_modules\\pounce-rl-tuning";
const modelOut = process.env.MODEL_OUT;
const rounds = readIntegerEnv("RL_TUNE_ROUNDS", 1);
const seed = process.env.SEED ?? "action-ranking-rl-tune";
const promoteMinDelta = readNumberEnv("PROMOTE_MIN_DELTA", 0);
const promoteStandardErrorMultiplier = readNumberEnv(
  "PROMOTE_SE_MULTIPLIER",
  1
);
const keepCandidates = readBooleanEnv("RL_TUNE_KEEP_CANDIDATES", true);
const playerCount = readIntegerEnv("PLAYERS", 4);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const compareGames = readIntegerEnv("COMPARE_GAMES", 48);
const compareRuns = readIntegerEnv("COMPARE_RUNS", 2);
const confirmGames = readIntegerEnv("CONFIRM_GAMES", 0);
const confirmRuns = readIntegerEnv(
  "CONFIRM_RUNS",
  Math.max(1, compareRuns * 2)
);
const confirmMinDelta = readNumberEnv("CONFIRM_MIN_DELTA", promoteMinDelta);
const confirmStandardErrorMultiplier = readNumberEnv(
  "CONFIRM_SE_MULTIPLIER",
  promoteStandardErrorMultiplier
);
const confirmTriggerMinDelta = readNumberEnv(
  "CONFIRM_TRIGGER_MIN_DELTA",
  promoteMinDelta
);
const recipes = readRecipes();

fs.mkdirSync(outputDir, { recursive: true });

let bestModel = initialModel;
let bestModelPath = modelIn;
const roundResults = [];

for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
  const roundNumber = roundIndex + 1;
  const recipeResults = [];

  for (let recipeIndex = 0; recipeIndex < recipes.length; recipeIndex++) {
    const recipe = recipes[recipeIndex];
    const candidateResult = trainNeuralActionRankingPolicy({
      playerCount,
      maxMovesPerGame,
      ...recipe.options,
      initialModel: bestModel,
      seed: `${seed}:round:${roundNumber}:recipe:${recipe.name}`,
    });
    const candidateModel = candidateResult.model;
    const candidatePath = path.join(
      outputDir,
      `round-${roundNumber}-${sanitizeFilePart(recipe.name)}-candidate.json`
    );
    if (keepCandidates) {
      writeModel(candidatePath, candidateModel);
    }

    const comparisonBatch = compareModelBatch(candidateModel, bestModel, {
      playerCount,
      games: compareGames,
      runs: compareRuns,
      seed: `${seed}:compare:${roundNumber}:${recipe.name}`,
      maxMovesPerGame,
    });
    const comparison = comparisonBatch.comparison;
    const lowerBound = getPromotionLowerBound(
      comparison,
      promoteStandardErrorMultiplier
    );
    const searchPassed = lowerBound > promoteMinDelta;
    const shouldConfirm =
      confirmGames > 0 &&
      (searchPassed || lowerBound >= confirmTriggerMinDelta);
    const confirmationBatch = shouldConfirm
      ? compareModelBatch(candidateModel, bestModel, {
          playerCount,
          games: confirmGames,
          runs: confirmRuns,
          seed: `${seed}:confirm:${roundNumber}:${recipe.name}`,
          maxMovesPerGame,
        })
      : null;
    const confirmationLowerBound = confirmationBatch
      ? getPromotionLowerBound(
          confirmationBatch.comparison,
          confirmStandardErrorMultiplier
        )
      : null;
    const promoted = confirmationBatch
      ? confirmationLowerBound! > confirmMinDelta
      : searchPassed;

    if (promoted) {
      bestModel = candidateModel;
      bestModelPath = path.join(
        outputDir,
        `round-${roundNumber}-${sanitizeFilePart(recipe.name)}-best.json`
      );
      writeModel(bestModelPath, bestModel);
    }

    recipeResults.push({
      recipe: recipe.name,
      recipeIndex,
      promoted,
      searchPassed,
      lowerBound,
      candidatePath: keepCandidates ? candidatePath : null,
      bestModelPath,
      training: {
        improvement: candidateResult.improvement,
        reinforcement: candidateResult.reinforcement,
        evaluation: candidateResult.evaluation,
      },
      comparison,
      perCompareRun: comparisonBatch.perCompareRun,
      confirmation: confirmationBatch
        ? {
            lowerBound: confirmationLowerBound,
            comparison: confirmationBatch.comparison,
            perCompareRun: confirmationBatch.perCompareRun,
          }
        : null,
    });
  }

  roundResults.push({
    round: roundNumber,
    bestModelPath,
    recipeResults,
  });
}

const finalModelPath = modelOut ?? path.join(outputDir, "best-rl-model.json");
writeModel(finalModelPath, bestModel);

console.log(
  JSON.stringify(
    {
      modelIn,
      finalModelPath,
      rounds,
      recipes: recipes.map(({ name, options }) => ({ name, options })),
      promotionRule: {
        promoteMinDelta,
        promoteStandardErrorMultiplier,
      },
      confirmationRule: {
        confirmGames,
        confirmRuns,
        confirmMinDelta,
        confirmStandardErrorMultiplier,
        confirmTriggerMinDelta,
      },
      roundResults,
    },
    null,
    2
  )
);

function readRecipes(): RlTuneRecipe[] {
  const explicit = process.env.RL_TUNE_RECIPES;
  if (explicit && explicit.trim() !== "") {
    const parsed = JSON.parse(explicit) as RlTuneRecipe[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("RL_TUNE_RECIPES must be a non-empty JSON array.");
    }
    return parsed.map((recipe, index) => normalizeRecipe(recipe, index));
  }

  return [
    createRecipe("exploratory-pairwise-behavior", {
      rlCounterfactualTrainingMode: "pairwise",
      rlCounterfactualPreferenceScope: "behavior",
      rlCounterfactualMinReturnGap: 2,
      rlLearningRate: 0.00005,
    }),
    createRecipe("exploratory-pairwise-all", {
      rlCounterfactualTrainingMode: "pairwise",
      rlCounterfactualPreferenceScope: "all",
      rlCounterfactualMinReturnGap: 2,
      rlLearningRate: 0.00005,
    }),
    createRecipe("exploratory-value-broad", {
      rlCounterfactualTrainingMode: "value",
      rlCounterfactualMinReturnGap: 0,
      rlCounterfactualValueTargetScale: 8,
      rlCounterfactualValueCenterTargets: true,
      rlCounterfactualValueHuberDelta: 2,
      rlLearningRate: 0.00005,
    }),
  ];
}

function createRecipe(
  name: string,
  options: NeuralTrainingOptions
): RlTuneRecipe {
  return {
    name,
    options: {
      ...getDefaultRecipeOptions(),
      ...options,
    },
  };
}

function normalizeRecipe(recipe: RlTuneRecipe, index: number): RlTuneRecipe {
  if (!recipe || typeof recipe.name !== "string" || !recipe.options) {
    throw new Error(`RL_TUNE_RECIPES[${index}] is invalid.`);
  }
  return {
    name: recipe.name,
    options: {
      ...getDefaultRecipeOptions(),
      ...recipe.options,
    },
  };
}

function getDefaultRecipeOptions(): NeuralTrainingOptions {
  return {
    imitationDeals: 0,
    improvementStates: 0,
    rlEpisodes: readIntegerEnv("RL_EPISODES", 64),
    rlTemperature: readNumberEnv("RL_TEMPERATURE", 1.05),
    rlLocalRewardWeight: readNumberEnv("RL_LOCAL_REWARD_WEIGHT", 0),
    rlLocalRewardDiscount: readNumberEnv("RL_LOCAL_REWARD_DISCOUNT", 0),
    rlBaselineMode: "greedy",
    rlCommonRandom: true,
    rlCreditMode: "counterfactual",
    rlCounterfactualRolloutCount: readIntegerEnv("RL_COUNTERFACTUAL_ROLLOUTS", 1),
    rlCounterfactualRolloutMoves: readIntegerEnv(
      "RL_COUNTERFACTUAL_ROLLOUT_MOVES",
      450
    ),
    rlCounterfactualCandidateLimit: readIntegerEnv(
      "RL_COUNTERFACTUAL_CANDIDATES",
      5
    ),
    rlCounterfactualPairwiseTargetMargin: readNumberEnv(
      "RL_COUNTERFACTUAL_PAIRWISE_MARGIN",
      0
    ),
    rlUpdateEpochs: readIntegerEnv("RL_UPDATE_EPOCHS", 1),
    rlUpdateScope: "exploratory",
    rlNormalizeAdvantages: true,
    rlAdvantageClip: readNumberEnv("RL_ADVANTAGE_CLIP", 3),
  };
}

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

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function compareModelBatch(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  options: {
    playerCount: number;
    games: number;
    runs: number;
    seed: string;
    maxMovesPerGame: number;
  }
) {
  const runCount = Math.max(1, options.runs);
  const comparisons = Array.from({ length: runCount }, (_, index) =>
    compareNeuralModels(modelA, modelB, {
      playerCount: options.playerCount,
      games: options.games,
      seed: runCount === 1 ? options.seed : `${options.seed}:${index}`,
      maxMovesPerGame: options.maxMovesPerGame,
    })
  );
  return {
    comparison:
      comparisons.length === 1
        ? comparisons[0]
        : summarizeComparisons(comparisons),
    perCompareRun: comparisons.length === 1 ? undefined : comparisons,
  };
}

function getPromotionLowerBound(
  comparison: ModelComparisonResult,
  standardErrorMultiplier: number
): number {
  return (
    comparison.averagePointDifferentialDelta -
    standardErrorMultiplier * comparison.pointDifferentialDeltaStandardError
  );
}

function summarizeComparisons(comparisons: ModelComparisonResult[]) {
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
