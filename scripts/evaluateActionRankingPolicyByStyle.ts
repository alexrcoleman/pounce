import fs from "fs";
import { getBasicAIStyleNames } from "../shared/ComputerV1";
import {
  evaluateNeuralModelAgainstBasicStyle,
  type PolicyEvaluationResult,
} from "../shared/ActionRankingTraining";
import type { ActionRankingOptions } from "../shared/ActionRankingPolicy";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

const modelPath = process.env.MODEL_IN;
if (!modelPath) {
  throw new Error("MODEL_IN is required.");
}

const model = JSON.parse(
  fs.readFileSync(modelPath, "utf8")
) as NeuralActionRankingModel;
const playerCount = readIntegerEnv("PLAYERS", 4);
const games = readIntegerEnv("EVAL_GAMES", 48);
const seed = process.env.SEED ?? "action-ranking-style-eval";
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const seeds = readSeedList(seed);
const styles = readStyleList();
const actionOptions = readActionOptionsEnv();

const byStyle = styles.map((style) => {
  const perSeed = seeds.map((styleSeed) =>
    evaluateNeuralModelAgainstBasicStyle(model, style, {
      playerCount,
      games,
      seed: `${styleSeed}:${style}`,
      maxMovesPerGame,
      actionOptions,
    })
  );
  return {
    style,
    summary: summarizeEvaluations(perSeed),
    perSeed: perSeed.length === 1 ? undefined : perSeed,
  };
});

console.log(
  JSON.stringify(
    {
      model: {
        path: modelPath,
        label: process.env.LABEL ?? null,
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
      byStyle,
    },
    null,
    2
  )
);

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

function summarizeEvaluations(
  evaluations: readonly PolicyEvaluationResult[]
): PolicyEvaluationResult {
  const games = evaluations.reduce((sum, item) => sum + item.games, 0);
  return {
    games,
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
    averageNeuralWaitMoveRate: weightedMean(
      evaluations,
      "averageNeuralWaitMoveRate",
      games
    ),
    averageTeacherBaselineWaitMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselineWaitMoveRate",
      games
    ),
    averageNeuralPremoveMoveRate: weightedMean(
      evaluations,
      "averageNeuralPremoveMoveRate",
      games
    ),
    averageTeacherBaselinePremoveMoveRate: weightedMean(
      evaluations,
      "averageTeacherBaselinePremoveMoveRate",
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

function weightedMean(
  evaluations: readonly PolicyEvaluationResult[],
  key: keyof Omit<PolicyEvaluationResult, "games">,
  games: number
): number {
  if (games === 0) {
    return 0;
  }
  return (
    evaluations.reduce((sum, item) => sum + item[key] * item.games, 0) / games
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
  };
}
