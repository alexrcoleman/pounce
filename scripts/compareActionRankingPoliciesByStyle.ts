import fs from "fs";
import { getBasicAIStyleNames } from "../shared/ComputerV1";
import {
  evaluateNeuralModelAgainstBasicStyle,
  type PolicyEvaluationResult,
} from "../shared/ActionRankingTraining";
import type { ActionRankingOptions } from "../shared/ActionRankingPolicy";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

type StyleSeedComparison = {
  style: string;
  seed: string;
  games: number;
  modelABaselineAdjustedPointDifferential: number;
  modelBBaselineAdjustedPointDifferential: number;
  baselineAdjustedPointDifferentialDelta: number;
  modelAPointDifferential: number;
  modelBPointDifferential: number;
  pointDifferentialDelta: number;
  modelAScore: number;
  modelBScore: number;
  scoreDelta: number;
  modelAWaitMoveRate: number;
  modelBWaitMoveRate: number;
  waitMoveRateDelta: number;
  modelAPremoveMoveRate: number;
  modelBPremoveMoveRate: number;
  premoveMoveRateDelta: number;
  modelAPounceOutRate: number;
  modelBPounceOutRate: number;
  pounceOutRateDelta: number;
};

const modelAPath = process.env.MODEL_A;
const modelBPath = process.env.MODEL_B;
if (!modelAPath || !modelBPath) {
  throw new Error("MODEL_A and MODEL_B are required.");
}

const modelA = JSON.parse(
  fs.readFileSync(modelAPath, "utf8")
) as NeuralActionRankingModel;
const modelB = JSON.parse(
  fs.readFileSync(modelBPath, "utf8")
) as NeuralActionRankingModel;
const playerCount = readIntegerEnv("PLAYERS", 4);
const games = readIntegerEnv("EVAL_GAMES", 48);
const seed = process.env.SEED ?? "action-ranking-compare-by-style";
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const styles = readStyleList();
const seeds = readSeedList(seed);
const actionOptions = readActionOptionsEnv();

const byStyle = styles.map((style) => {
  const comparisons = seeds.map((styleSeed) =>
    compareModelsAgainstStyle(style, styleSeed)
  );
  return {
    style,
    summary: summarizeStyleComparisons(comparisons),
    perSeed: comparisons.length === 1 ? undefined : comparisons,
  };
});
const allComparisons = byStyle.flatMap((item) => item.perSeed ?? []);
const aggregate =
  allComparisons.length > 0
    ? summarizeStyleComparisons(allComparisons)
    : summarizeStyleComparisons(
        byStyle.flatMap((item) =>
          item.summary.games > 0
            ? [
                {
                  style: item.style,
                  seed,
                  games: item.summary.games,
                  modelABaselineAdjustedPointDifferential:
                    item.summary.averageModelABaselineAdjustedPointDifferential,
                  modelBBaselineAdjustedPointDifferential:
                    item.summary.averageModelBBaselineAdjustedPointDifferential,
                  baselineAdjustedPointDifferentialDelta:
                    item.summary.averageBaselineAdjustedPointDifferentialDelta,
                  modelAPointDifferential:
                    item.summary.averageModelAPointDifferential,
                  modelBPointDifferential:
                    item.summary.averageModelBPointDifferential,
                  pointDifferentialDelta:
                    item.summary.averagePointDifferentialDelta,
                  modelAScore: item.summary.averageModelAScore,
                  modelBScore: item.summary.averageModelBScore,
                  scoreDelta: item.summary.averageScoreDelta,
                  modelAWaitMoveRate: item.summary.averageModelAWaitMoveRate,
                  modelBWaitMoveRate: item.summary.averageModelBWaitMoveRate,
                  waitMoveRateDelta: item.summary.averageWaitMoveRateDelta,
                  modelAPremoveMoveRate:
                    item.summary.averageModelAPremoveMoveRate,
                  modelBPremoveMoveRate:
                    item.summary.averageModelBPremoveMoveRate,
                  premoveMoveRateDelta:
                    item.summary.averagePremoveMoveRateDelta,
                  modelAPounceOutRate: item.summary.averageModelAPounceOutRate,
                  modelBPounceOutRate: item.summary.averageModelBPounceOutRate,
                  pounceOutRateDelta:
                    item.summary.averagePounceOutRateDelta,
                },
              ]
            : []
        )
      );

console.log(
  JSON.stringify(
    {
      modelA: {
        path: modelAPath,
        label: process.env.LABEL_A ?? null,
      },
      modelB: {
        path: modelBPath,
        label: process.env.LABEL_B ?? null,
      },
      options: {
        playerCount,
        gamesPerSeed: games,
        seedCount: seeds.length,
        maxMovesPerGame,
        styles,
        seeds,
        actionOptions,
      },
      aggregate,
      byStyle,
    },
    null,
    2
  )
);

function compareModelsAgainstStyle(
  style: string,
  styleSeed: string
): StyleSeedComparison {
  const evaluationSeed = `${styleSeed}:style:${style}`;
  const evaluationA = evaluateNeuralModelAgainstBasicStyle(modelA, style, {
    playerCount,
    games,
    seed: evaluationSeed,
    maxMovesPerGame,
    actionOptions,
  });
  const evaluationB = evaluateNeuralModelAgainstBasicStyle(modelB, style, {
    playerCount,
    games,
    seed: evaluationSeed,
    maxMovesPerGame,
    actionOptions,
  });
  return createStyleSeedComparison(style, evaluationSeed, evaluationA, evaluationB);
}

function createStyleSeedComparison(
  style: string,
  styleSeed: string,
  evaluationA: PolicyEvaluationResult,
  evaluationB: PolicyEvaluationResult
): StyleSeedComparison {
  return {
    style,
    seed: styleSeed,
    games: evaluationA.games,
    modelABaselineAdjustedPointDifferential:
      evaluationA.averageBaselineAdjustedPointDifferential,
    modelBBaselineAdjustedPointDifferential:
      evaluationB.averageBaselineAdjustedPointDifferential,
    baselineAdjustedPointDifferentialDelta:
      evaluationA.averageBaselineAdjustedPointDifferential -
      evaluationB.averageBaselineAdjustedPointDifferential,
    modelAPointDifferential: evaluationA.averageNeuralPointDifferential,
    modelBPointDifferential: evaluationB.averageNeuralPointDifferential,
    pointDifferentialDelta:
      evaluationA.averageNeuralPointDifferential -
      evaluationB.averageNeuralPointDifferential,
    modelAScore: evaluationA.averageNeuralScore,
    modelBScore: evaluationB.averageNeuralScore,
    scoreDelta: evaluationA.averageNeuralScore - evaluationB.averageNeuralScore,
    modelAWaitMoveRate: evaluationA.averageNeuralWaitMoveRate,
    modelBWaitMoveRate: evaluationB.averageNeuralWaitMoveRate,
    waitMoveRateDelta:
      evaluationA.averageNeuralWaitMoveRate -
      evaluationB.averageNeuralWaitMoveRate,
    modelAPremoveMoveRate: evaluationA.averageNeuralPremoveMoveRate,
    modelBPremoveMoveRate: evaluationB.averageNeuralPremoveMoveRate,
    premoveMoveRateDelta:
      evaluationA.averageNeuralPremoveMoveRate -
      evaluationB.averageNeuralPremoveMoveRate,
    modelAPounceOutRate: evaluationA.neuralPounceOutRate,
    modelBPounceOutRate: evaluationB.neuralPounceOutRate,
    pounceOutRateDelta:
      evaluationA.neuralPounceOutRate - evaluationB.neuralPounceOutRate,
  };
}

function summarizeStyleComparisons(comparisons: readonly StyleSeedComparison[]) {
  const games = comparisons.reduce((sum, item) => sum + item.games, 0);
  const baselineAdjustedDeltas = comparisons.map(
    (item) => item.baselineAdjustedPointDifferentialDelta
  );
  const pointDifferentialDeltas = comparisons.map(
    (item) => item.pointDifferentialDelta
  );
  const scoreDeltas = comparisons.map((item) => item.scoreDelta);
  const waitMoveRateDeltas = comparisons.map((item) => item.waitMoveRateDelta);
  const premoveMoveRateDeltas = comparisons.map(
    (item) => item.premoveMoveRateDelta
  );
  const pounceOutRateDeltas = comparisons.map((item) => item.pounceOutRateDelta);
  return {
    games,
    comparisonCount: comparisons.length,
    averageModelABaselineAdjustedPointDifferential: weightedMean(
      comparisons,
      "modelABaselineAdjustedPointDifferential"
    ),
    averageModelBBaselineAdjustedPointDifferential: weightedMean(
      comparisons,
      "modelBBaselineAdjustedPointDifferential"
    ),
    averageBaselineAdjustedPointDifferentialDelta: weightedMean(
      comparisons,
      "baselineAdjustedPointDifferentialDelta"
    ),
    baselineAdjustedPointDifferentialDeltaStandardError: standardError(
      baselineAdjustedDeltas
    ),
    baselineAdjustedPointDifferentialDeltaConfidenceInterval95:
      confidenceInterval95(baselineAdjustedDeltas),
    averageModelAPointDifferential: weightedMean(
      comparisons,
      "modelAPointDifferential"
    ),
    averageModelBPointDifferential: weightedMean(
      comparisons,
      "modelBPointDifferential"
    ),
    averagePointDifferentialDelta: weightedMean(
      comparisons,
      "pointDifferentialDelta"
    ),
    pointDifferentialDeltaStandardError: standardError(
      pointDifferentialDeltas
    ),
    pointDifferentialDeltaConfidenceInterval95:
      confidenceInterval95(pointDifferentialDeltas),
    averageModelAScore: weightedMean(comparisons, "modelAScore"),
    averageModelBScore: weightedMean(comparisons, "modelBScore"),
    averageScoreDelta: weightedMean(comparisons, "scoreDelta"),
    scoreDeltaStandardError: standardError(scoreDeltas),
    scoreDeltaConfidenceInterval95: confidenceInterval95(scoreDeltas),
    averageModelAWaitMoveRate: weightedMean(comparisons, "modelAWaitMoveRate"),
    averageModelBWaitMoveRate: weightedMean(comparisons, "modelBWaitMoveRate"),
    averageWaitMoveRateDelta: weightedMean(comparisons, "waitMoveRateDelta"),
    waitMoveRateDeltaStandardError: standardError(waitMoveRateDeltas),
    averageModelAPremoveMoveRate: weightedMean(
      comparisons,
      "modelAPremoveMoveRate"
    ),
    averageModelBPremoveMoveRate: weightedMean(
      comparisons,
      "modelBPremoveMoveRate"
    ),
    averagePremoveMoveRateDelta: weightedMean(
      comparisons,
      "premoveMoveRateDelta"
    ),
    premoveMoveRateDeltaStandardError: standardError(premoveMoveRateDeltas),
    averageModelAPounceOutRate: weightedMean(
      comparisons,
      "modelAPounceOutRate"
    ),
    averageModelBPounceOutRate: weightedMean(
      comparisons,
      "modelBPounceOutRate"
    ),
    averagePounceOutRateDelta: weightedMean(comparisons, "pounceOutRateDelta"),
    pounceOutRateDeltaStandardError: standardError(pounceOutRateDeltas),
    pounceOutRateDeltaConfidenceInterval95:
      confidenceInterval95(pounceOutRateDeltas),
    modelABetterRate:
      comparisons.length === 0
        ? 0
        : comparisons.filter(
            (item) => item.baselineAdjustedPointDifferentialDelta > 0
          ).length / comparisons.length,
    modelBBetterRate:
      comparisons.length === 0
        ? 0
        : comparisons.filter(
            (item) => item.baselineAdjustedPointDifferentialDelta < 0
          ).length / comparisons.length,
    tiedRate:
      comparisons.length === 0
        ? 0
        : comparisons.filter(
            (item) => item.baselineAdjustedPointDifferentialDelta === 0
          ).length / comparisons.length,
  };
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

function readSeedList(baseSeed: string): string[] {
  const explicit = process.env.EVAL_SEEDS;
  if (explicit && explicit.trim() !== "") {
    return explicit
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const runs = readIntegerEnv("EVAL_RUNS", 1);
  return Array.from({ length: Math.max(1, runs) }, (_, index) =>
    runs === 1 ? baseSeed : `${baseSeed}:${index}`
  );
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
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

function readActionOptionsEnv(): ActionRankingOptions {
  return {
    includeWait: readBooleanEnv("RL_INCLUDE_WAIT_ACTIONS", false),
    includePremove: readBooleanEnv("RL_INCLUDE_PREMOVE_ACTIONS", false),
    includeFlipDeck: readBooleanEnv("RL_INCLUDE_FLIP_DECK_ACTIONS", true),
  };
}

function weightedMean<T extends { games: number }>(
  comparisons: readonly T[],
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

function standardError(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function confidenceInterval95(values: readonly number[]): {
  lower95: number;
  upper95: number;
  margin95: number;
} {
  const average = mean(values);
  const margin95 = 1.96 * standardError(values);
  return {
    lower95: average - margin95,
    upper95: average + margin95,
    margin95,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
