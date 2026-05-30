import fs from "fs";
import { compareNeuralModelsSelfPlay } from "../shared/ActionRankingTraining";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

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
const seed = process.env.SEED ?? "action-ranking-self-play";
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const swapSeats = readBooleanEnv("SELF_PLAY_SWAP_SEATS", true);
const seeds = readSeedList(seed);
const comparisons = seeds.map((compareSeed) =>
  compareNeuralModelsSelfPlay(modelA, modelB, {
    playerCount,
    games,
    seed: compareSeed,
    maxMovesPerGame,
    swapSeats,
  })
);
const comparison =
  comparisons.length === 1 ? comparisons[0] : summarizeComparisons(comparisons);

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
      selfPlay: {
        dealsPerSeed: games,
        swapSeats,
      },
      comparison,
      perSeed: comparisons.length === 1 ? undefined : comparisons,
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
    return explicit
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const runs = readIntegerEnv("EVAL_RUNS", 1);
  return Array.from({ length: Math.max(1, runs) }, (_, index) =>
    runs === 1 ? seed : `${seed}:${index}`
  );
}

function summarizeComparisons(
  comparisons: ReturnType<typeof compareNeuralModelsSelfPlay>[]
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
