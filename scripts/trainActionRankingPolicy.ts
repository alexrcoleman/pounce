import fs from "fs";
import { trainNeuralActionRankingPolicy } from "../shared/ActionRankingTraining";

const options = {
  playerCount: readIntegerEnv("PLAYERS", 4),
  hiddenSize: readIntegerEnv("HIDDEN", 48),
  seed: process.env.SEED ?? "action-ranking-training",
  imitationDeals: readIntegerEnv("IMITATION_DEALS", 24),
  imitationEpochs: readIntegerEnv("IMITATION_EPOCHS", 4),
  imitationLearningRate: readNumberEnv("IMITATION_LR", 0.02),
  rlEpisodes: readIntegerEnv("RL_EPISODES", 32),
  rlLearningRate: readNumberEnv("RL_LR", 0.001),
  rlTemperature: readNumberEnv("RL_TEMPERATURE", 0.85),
  rlLocalRewardWeight: readNumberEnv("RL_LOCAL_REWARD_WEIGHT", 0.15),
  maxMovesPerGame: readIntegerEnv("MAX_MOVES", 1800),
};

const result = trainNeuralActionRankingPolicy(options);
const modelOut = process.env.MODEL_OUT;

if (modelOut) {
  fs.writeFileSync(modelOut, JSON.stringify(result.model, null, 2));
}

console.log(
  JSON.stringify(
    {
      options,
      imitation: result.imitation,
      reinforcement: result.reinforcement,
      evaluation: result.evaluation,
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

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
