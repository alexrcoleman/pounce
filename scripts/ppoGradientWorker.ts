import { parentPort, workerData } from "worker_threads";
import {
  collectPpoSelfPlayRolloutBatch,
  createPpoSequenceGradientUpdates,
  type PpoSelfPlayRolloutOptions,
} from "../shared/ActionRankingTraining";
import {
  NeuralActionRankingPolicy,
  type ClippedPolicyGradientSequenceUpdate,
  type NeuralActionRankingModel,
  type TrainableLayerMode,
} from "../shared/NeuralActionRankingPolicy";

type PpoGradientWorkerData = {
  model: NeuralActionRankingModel;
  opponentModel?: NeuralActionRankingModel;
  options: Omit<PpoSelfPlayRolloutOptions, "opponentPolicy">;
};

type ComputeGradientMessage = {
  type: "computeGradient";
  requestId: number;
  model: NeuralActionRankingModel;
  mean: number;
  scale: number;
  advantageClip: number;
  temperature: number;
  clipRatio: number;
  entropyBonus: number;
  trainableLayers: TrainableLayerMode;
  sequenceLength: number;
};

const data = workerData as PpoGradientWorkerData;
const rolloutStartMs = Date.now();
const rolloutPolicy = new NeuralActionRankingPolicy(data.model);
const opponentPolicy = data.opponentModel
  ? new NeuralActionRankingPolicy(data.opponentModel)
  : undefined;
const batch = collectPpoSelfPlayRolloutBatch(rolloutPolicy, {
  ...data.options,
  opponentPolicy,
});
const rolloutMs = Date.now() - rolloutStartMs;
const summary = summarizeBatch();

parentPort?.postMessage({
  type: "ready",
  timing: {
    rolloutMs,
    ...summary,
  },
  summary,
});

parentPort?.on("message", (message) => {
  const request = message as ComputeGradientMessage | { type: "close" };
  if (request.type === "close") {
    parentPort?.close();
    return;
  }
  if (request.type !== "computeGradient") {
    return;
  }

  const startMs = Date.now();
  const policy = new NeuralActionRankingPolicy(request.model);
  const sequenceLength = Math.max(1, Math.floor(request.sequenceLength));
  const result =
    sequenceLength > 1 && batch.sequenceUpdates.length > 0
      ? policy.computeClippedPolicyGradientSequenceBatchGradient(
          getNormalizedSequenceUpdates(request, sequenceLength),
          {
            temperature: request.temperature,
            clipRatio: request.clipRatio,
            entropyBonus: request.entropyBonus,
            trainableLayers: request.trainableLayers,
          }
        )
      : policy.computeClippedPolicyGradientBatchGradient(
          batch.updates.map((update) => ({
            candidates: update.candidates,
            selectedCandidateIndex: update.selectedCandidateIndex,
            oldProbability: update.oldProbability,
            memoryState: update.memoryState,
            recurrentMemoryTransition: update.recurrentMemoryTransition,
            advantage: getNormalizedAdvantage(update.rawAdvantage, request),
          })),
          {
            temperature: request.temperature,
            clipRatio: request.clipRatio,
            entropyBonus: request.entropyBonus,
            trainableLayers: request.trainableLayers,
          }
        );

  parentPort?.postMessage({
    type: "gradient",
    requestId: request.requestId,
    gradient: result.gradient,
    stats: {
      appliedUpdates: result.appliedUpdates,
      gradientBatches: result.gradientBatches,
      clippedUpdates: result.clippedUpdates,
      measuredUpdates: result.measuredUpdates,
      averageEntropy: result.averageEntropy,
      averageApproximateKl: result.averageApproximateKl,
      clippedUpdateRate: result.clippedUpdateRate,
    },
    timing: {
      gradientMs: Date.now() - startMs,
      updates: batch.updates.length,
    },
  });
});

function getNormalizedSequenceUpdates(
  request: ComputeGradientMessage,
  sequenceLength: number
): ClippedPolicyGradientSequenceUpdate[] {
  return createPpoSequenceGradientUpdates(batch.sequenceUpdates, {
    sequenceLength,
    mean: request.mean,
    scale: request.scale,
    advantageClip: request.advantageClip,
  });
}

function getNormalizedAdvantage(
  rawAdvantage: number,
  options: { mean: number; scale: number; advantageClip: number }
): number {
  const normalized = (rawAdvantage - options.mean) / Math.max(1e-6, options.scale);
  const clip = Math.max(0, options.advantageClip);
  return clip > 0 ? Math.max(-clip, Math.min(clip, normalized)) : normalized;
}

function summarizeBatch() {
  let candidateCount = 0;
  let featureValueCount = 0;
  let rawAdvantageTotal = 0;
  let rawAdvantageSquaredTotal = 0;
  let rawReturnTotal = 0;
  let rawReturnSquaredTotal = 0;

  batch.updates.forEach((update) => {
    rawAdvantageTotal += update.rawAdvantage;
    rawAdvantageSquaredTotal += update.rawAdvantage * update.rawAdvantage;
    candidateCount += update.candidates.length;
    featureValueCount += update.candidates.reduce(
      (total, candidate) => total + candidate.features.length,
      0
    );
  });
  batch.rawReturns.forEach((value) => {
    rawReturnTotal += value;
    rawReturnSquaredTotal += value * value;
  });

  return {
    updates: batch.updates.length,
    candidates: candidateCount,
    featureValues: featureValueCount,
    rawReturns: batch.rawReturns.length,
    rawAdvantageTotal,
    rawAdvantageSquaredTotal,
    rawReturnTotal,
    rawReturnSquaredTotal,
    trainingPlayerCountTotal: batch.trainingPlayerCountTotal,
    finalPointDifferentialTotal: batch.finalPointDifferentialTotal,
    sampledDecisionCountTotal: batch.sampledDecisionCountTotal,
    waitMoveRateTotal: batch.waitMoveRateTotal,
    premoveMoveRateTotal: batch.premoveMoveRateTotal,
    flipDeckMoveRateTotal: batch.flipDeckMoveRateTotal,
  };
}
