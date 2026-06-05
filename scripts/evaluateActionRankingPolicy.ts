import fs from "fs";
import { evaluateNeuralModel } from "../shared/ActionRankingTraining";
import type { ActionRankingOptions } from "../shared/ActionRankingPolicy";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

const modelIn = process.env.MODEL_IN;
if (!modelIn) {
  throw new Error("MODEL_IN is required.");
}

const model = JSON.parse(
  fs.readFileSync(modelIn, "utf8")
) as NeuralActionRankingModel;
const playerCount = readIntegerEnv("PLAYERS", 4);
const games = readIntegerEnv("EVAL_GAMES", 48);
const seed = process.env.SEED ?? "action-ranking-eval";
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const actionOptions = readActionOptionsEnv();
const seeds = readSeedList(seed);
const evaluations = seeds.map((evalSeed) =>
  evaluateNeuralModel(model, {
    playerCount,
    games,
    seed: evalSeed,
    maxMovesPerGame,
    actionOptions,
  })
);
const evaluation =
  evaluations.length === 1 ? evaluations[0] : summarizeEvaluations(evaluations);

console.log(
  JSON.stringify(
    {
      modelIn,
      actionOptions,
      evaluation,
      perSeed: evaluations.length === 1 ? undefined : evaluations,
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

function summarizeEvaluations(evaluations: ReturnType<typeof evaluateNeuralModel>[]) {
  const games = evaluations.reduce((sum, item) => sum + item.games, 0);
  return {
    games,
    seedCount: evaluations.length,
    averageNeuralPointDifferential: weightedMean(
      evaluations,
      "averageNeuralPointDifferential"
    ),
    averageTeacherBaselinePointDifferential: weightedMean(
      evaluations,
      "averageTeacherBaselinePointDifferential"
    ),
    averageBaselineAdjustedPointDifferential: weightedMean(
      evaluations,
      "averageBaselineAdjustedPointDifferential"
    ),
    baselineAdjustedStandardError: standardError(
      evaluations.map((item) => item.averageBaselineAdjustedPointDifferential)
    ),
    neuralWinRate: weightedMean(evaluations, "neuralWinRate"),
    averageNeuralScore: weightedMean(evaluations, "averageNeuralScore"),
    averageTeacherScore: weightedMean(evaluations, "averageTeacherScore"),
    averageNeuralDecisionCount: weightedMean(
      evaluations,
      "averageNeuralDecisionCount"
    ),
    averageTeacherBaselineDecisionCount: weightedMean(
      evaluations,
      "averageTeacherBaselineDecisionCount"
    ),
    averageNeuralCenterMoveRate: weightedMean(
      evaluations,
      "averageNeuralCenterMoveRate"
    ),
    averageTeacherBaselineCenterMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineCenterMoveRate"
    ),
    averageNeuralSolitaireMoveRate: weightedMean(
      evaluations,
      "averageNeuralSolitaireMoveRate"
    ),
    averageTeacherBaselineSolitaireMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineSolitaireMoveRate"
    ),
    averageNeuralCycleMoveRate: weightedMean(
      evaluations,
      "averageNeuralCycleMoveRate"
    ),
    averageTeacherBaselineCycleMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineCycleMoveRate"
    ),
    averageNeuralFlipDeckMoveRate: weightedMean(
      evaluations,
      "averageNeuralFlipDeckMoveRate"
    ),
    averageTeacherBaselineFlipDeckMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineFlipDeckMoveRate"
    ),
    averageNeuralWaitMoveRate: weightedMean(
      evaluations,
      "averageNeuralWaitMoveRate"
    ),
    averageTeacherBaselineWaitMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineWaitMoveRate"
    ),
    averageNeuralPremoveMoveRate: weightedMean(
      evaluations,
      "averageNeuralPremoveMoveRate"
    ),
    averageTeacherBaselinePremoveMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselinePremoveMoveRate"
    ),
    averageNeuralPounceRemaining: weightedMean(
      evaluations,
      "averageNeuralPounceRemaining"
    ),
    averageTeacherBaselinePounceRemaining: weightedMean(
      evaluations,
      "averageTeacherBaselinePounceRemaining"
    ),
    neuralPounceOutRate: weightedMean(evaluations, "neuralPounceOutRate"),
    teacherBaselinePounceOutRate: weightedMean(
      evaluations,
      "teacherBaselinePounceOutRate"
    ),
  };
}

function weightedMean<T extends { games: number }>(
  evaluations: T[],
  key: keyof T
): number {
  const games = evaluations.reduce((sum, item) => sum + item.games, 0);
  if (games === 0) {
    return 0;
  }
  return (
    evaluations.reduce((sum, item) => {
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
