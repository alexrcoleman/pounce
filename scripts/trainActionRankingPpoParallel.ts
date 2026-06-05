import fs from "fs";
import path from "path";
import { Worker } from "worker_threads";
import {
  applyPpoSelfPlayRolloutBatch,
  evaluateNeuralPolicy,
  mergePpoSelfPlayRolloutBatches,
  type PpoSelfPlayRolloutBatch,
  type PpoSelfPlayRolloutOptions,
type PpoSelfPlayUpdateOptions,
} from "../shared/ActionRankingTraining";
import {
  NeuralActionRankingPolicy,
  mergeNeuralPolicyGradientAccumulators,
  resizeNeuralActionRankingModel,
  type ClippedPolicyGradientBatchStats,
  type NeuralActionRankingModel,
  type NeuralPolicyGradientAccumulator,
} from "../shared/NeuralActionRankingPolicy";

type RolloutShardResult = {
  batch: PpoSelfPlayRolloutBatch;
  timing: {
    episodeStart: number;
    episodes: number;
    totalMs: number;
    rolloutMs: number;
    overheadMs: number;
    updates: number;
    candidates: number;
    featureValues: number;
    rawReturns: number;
  };
};

type RolloutShardSummary = RolloutShardResult["timing"] & {
  rawAdvantageTotal: number;
  rawAdvantageSquaredTotal: number;
  rawReturnTotal: number;
  rawReturnSquaredTotal: number;
  trainingPlayerCountTotal: number;
  finalPointDifferentialTotal: number;
  sampledDecisionCountTotal: number;
  waitMoveRateTotal: number;
  premoveMoveRateTotal: number;
  flipDeckMoveRateTotal: number;
};

type GradientShardResult = {
  gradient: NeuralPolicyGradientAccumulator;
  stats: Omit<ClippedPolicyGradientBatchStats, "clippedUpdateRate"> & {
    clippedUpdateRate: number;
  };
  timing: {
    gradientMs: number;
    updates: number;
  };
};

type GradientWorkerHandle = {
  worker: Worker;
  shard: { episodeStart: number; episodes: number };
  ready: Promise<RolloutShardSummary>;
};

const seed = process.env.SEED ?? "action-ranking-training";
const modelIn = process.env.MODEL_IN;
const initialModel = modelIn
  ? (JSON.parse(fs.readFileSync(modelIn, "utf8")) as NeuralActionRankingModel)
  : undefined;
const opponentModelPath = process.env.RL_OPPONENT_MODEL;
const explicitOpponentModel = opponentModelPath
  ? (JSON.parse(
      fs.readFileSync(opponentModelPath, "utf8")
    ) as NeuralActionRankingModel)
  : undefined;
const resizeHiddenLayerSizes = readOptionalIntegerListEnv("RESIZE_HIDDEN_LAYERS");
const hiddenLayerSizes =
  initialModel == null
    ? readIntegerListEnv("HIDDEN_LAYERS", readIntegerListEnv("HIDDEN", [48]))
    : resizeHiddenLayerSizes ?? getModelHiddenLayerSizes(initialModel);
const recurrentStateSize = readOptionalIntegerEnv("RECURRENT_STATE_SIZE");
const trainingInitialModel =
  initialModel && (resizeHiddenLayerSizes || recurrentStateSize != null)
    ? resizeNeuralActionRankingModel(
        initialModel,
        resizeHiddenLayerSizes ?? getModelHiddenLayerSizes(initialModel),
        `${seed}:resize`,
        recurrentStateSize
      )
    : initialModel;
const policy = trainingInitialModel
  ? new NeuralActionRankingPolicy(trainingInitialModel)
  : NeuralActionRankingPolicy.create({
      hiddenLayerSizes,
      recurrentStateSize,
      seed,
    });

const playerCount = readIntegerEnv("PLAYERS", 4);
const episodes = readIntegerEnv("RL_EPISODES", 32);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const opponentMode = readRlOpponentModeEnv("RL_OPPONENT_MODE", "self");
const opponentModel =
  explicitOpponentModel ??
  (opponentMode === "champion" ? trainingInitialModel : undefined);
if (opponentMode === "champion" && !opponentModel) {
  throw new Error("Champion opponent mode requires MODEL_IN or RL_OPPONENT_MODEL.");
}

const rolloutOptions: Omit<PpoSelfPlayRolloutOptions, "episodeStart" | "episodes"> =
  {
    playerCount,
    seed: `${seed}:ppo`,
    temperature: readNumberEnv("RL_TEMPERATURE", 0.85),
    localRewardWeight: readNumberEnv("RL_LOCAL_REWARD_WEIGHT", 0.15),
    opponentMode,
    gamma: readNumberEnv("RL_PPO_GAMMA", 0.995),
    waitPenalty: readNumberEnv("RL_PPO_WAIT_PENALTY", 0.05),
    premovePenalty: readNumberEnv("RL_PPO_PREMOVE_PENALTY", 0.005),
    cyclePenalty: readNumberEnv("RL_PPO_CYCLE_PENALTY", 0),
    flipDeckPenalty: readNumberEnv(
      "RL_PPO_FLIP_DECK_PENALTY",
      readNumberEnv("RL_PPO_CYCLE_PENALTY", 0)
    ),
    scoreRewardWeight: readNumberEnv("RL_PPO_SCORE_WEIGHT", 0),
    pounceRewardWeight: readNumberEnv("RL_PPO_POUNCE_WEIGHT", 0.5),
    maxConsecutiveWaitMoves: readIntegerEnv(
      "RL_PPO_MAX_CONSECUTIVE_WAITS",
      40
    ),
    advantageBaseline: readPpoAdvantageBaselineEnv(
      "RL_PPO_ADVANTAGE_BASELINE",
      "trajectory"
    ),
    maxMovesPerGame,
    actionOptions: readActionOptionsEnv(),
  };

const updateOptions: PpoSelfPlayUpdateOptions = {
  playerCount,
  episodes,
  learningRate: readNumberEnv("RL_LR", 0.001),
  temperature: rolloutOptions.temperature,
  opponentMode,
  clipRatio: readNumberEnv("RL_PPO_CLIP", 0.2),
  entropyBonus: readNumberEnv("RL_PPO_ENTROPY", 0.01),
  updateEpochs: readIntegerEnv("RL_PPO_EPOCHS", 4),
  advantageBaseline: rolloutOptions.advantageBaseline,
  trainableLayers: readTrainableLayersEnv("RL_TRAINABLE_LAYERS", "all"),
  normalizeAdvantages: readBooleanEnv("RL_NORMALIZE_ADVANTAGES", true),
  advantageClip: readNumberEnv("RL_ADVANTAGE_CLIP", 3),
  miniBatchSize: readIntegerEnv("RL_PPO_MINIBATCH_SIZE", 128),
  gradientScale: readPpoGradientScaleEnv("RL_PPO_GRADIENT_SCALE", "sum"),
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run(): Promise<void> {
  const totalStartMs = Date.now();
  const workerCount = getWorkerCount(episodes);
  const useWorkerGradients =
    workerCount > 1 && readBooleanEnv("RL_PPO_WORKER_GRADIENTS", true);
  if (useWorkerGradients) {
    await runWithGradientWorkers(workerCount, totalStartMs);
    return;
  }

  await runWithRawRolloutWorkers(workerCount, totalStartMs);
}

async function runWithRawRolloutWorkers(
  workerCount: number,
  totalStartMs: number
): Promise<void> {
  const collectionStartMs = Date.now();
  const shardResults =
    workerCount <= 1
      ? [
          await runRolloutShard({
            episodeStart: 0,
            episodes,
          }),
        ]
      : await Promise.all(
          getEpisodeShards(episodes, workerCount).map((shard) =>
            runRolloutShard(shard)
          )
        );
  const collectionMs = Date.now() - collectionStartMs;
  const mergeStartMs = Date.now();
  const rolloutBatch = mergePpoSelfPlayRolloutBatches(
    shardResults.map((result) => result.batch)
  );
  const mergeMs = Date.now() - mergeStartMs;
  const updateStartMs = Date.now();
  const reinforcement = applyPpoSelfPlayRolloutBatch(policy, rolloutBatch, {
    ...updateOptions,
    seed: `${seed}:ppo:ppo-shuffle`,
  });
  const updateMs = Date.now() - updateStartMs;
  const evaluationStartMs = Date.now();
  const evaluation = evaluateNeuralPolicy(policy, {
    playerCount,
    games: readIntegerEnv("EVAL_GAMES", 12),
    seed: `${seed}:eval`,
    maxMovesPerGame,
  });
  const evaluationMs = Date.now() - evaluationStartMs;
  const modelOut = process.env.MODEL_OUT;
  const modelWriteStartMs = Date.now();

  if (modelOut) {
    fs.writeFileSync(modelOut, JSON.stringify(policy.getModel(), null, 2));
  }
  const modelWriteMs = Date.now() - modelWriteStartMs;

  console.log(
    JSON.stringify(
      {
        options: {
          hiddenLayerSizes,
          seed,
          rlAlgorithm: "ppo",
          rlEpisodes: episodes,
          rlPpoWorkers: workerCount,
          rlPpoWorkerGradients: false,
          rollout: rolloutOptions,
          update: updateOptions,
          evaluationGames: readIntegerEnv("EVAL_GAMES", 12),
        },
        reinforcement,
        evaluation,
        timing: {
          totalMs: Date.now() - totalStartMs,
          collectionMs,
          mergeMs,
          updateMs,
          evaluationMs,
          modelWriteMs,
          workerShards: shardResults.map((result) => result.timing),
        },
        modelIn: modelIn ?? null,
        rlOpponentModel:
          opponentModelPath ?? (opponentMode === "champion" ? modelIn ?? null : null),
        modelOut: modelOut ?? null,
      },
      null,
      2
    )
  );
}

async function runWithGradientWorkers(
  workerCount: number,
  totalStartMs: number
): Promise<void> {
  const workerStartMs = Date.now();
  const handles = getEpisodeShards(episodes, workerCount).map((shard) =>
    startGradientWorker(shard)
  );
  const shardSummaries = await Promise.all(
    handles.map((handle) => handle.ready)
  );
  const collectionMs = Date.now() - workerStartMs;
  const advantageStats = getDistributedStats(
    shardSummaries.map((summary) => ({
      count: summary.updates,
      total: summary.rawAdvantageTotal,
      squaredTotal: summary.rawAdvantageSquaredTotal,
    }))
  );
  const returnStats = getDistributedStats(
    shardSummaries.map((summary) => ({
      count: summary.rawReturns,
      total: summary.rawReturnTotal,
      squaredTotal: summary.rawReturnSquaredTotal,
    }))
  );
  const scale = updateOptions.normalizeAdvantages
    ? Math.max(1e-6, advantageStats.stdDev)
    : 20;
  let appliedUpdates = 0;
  let gradientBatches = 0;
  let clippedUpdates = 0;
  let entropyTotal = 0;
  let approximateKlTotal = 0;
  let measuredUpdates = 0;
  const gradientEpochTimings: {
    epoch: number;
    reduceMs: number;
    applyMs: number;
    workerGradientMs: number[];
  }[] = [];

  for (let epoch = 0; epoch < Math.max(1, updateOptions.updateEpochs); epoch++) {
    const reduceStartMs = Date.now();
    const gradientResults = await Promise.all(
      handles.map((handle, workerIndex) =>
        requestWorkerGradient(handle.worker, {
          requestId: epoch * handles.length + workerIndex,
          model: policy.getModel(),
          mean: updateOptions.normalizeAdvantages ? advantageStats.mean : 0,
          scale,
          advantageClip: updateOptions.advantageClip,
          temperature: updateOptions.temperature,
          clipRatio: updateOptions.clipRatio,
          entropyBonus: updateOptions.entropyBonus,
          trainableLayers: updateOptions.trainableLayers,
        })
      )
    );
    const reduceMs = Date.now() - reduceStartMs;
    const applyStartMs = Date.now();
    const mergedGradient = mergeNeuralPolicyGradientAccumulators(
      gradientResults.map((result) => result.gradient)
    );
    const divisor =
      updateOptions.gradientScale === "mean"
        ? mergedGradient.updateCount
        : Math.max(1, mergedGradient.updateCount / updateOptions.miniBatchSize);
    policy.applyPolicyGradientAccumulator(
      mergedGradient,
      updateOptions.learningRate,
      divisor
    );
    const applyMs = Date.now() - applyStartMs;

    gradientResults.forEach((result) => {
      appliedUpdates += result.stats.appliedUpdates;
      gradientBatches += result.stats.gradientBatches;
      clippedUpdates += result.stats.clippedUpdates;
      entropyTotal += result.stats.averageEntropy * result.stats.measuredUpdates;
      approximateKlTotal +=
        result.stats.averageApproximateKl * result.stats.measuredUpdates;
      measuredUpdates += result.stats.measuredUpdates;
    });
    gradientEpochTimings.push({
      epoch,
      reduceMs,
      applyMs,
      workerGradientMs: gradientResults.map(
        (result) => result.timing.gradientMs
      ),
    });
  }

  handles.forEach((handle) => {
    handle.worker.postMessage({ type: "close" });
  });

  const episodeCount = Math.max(1, episodes);
  const reinforcement = {
    algorithm: "ppo" as const,
    opponentMode,
    averageTrainingPlayerCount:
      sumNumbers(shardSummaries.map((summary) => summary.trainingPlayerCountTotal)) /
      episodeCount,
    episodes,
    counterfactualScannedEpisodes: 0,
    counterfactualStoppedAfterLabelTarget: false,
    averageFinalPointDifferential:
      sumNumbers(
        shardSummaries.map((summary) => summary.finalPointDifferentialTotal)
      ) / episodeCount,
    averageTeacherBaselinePointDifferential: 0,
    averageGreedyBaselinePointDifferential: 0,
    averageBaselinePointDifferential: 0,
    averageBaselineAdjustedReturn: 0,
    averageSampleMinusGreedyReturn: 0,
    averageSampledDecisionCount:
      sumNumbers(
        shardSummaries.map((summary) => summary.sampledDecisionCountTotal)
      ) / episodeCount,
    averageCounterfactualScannedDecisionCount: 0,
    averageExploratoryDecisionCount:
      sumNumbers(
        shardSummaries.map((summary) => summary.sampledDecisionCountTotal)
      ) / episodeCount,
    averageCounterfactualReturnGap: 0,
    averageCounterfactualCandidateCount: 0,
    counterfactualTrainingUpdates: 0,
    counterfactualUpdateCount: 0,
    counterfactualMaxReturnGapSkippedCount: 0,
    counterfactualBehaviorGapSkippedCount: 0,
    counterfactualBehaviorConfidenceSkippedCount: 0,
    counterfactualBehaviorWinRateSkippedCount: 0,
    counterfactualPolicyMarginSkippedCount: 0,
    counterfactualPolicyChangeSkippedCount: 0,
    counterfactualConfidenceSkippedCount: 0,
    counterfactualTransitionBudgetSkippedCount: 0,
    counterfactualScoreGapSkippedCount: 0,
    counterfactualScoreGapBudgetSkippedCount: 0,
    counterfactualMovePairBudgetSkippedCount: 0,
    counterfactualMovePairIncludedSkippedCount: 0,
    counterfactualMovePairExcludedSkippedCount: 0,
    counterfactualBehaviorMoveTypeSkippedCount: 0,
    counterfactualMoveTypeMismatchSkippedCount: 0,
    counterfactualMoveTypeMatchSkippedCount: 0,
    counterfactualValidationSkippedCount: 0,
    counterfactualScoreReturnGapSkippedCount: 0,
    counterfactualPounceProgressGapSkippedCount: 0,
    counterfactualFeatureTieSkippedCount: 0,
    counterfactualConnectorCycleSkippedCount: 0,
    counterfactualWeakConnectorCycleSkippedCount: 0,
    counterfactualUsefulCycleSkippedCount: 0,
    counterfactualAcceptedMovePairCounts: {},
    counterfactualAcceptedMovePairSummaries: [],
    averageCounterfactualScoreGap: 0,
    averageCounterfactualBehaviorWinRate: 0,
    averageCounterfactualValidationReturnGap: 0,
    averageCounterfactualValidationWinRate: 0,
    counterfactualAveragePairWeight: 0,
    counterfactualAnchorExamples: 0,
    counterfactualAnchorUpdates: 0,
    counterfactualBehaviorCorrectionUpdates: 0,
    counterfactualConnectorAnchorExamples: 0,
    counterfactualConnectorAnchorUpdates: 0,
    counterfactualMoveTypeAnchorExamples: 0,
    counterfactualMoveTypeAnchorUpdates: 0,
    counterfactualPolicyShift: {
      examples: 0,
      winnerExamples: 0,
      behaviorExamples: 0,
      preUpdateWinnerTopCount: 0,
      postUpdateWinnerTopCount: 0,
      preUpdateBehaviorTopCount: 0,
      postUpdateBehaviorTopCount: 0,
      changedTopActionCount: 0,
      preUpdateWinnerTopRate: 0,
      postUpdateWinnerTopRate: 0,
      preUpdateBehaviorTopRate: 0,
      postUpdateBehaviorTopRate: 0,
      changedTopActionRate: 0,
      averageWinnerScoreMarginBefore: 0,
      averageWinnerScoreMarginAfter: 0,
      averageBehaviorScoreMarginBefore: 0,
      averageBehaviorScoreMarginAfter: 0,
    },
    ppoClipRatio: updateOptions.clipRatio,
    ppoEntropyBonus: updateOptions.entropyBonus,
    ppoAverageEntropy: measuredUpdates === 0 ? 0 : entropyTotal / measuredUpdates,
    ppoAverageApproximateKl:
      measuredUpdates === 0 ? 0 : approximateKlTotal / measuredUpdates,
    ppoClippedUpdateRate:
      measuredUpdates === 0 ? 0 : clippedUpdates / measuredUpdates,
    ppoAverageReturn: returnStats.mean,
    ppoReturnStdDev: returnStats.stdDev,
    ppoAverageWaitMoveRate:
      sumNumbers(shardSummaries.map((summary) => summary.waitMoveRateTotal)) /
      episodeCount,
    ppoAveragePremoveMoveRate:
      sumNumbers(shardSummaries.map((summary) => summary.premoveMoveRateTotal)) /
      episodeCount,
    ppoAverageFlipDeckMoveRate:
      sumNumbers(
        shardSummaries.map((summary) => summary.flipDeckMoveRateTotal)
      ) / episodeCount,
    ppoAdvantageBaseline: updateOptions.advantageBaseline,
    ppoMiniBatchSize: updateOptions.miniBatchSize,
    ppoGradientScale: updateOptions.gradientScale,
    ppoGradientBatches: gradientBatches,
    averagePolicyUpdates: advantageStats.count / episodeCount,
    averageGradientUpdates: appliedUpdates / episodeCount,
    averageGradientBatches: gradientBatches / episodeCount,
    averageRawAdvantage: advantageStats.mean,
    rawAdvantageStdDev: advantageStats.stdDev,
  };

  const evaluationStartMs = Date.now();
  const evaluation = evaluateNeuralPolicy(policy, {
    playerCount,
    games: readIntegerEnv("EVAL_GAMES", 12),
    seed: `${seed}:eval`,
    maxMovesPerGame,
  });
  const evaluationMs = Date.now() - evaluationStartMs;
  const modelOut = process.env.MODEL_OUT;
  const modelWriteStartMs = Date.now();
  if (modelOut) {
    fs.writeFileSync(modelOut, JSON.stringify(policy.getModel(), null, 2));
  }
  const modelWriteMs = Date.now() - modelWriteStartMs;

  console.log(
    JSON.stringify(
      {
        options: {
          hiddenLayerSizes,
          seed,
          rlAlgorithm: "ppo",
          rlEpisodes: episodes,
          rlPpoWorkers: workerCount,
          rlPpoWorkerGradients: true,
          rollout: rolloutOptions,
          update: updateOptions,
          evaluationGames: readIntegerEnv("EVAL_GAMES", 12),
        },
        reinforcement,
        evaluation,
        timing: {
          totalMs: Date.now() - totalStartMs,
          collectionMs,
          gradientReduceMs: sumNumbers(
            gradientEpochTimings.map((timing) => timing.reduceMs)
          ),
          gradientApplyMs: sumNumbers(
            gradientEpochTimings.map((timing) => timing.applyMs)
          ),
          evaluationMs,
          modelWriteMs,
          workerShards: shardSummaries,
          gradientEpochs: gradientEpochTimings,
        },
        modelIn: modelIn ?? null,
        rlOpponentModel:
          opponentModelPath ?? (opponentMode === "champion" ? modelIn ?? null : null),
        modelOut: modelOut ?? null,
      },
      null,
      2
    )
  );
}

function runRolloutShard(shard: {
  episodeStart: number;
  episodes: number;
}): Promise<RolloutShardResult> {
  if (shard.episodes <= 0) {
    return Promise.resolve({
      batch: mergePpoSelfPlayRolloutBatches([]),
      timing: {
        ...shard,
        totalMs: 0,
        rolloutMs: 0,
        overheadMs: 0,
        updates: 0,
        candidates: 0,
        featureValues: 0,
        rawReturns: 0,
      },
    });
  }

  const workerPath = path.resolve(__dirname, "ppoRolloutWorker.ts");
  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    const worker = new Worker(workerPath, {
      execArgv: ["-r", "ts-node/register/transpile-only"],
      workerData: {
        model: policy.getModel(),
        opponentModel,
        options: {
          ...rolloutOptions,
          episodeStart: shard.episodeStart,
          episodes: shard.episodes,
        },
      },
    });

    worker.once("message", (message) => {
      const totalMs = Date.now() - startMs;
      const workerMessage = message as {
        batch: PpoSelfPlayRolloutBatch;
        timing: {
          rolloutMs: number;
          updates: number;
          candidates: number;
          featureValues: number;
          rawReturns: number;
        };
      };
      resolve({
        batch: workerMessage.batch,
        timing: {
          ...shard,
          totalMs,
          rolloutMs: workerMessage.timing.rolloutMs,
          overheadMs: totalMs - workerMessage.timing.rolloutMs,
          updates: workerMessage.timing.updates,
          candidates: workerMessage.timing.candidates,
          featureValues: workerMessage.timing.featureValues,
          rawReturns: workerMessage.timing.rawReturns,
        },
      });
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`PPO rollout worker exited with code ${code}.`));
      }
    });
  });
}

function startGradientWorker(shard: {
  episodeStart: number;
  episodes: number;
}): GradientWorkerHandle {
  const workerPath = path.resolve(__dirname, "ppoGradientWorker.ts");
  const startMs = Date.now();
  const worker = new Worker(workerPath, {
    execArgv: ["-r", "ts-node/register/transpile-only"],
    workerData: {
      model: policy.getModel(),
      opponentModel,
      options: {
        ...rolloutOptions,
        episodeStart: shard.episodeStart,
        episodes: shard.episodes,
      },
    },
  });
  const ready = new Promise<RolloutShardSummary>((resolve, reject) => {
    worker.once("message", (message) => {
      const readyMessage = message as {
        type: "ready";
        timing: Omit<
          RolloutShardSummary,
          "episodeStart" | "episodes" | "totalMs" | "overheadMs"
        > & { rolloutMs: number };
        summary: Omit<
          RolloutShardSummary,
          | "episodeStart"
          | "episodes"
          | "totalMs"
          | "rolloutMs"
          | "overheadMs"
        >;
      };
      const totalMs = Date.now() - startMs;
      resolve({
        ...shard,
        ...readyMessage.summary,
        totalMs,
        rolloutMs: readyMessage.timing.rolloutMs,
        overheadMs: totalMs - readyMessage.timing.rolloutMs,
      });
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`PPO gradient worker exited with code ${code}.`));
      }
    });
  });

  return { worker, shard, ready };
}

function requestWorkerGradient(
  worker: Worker,
  request: Omit<Parameters<typeof worker.postMessage>[0], "type">
): Promise<GradientShardResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown) => {
      const response = message as
        | ({ type: "gradient"; requestId: number } & GradientShardResult)
        | { type: "ready" };
      if (response.type !== "gradient") {
        return;
      }
      worker.off("error", onError);
      resolve({
        gradient: response.gradient,
        stats: response.stats,
        timing: response.timing,
      });
    };
    const onError = (error: Error) => {
      worker.off("message", onMessage);
      reject(error);
    };
    worker.once("message", onMessage);
    worker.once("error", onError);
    worker.postMessage({
      type: "computeGradient",
      ...request,
    });
  });
}

function getEpisodeShards(totalEpisodes: number, workerCount: number) {
  const safeWorkerCount = Math.max(1, Math.min(workerCount, totalEpisodes));
  const baseEpisodes = Math.floor(totalEpisodes / safeWorkerCount);
  const extraEpisodes = totalEpisodes % safeWorkerCount;
  const shards: { episodeStart: number; episodes: number }[] = [];
  let episodeStart = 0;

  for (let workerIndex = 0; workerIndex < safeWorkerCount; workerIndex++) {
    const shardEpisodes = baseEpisodes + (workerIndex < extraEpisodes ? 1 : 0);
    shards.push({ episodeStart, episodes: shardEpisodes });
    episodeStart += shardEpisodes;
  }

  return shards;
}

function getDistributedStats(
  parts: readonly { count: number; total: number; squaredTotal: number }[]
) {
  const count = sumNumbers(parts.map((part) => part.count));
  const total = sumNumbers(parts.map((part) => part.total));
  const squaredTotal = sumNumbers(parts.map((part) => part.squaredTotal));
  const mean = count === 0 ? 0 : total / count;
  const variance =
    count <= 1
      ? 0
      : Math.max(0, (squaredTotal - count * mean * mean) / (count - 1));
  return {
    count,
    mean,
    stdDev: Math.sqrt(variance),
  };
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function getWorkerCount(totalEpisodes: number): number {
  const requestedWorkers = readIntegerEnv("RL_PPO_WORKERS", 1);
  if (totalEpisodes <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(requestedWorkers, totalEpisodes));
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalIntegerEnv(name: string): number | undefined {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}

function readIntegerListEnv(name: string, fallback: number[]): number[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function readOptionalIntegerListEnv(name: string): number[] | undefined {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return undefined;
  }
  const parsed = value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length > 0 ? parsed : undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readActionOptionsEnv() {
  return {
    includeWait: readBooleanEnv("RL_INCLUDE_WAIT_ACTIONS", true),
    includePremove: readBooleanEnv("RL_INCLUDE_PREMOVE_ACTIONS", true),
  };
}

function readRlOpponentModeEnv(
  name: string,
  fallback: "teacher" | "self" | "champion"
): "teacher" | "self" | "champion" {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "self" || value === "champion" || value === "teacher") {
    return value;
  }
  return fallback;
}

function readPpoAdvantageBaselineEnv(
  name: string,
  fallback: "batch" | "trajectory"
): "batch" | "trajectory" {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "trajectory" || value === "batch" ? value : fallback;
}

function readPpoGradientScaleEnv(
  name: string,
  fallback: "sum" | "mean"
): "sum" | "mean" {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "mean" || value === "sum" ? value : fallback;
}

function readTrainableLayersEnv(
  name: string,
  fallback: "all" | "output"
): "all" | "output" {
  return process.env[name]?.trim().toLowerCase() === "output"
    ? "output"
    : fallback;
}

function getModelHiddenLayerSizes(model: NeuralActionRankingModel): number[] {
  return model.version === 1 ? [model.hiddenSize] : model.hiddenLayerSizes.slice();
}
