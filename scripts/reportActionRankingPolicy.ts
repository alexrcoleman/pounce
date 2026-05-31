import fs from "fs";
import { ACTION_RANKING_FEATURE_NAMES } from "../shared/ActionRankingPolicy";
import { getBasicAIStyleNames } from "../shared/ComputerV1";
import {
  compareNeuralModels,
  compareNeuralModelsSelfPlay,
  evaluateNeuralModel,
  evaluateNeuralModelAgainstBasicStyle,
  type PolicyComparisonResult,
  type PolicyEvaluationResult,
} from "../shared/ActionRankingTraining";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

type LoadedModel = {
  path: string;
  label: string | null;
  rawJson: string;
  model: NeuralActionRankingModel;
};

type EvaluationSummary = PolicyEvaluationResult & {
  seedCount: number;
  baselineAdjustedStandardError: number;
};

type ComparisonSummary = PolicyComparisonResult & {
  seedCount: number;
};

type EvaluationBlock = {
  summary: EvaluationSummary;
  perSeed?: PolicyEvaluationResult[];
};

type ComparisonBlock = {
  summary: ComparisonSummary;
  perSeed?: PolicyComparisonResult[];
};

const modelPath = readRequiredEnv("MODEL_IN");
const baselinePath = process.env.BASELINE_MODEL ?? process.env.MODEL_B;
const model = loadModel(modelPath, process.env.LABEL ?? process.env.LABEL_A ?? null);
const baselineModel = baselinePath
  ? loadModel(
      baselinePath,
      process.env.BASELINE_LABEL ?? process.env.LABEL_B ?? null
    )
  : undefined;

const playerCount = readIntegerEnv("PLAYERS", 4, 2);
const evaluationGames = readIntegerEnv("EVAL_GAMES", 48);
const styleEvaluationGames = readIntegerEnv("STYLE_GAMES", evaluationGames);
const compareGames = readIntegerEnv("COMPARE_GAMES", evaluationGames);
const selfPlayGames = readIntegerEnv("SELF_PLAY_GAMES", compareGames);
const seed = process.env.SEED ?? "action-ranking-report";
const seeds = readSeedList(seed);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const styleEvaluationEnabled =
  !readBooleanEnv("SKIP_STYLE_EVAL", false) && styleEvaluationGames > 0;
const baselineComparisonEnabled =
  baselineModel != null &&
  !readBooleanEnv("SKIP_BASELINE_COMPARE", false) &&
  compareGames > 0;
const selfPlayComparisonEnabled =
  baselineModel != null &&
  !readBooleanEnv("SKIP_SELF_PLAY_COMPARE", false) &&
  selfPlayGames > 0;
const selfPlaySwapSeats = readBooleanEnv("SELF_PLAY_SWAP_SEATS", true);
const styles = styleEvaluationEnabled ? readStyleList() : [];

const defaultEvaluation =
  evaluationGames > 0
    ? runEvaluationSeeds((evalSeed) =>
        evaluateNeuralModel(model.model, {
          playerCount,
          games: evaluationGames,
          seed: `${evalSeed}:default`,
          maxMovesPerGame,
        })
      )
    : undefined;

const byStyle = styles.map((style) => ({
  style,
  ...runEvaluationSeeds((evalSeed) =>
    evaluateNeuralModelAgainstBasicStyle(model.model, style, {
      playerCount,
      games: styleEvaluationGames,
      seed: `${evalSeed}:style:${style}`,
      maxMovesPerGame,
    })
  ),
}));

const baselineComparison =
  baselineModel && baselineComparisonEnabled
    ? runComparisonSeeds((compareSeed) =>
        compareNeuralModels(model.model, baselineModel.model, {
          playerCount,
          games: compareGames,
          seed: `${compareSeed}:paired`,
          maxMovesPerGame,
        })
      )
    : undefined;

const selfPlayComparison =
  baselineModel && selfPlayComparisonEnabled
    ? runComparisonSeeds((compareSeed) =>
        compareNeuralModelsSelfPlay(model.model, baselineModel.model, {
          playerCount,
          games: selfPlayGames,
          seed: `${compareSeed}:self-play`,
          maxMovesPerGame,
          swapSeats: selfPlaySwapSeats,
        })
      )
    : undefined;

console.log(
  JSON.stringify(
    {
      model: describeModel(model),
      baselineModel: baselineModel ? describeModel(baselineModel) : undefined,
      options: {
        playerCount,
        maxMovesPerGame,
        seeds,
        evaluationGamesPerSeed: evaluationGames,
        styleEvaluationGamesPerSeed: styleEvaluationGames,
        compareGamesPerSeed: compareGames,
        selfPlayGamesPerSeed: selfPlayGames,
        styles,
        selfPlaySwapSeats,
      },
      defaultEvaluation,
      byStyle,
      baselineComparison,
      selfPlayComparison,
      promotionSignals: buildPromotionSignals({
        model,
        defaultEvaluation,
        byStyle,
        baselineComparison,
        selfPlayComparison,
      }),
    },
    null,
    2
  )
);

function loadModel(path: string, label: string | null): LoadedModel {
  const rawJson = fs.readFileSync(path, "utf8");
  return {
    path,
    label,
    rawJson,
    model: JSON.parse(rawJson) as NeuralActionRankingModel,
  };
}

function describeModel(model: LoadedModel) {
  const hiddenLayerSizes =
    model.model.version === 1
      ? [model.model.hiddenSize]
      : model.model.hiddenLayerSizes.slice();
  const modelFeatureSet = new Set(model.model.featureNames);
  const currentFeatureSet = new Set<string>(ACTION_RANKING_FEATURE_NAMES);
  const missingCurrentFeatures = ACTION_RANKING_FEATURE_NAMES.filter(
    (featureName) => !modelFeatureSet.has(featureName)
  );
  const extraModelFeatures = model.model.featureNames.filter(
    (featureName) => !currentFeatureSet.has(featureName)
  );

  return {
    path: model.path,
    label: model.label,
    jsonBytes: Buffer.byteLength(model.rawJson, "utf8"),
    version: model.model.version,
    inputSize: model.model.inputSize,
    featureCount: model.model.featureNames.length,
    currentFeatureCount: ACTION_RANKING_FEATURE_NAMES.length,
    hiddenLayerSizes,
    parameterCount: estimateParameterCount(model.model),
    featureAlignment: {
      matchesCurrentFeatureList: arraysEqual(
        model.model.featureNames,
        ACTION_RANKING_FEATURE_NAMES
      ),
      missingCurrentFeatures,
      extraModelFeatures,
    },
  };
}

function runEvaluationSeeds(
  evaluate: (seed: string) => PolicyEvaluationResult
): EvaluationBlock {
  const perSeed = seeds.map(evaluate);
  return {
    summary: summarizeEvaluations(perSeed),
    perSeed: perSeed.length === 1 ? undefined : perSeed,
  };
}

function runComparisonSeeds(
  compare: (seed: string) => PolicyComparisonResult
): ComparisonBlock {
  const perSeed = seeds.map(compare);
  return {
    summary: summarizeComparisons(perSeed),
    perSeed: perSeed.length === 1 ? undefined : perSeed,
  };
}

function summarizeEvaluations(
  evaluations: readonly PolicyEvaluationResult[]
): EvaluationSummary {
  const games = evaluations.reduce((sum, item) => sum + item.games, 0);
  return {
    games,
    seedCount: evaluations.length,
    averageNeuralPointDifferential: weightedMean(
      evaluations,
      "averageNeuralPointDifferential",
      games
    ),
    averageTeacherBaselinePointDifferential: weightedMean(
      evaluations,
      "averageTeacherBaselinePointDifferential",
      games
    ),
    averageBaselineAdjustedPointDifferential: weightedMean(
      evaluations,
      "averageBaselineAdjustedPointDifferential",
      games
    ),
    baselineAdjustedStandardError: standardError(
      evaluations.map((item) => item.averageBaselineAdjustedPointDifferential)
    ),
    neuralWinRate: weightedMean(evaluations, "neuralWinRate", games),
    averageNeuralScore: weightedMean(evaluations, "averageNeuralScore", games),
    averageTeacherScore: weightedMean(evaluations, "averageTeacherScore", games),
    averageNeuralDecisionCount: weightedMean(
      evaluations,
      "averageNeuralDecisionCount",
      games
    ),
    averageTeacherBaselineDecisionCount: weightedMean(
      evaluations,
      "averageTeacherBaselineDecisionCount",
      games
    ),
    averageNeuralCenterMoveRate: weightedMean(
      evaluations,
      "averageNeuralCenterMoveRate",
      games
    ),
    averageTeacherBaselineCenterMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineCenterMoveRate",
      games
    ),
    averageNeuralSolitaireMoveRate: weightedMean(
      evaluations,
      "averageNeuralSolitaireMoveRate",
      games
    ),
    averageTeacherBaselineSolitaireMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineSolitaireMoveRate",
      games
    ),
    averageNeuralCycleMoveRate: weightedMean(
      evaluations,
      "averageNeuralCycleMoveRate",
      games
    ),
    averageTeacherBaselineCycleMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineCycleMoveRate",
      games
    ),
    averageNeuralPounceRemaining: weightedMean(
      evaluations,
      "averageNeuralPounceRemaining",
      games
    ),
    averageTeacherBaselinePounceRemaining: weightedMean(
      evaluations,
      "averageTeacherBaselinePounceRemaining",
      games
    ),
    neuralPounceOutRate: weightedMean(
      evaluations,
      "neuralPounceOutRate",
      games
    ),
    teacherBaselinePounceOutRate: weightedMean(
      evaluations,
      "teacherBaselinePounceOutRate",
      games
    ),
  };
}

function summarizeComparisons(
  comparisons: readonly PolicyComparisonResult[]
): ComparisonSummary {
  const games = comparisons.reduce((sum, item) => sum + item.games, 0);
  return {
    games,
    seedCount: comparisons.length,
    averageModelAPointDifferential: weightedMean(
      comparisons,
      "averageModelAPointDifferential",
      games
    ),
    averageModelBPointDifferential: weightedMean(
      comparisons,
      "averageModelBPointDifferential",
      games
    ),
    averagePointDifferentialDelta: weightedMean(
      comparisons,
      "averagePointDifferentialDelta",
      games
    ),
    pointDifferentialDeltaStandardError:
      comparisons.length === 1
        ? comparisons[0]?.pointDifferentialDeltaStandardError ?? 0
        : standardError(
            comparisons.map((item) => item.averagePointDifferentialDelta)
          ),
    modelABetterRate: weightedMean(comparisons, "modelABetterRate", games),
    modelBBetterRate: weightedMean(comparisons, "modelBBetterRate", games),
    tiedPointDifferentialRate: weightedMean(
      comparisons,
      "tiedPointDifferentialRate",
      games
    ),
    averageModelAScore: weightedMean(comparisons, "averageModelAScore", games),
    averageModelBScore: weightedMean(comparisons, "averageModelBScore", games),
    averageScoreDelta: weightedMean(comparisons, "averageScoreDelta", games),
    averageModelADecisionCount: weightedMean(
      comparisons,
      "averageModelADecisionCount",
      games
    ),
    averageModelBDecisionCount: weightedMean(
      comparisons,
      "averageModelBDecisionCount",
      games
    ),
    averageModelACenterMoveRate: weightedMean(
      comparisons,
      "averageModelACenterMoveRate",
      games
    ),
    averageModelBCenterMoveRate: weightedMean(
      comparisons,
      "averageModelBCenterMoveRate",
      games
    ),
    averageModelASolitaireMoveRate: weightedMean(
      comparisons,
      "averageModelASolitaireMoveRate",
      games
    ),
    averageModelBSolitaireMoveRate: weightedMean(
      comparisons,
      "averageModelBSolitaireMoveRate",
      games
    ),
    averageModelACycleMoveRate: weightedMean(
      comparisons,
      "averageModelACycleMoveRate",
      games
    ),
    averageModelBCycleMoveRate: weightedMean(
      comparisons,
      "averageModelBCycleMoveRate",
      games
    ),
    averageModelAPounceRemaining: weightedMean(
      comparisons,
      "averageModelAPounceRemaining",
      games
    ),
    averageModelBPounceRemaining: weightedMean(
      comparisons,
      "averageModelBPounceRemaining",
      games
    ),
    modelAPounceOutRate: weightedMean(comparisons, "modelAPounceOutRate", games),
    modelBPounceOutRate: weightedMean(comparisons, "modelBPounceOutRate", games),
  };
}

function buildPromotionSignals(options: {
  model: LoadedModel;
  defaultEvaluation?: EvaluationBlock;
  byStyle: { style: string; summary: EvaluationSummary }[];
  baselineComparison?: ComparisonBlock;
  selfPlayComparison?: ComparisonBlock;
}) {
  const styleAdjustedValues = options.byStyle.map(
    (item) => item.summary.averageBaselineAdjustedPointDifferential
  );
  const pairedDelta =
    options.baselineComparison?.summary.averagePointDifferentialDelta ?? null;
  const pairedStandardError =
    options.baselineComparison?.summary.pointDifferentialDeltaStandardError ??
    null;
  const selfPlayDelta =
    options.selfPlayComparison?.summary.averagePointDifferentialDelta ?? null;
  const selfPlayStandardError =
    options.selfPlayComparison?.summary.pointDifferentialDeltaStandardError ??
    null;

  return {
    heuristicBaselineAdjustedPointDifferential:
      options.defaultEvaluation?.summary.averageBaselineAdjustedPointDifferential ??
      null,
    heuristicBaselineAdjustedStandardError:
      options.defaultEvaluation?.summary.baselineAdjustedStandardError ?? null,
    worstStyleBaselineAdjustedPointDifferential:
      styleAdjustedValues.length > 0 ? Math.min(...styleAdjustedValues) : null,
    pairedBaselinePointDifferentialDelta: pairedDelta,
    pairedBaselineStandardError: pairedStandardError,
    pairedBaselineDeltaOverStandardError: getDeltaOverStandardError(
      pairedDelta,
      pairedStandardError
    ),
    selfPlayPointDifferentialDelta: selfPlayDelta,
    selfPlayStandardError,
    selfPlayDeltaOverStandardError: getDeltaOverStandardError(
      selfPlayDelta,
      selfPlayStandardError
    ),
    modelJsonBytes: Buffer.byteLength(options.model.rawJson, "utf8"),
    featureCount: options.model.model.featureNames.length,
    currentFeatureCount: ACTION_RANKING_FEATURE_NAMES.length,
  };
}

function getDeltaOverStandardError(
  delta: number | null,
  standardErrorValue: number | null
): number | null {
  if (delta == null || standardErrorValue == null || standardErrorValue === 0) {
    return null;
  }
  return delta / standardErrorValue;
}

function weightedMean<T extends { games: number }>(
  items: readonly T[],
  key: keyof T,
  games: number
): number {
  if (games === 0) {
    return 0;
  }
  return (
    items.reduce((sum, item) => {
      const value = item[key];
      return sum + (typeof value === "number" ? value * item.games : 0);
    }, 0) / games
  );
}

function standardError(values: readonly number[]): number {
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

function estimateParameterCount(model: NeuralActionRankingModel): number {
  if (model.version === 1) {
    return (
      countMatrixParameters(model.inputToHidden) +
      model.hiddenBias.length +
      model.hiddenToOutput.length +
      1
    );
  }

  return (
    model.layerWeights.reduce(
      (sum, layer) => sum + countMatrixParameters(layer),
      0
    ) +
    model.layerBiases.reduce((sum, biases) => sum + biases.length, 0) +
    model.outputWeights.length +
    1
  );
}

function countMatrixParameters(matrix: readonly (readonly number[])[]): number {
  return matrix.reduce((sum, row) => sum + row.length, 0);
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readIntegerEnv(name: string, fallback: number, minValue = 0): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return Math.max(minValue, fallback);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minValue, Math.floor(parsed))
    : Math.max(minValue, fallback);
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readSeedList(seed: string): string[] {
  const explicit = process.env.EVAL_SEEDS;
  if (explicit && explicit.trim() !== "") {
    const seeds = explicit
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return seeds.length > 0 ? seeds : [seed];
  }

  const runs = readIntegerEnv("EVAL_RUNS", 1, 1);
  return Array.from({ length: runs }, (_, index) =>
    runs === 1 ? seed : `${seed}:${index}`
  );
}

function readStyleList(): string[] {
  const explicit = process.env.STYLES ?? process.env.STYLE;
  if (!explicit || explicit.trim() === "") {
    return getBasicAIStyleNames();
  }

  const styleByLowerName = new Map(
    getBasicAIStyleNames().map((style) => [style.toLowerCase(), style])
  );
  return explicit
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((style) => {
      const knownStyle = styleByLowerName.get(style.toLowerCase());
      if (!knownStyle) {
        throw new Error(
          `Unknown AI style "${style}". Known styles: ${getBasicAIStyleNames().join(
            ", "
          )}`
        );
      }
      return knownStyle;
    });
}

function arraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
