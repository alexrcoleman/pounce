import createSocketIOServer from "./createSocketIOServer";
import fs from "fs";
import { setNeuralAIModel } from "../shared/NeuralActionRankingBot";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

configureNeuralAI();
createSocketIOServer();

function configureNeuralAI(): void {
  const modelPath = process.env.POUNCE_NEURAL_AI_MODEL;
  if (!modelPath) {
    return;
  }

  const model = JSON.parse(
    fs.readFileSync(modelPath, "utf8")
  ) as NeuralActionRankingModel;
  setNeuralAIModel(model);
  console.log(`Loaded neural AI model from ${modelPath}`);
}
