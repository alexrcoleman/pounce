import { parentPort, workerData } from "worker_threads";
import {
  collectPpoSelfPlayRolloutBatch,
  type PpoSelfPlayRolloutOptions,
} from "../shared/ActionRankingTraining";
import {
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";

type PpoRolloutWorkerData = {
  model: NeuralActionRankingModel;
  opponentModel?: NeuralActionRankingModel;
  options: Omit<PpoSelfPlayRolloutOptions, "opponentPolicy">;
};

const data = workerData as PpoRolloutWorkerData;
const policy = new NeuralActionRankingPolicy(data.model);
const opponentPolicy = data.opponentModel
  ? new NeuralActionRankingPolicy(data.opponentModel)
  : undefined;

const startMs = Date.now();
const batch = collectPpoSelfPlayRolloutBatch(policy, {
  ...data.options,
  opponentPolicy,
});
const rolloutMs = Date.now() - startMs;
const candidateCount = batch.updates.reduce(
  (total, update) => total + update.candidates.length,
  0
);
const featureValueCount = batch.updates.reduce(
  (total, update) =>
    total +
    update.candidates.reduce(
      (candidateTotal, candidate) => candidateTotal + candidate.features.length,
      0
    ),
  0
);

parentPort?.postMessage({
  batch,
  timing: {
    rolloutMs,
    updates: batch.updates.length,
    candidates: candidateCount,
    featureValues: featureValueCount,
    rawReturns: batch.rawReturns.length,
  },
});
