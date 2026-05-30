import fs from "fs";
import { evaluateNeuralModel } from "../shared/ActionRankingTraining";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

const modelIn = process.env.MODEL_IN;
if (!modelIn) {
  throw new Error("MODEL_IN is required.");
}

const model = JSON.parse(
  fs.readFileSync(modelIn, "utf8")
) as NeuralActionRankingModel;
const evaluation = evaluateNeuralModel(model, {
  playerCount: readIntegerEnv("PLAYERS", 4),
  games: readIntegerEnv("EVAL_GAMES", 48),
  seed: process.env.SEED ?? "action-ranking-eval",
  maxMovesPerGame: readIntegerEnv("MAX_MOVES", 1800),
});

console.log(JSON.stringify({ modelIn, evaluation }, null, 2));

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}
