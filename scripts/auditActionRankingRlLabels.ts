import fs from "fs";
import {
  ACTION_RANKING_FEATURE_NAMES,
  type ActionRankingCandidate,
} from "../shared/ActionRankingPolicy";
import type {
  ActionRankingImitationCandidate,
  ActionRankingImitationExample,
} from "../shared/ActionRankingImitation";
import { collectCounterfactualRlLabelAudit } from "../shared/ActionRankingTraining";
import {
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import type { Move } from "../shared/MoveHandler";

type MoveType = Move["type"];
type CenterSource = Extract<Move, { type: "c2c" }>["source"];

type RunningStats = {
  count: number;
  total: number;
  totalSquared: number;
};

type PairStats = {
  count: number;
  objectiveGap: RunningStats;
  pointDifferentialGap: RunningStats;
  scoreGap: RunningStats;
  pounceProgressGap: RunningStats;
  immediatePointDifferentialGap: RunningStats;
  policyScoreGapToWinner: RunningStats;
};

type LabelStateContext = {
  playerPointDifferential: number;
  pounceCount: number | null;
  currentPoints: number | null;
  pointDifferentialBin: string;
  pounceBin: string;
  currentPointsBin: string;
};

type PairStateContextStats = {
  count: number;
  playerPointDifferential: RunningStats;
  pounceCount: RunningStats;
  currentPoints: RunningStats;
  pointDifferentialBins: Map<string, number>;
  pounceBins: Map<string, number>;
  currentPointsBins: Map<string, number>;
};

const MOVE_TYPES: MoveType[] = [
  "c2c",
  "c2s",
  "s2s",
  "cycle",
  "flip_deck",
  "move_field_stack",
];

const modelPath = process.env.MODEL_IN;
if (!modelPath) {
  throw new Error("MODEL_IN is required.");
}

const policy = new NeuralActionRankingPolicy(readModel(modelPath));
const playerCount = readIntegerEnv("PLAYERS", 4);
const episodes = readIntegerEnv(
  "RL_AUDIT_EPISODES",
  readIntegerEnv("RL_EPISODES", 64)
);
const seed = process.env.SEED ?? "action-ranking-rl-label-audit";
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const maxSampleExamples = readIntegerEnv("RL_AUDIT_MAX_EXAMPLES", 8);
const maxSampleCandidates = readIntegerEnv("RL_AUDIT_SAMPLE_CANDIDATES", 6);
const focusPair = process.env.RL_AUDIT_FOCUS_PAIR ?? "cycle>c2s";

const options = {
  playerCount,
  episodes,
  seed,
  temperature: readNumberEnv("RL_TEMPERATURE", 1),
  commonRandom: readBooleanEnv("RL_COMMON_RANDOM", true),
  counterfactualRolloutCount: readIntegerEnv("RL_COUNTERFACTUAL_ROLLOUTS", 1),
  counterfactualRolloutMoves: readIntegerEnv(
    "RL_COUNTERFACTUAL_ROLLOUT_MOVES",
    450
  ),
  counterfactualCandidateLimit: readIntegerEnv(
    "RL_COUNTERFACTUAL_CANDIDATES",
    5
  ),
  counterfactualMinReturnGap: readNumberEnv(
    "RL_COUNTERFACTUAL_MIN_RETURN_GAP",
    1
  ),
  counterfactualMaxReturnGap: readNumberEnv(
    "RL_COUNTERFACTUAL_MAX_RETURN_GAP",
    0
  ),
  counterfactualRequireBehaviorGap: readBooleanEnv(
    "RL_COUNTERFACTUAL_REQUIRE_BEHAVIOR_GAP",
    false
  ),
  counterfactualMinBehaviorImprovement: readNumberEnv(
    "RL_COUNTERFACTUAL_MIN_BEHAVIOR_IMPROVEMENT",
    readNumberEnv("RL_COUNTERFACTUAL_MIN_RETURN_GAP", 1)
  ),
  counterfactualStateSource: readCounterfactualStateSourceEnv(
    "RL_COUNTERFACTUAL_STATE_SOURCE",
    "greedy"
  ),
  counterfactualTrainingMode: readCounterfactualTrainingModeEnv(
    "RL_COUNTERFACTUAL_MODE",
    "value"
  ),
  counterfactualGapStandardErrorMultiplier: readNumberEnv(
    "RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER",
    0
  ),
  counterfactualMinBehaviorWinRate: readNumberEnv(
    "RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE",
    0
  ),
  counterfactualMaxPolicyMargin: readNumberEnv(
    "RL_COUNTERFACTUAL_MAX_POLICY_MARGIN",
    0
  ),
  counterfactualRequirePolicyChange: readBooleanEnv(
    "RL_COUNTERFACTUAL_REQUIRE_POLICY_CHANGE",
    false
  ),
  counterfactualMaxScoreGap: readNumberEnv(
    "RL_COUNTERFACTUAL_MAX_SCORE_GAP",
    0
  ),
  counterfactualScoreGapBudget: readIntegerEnv(
    "RL_COUNTERFACTUAL_SCORE_GAP_BUDGET",
    0
  ),
  counterfactualMaxLabelsPerMovePair: readIntegerEnv(
    "RL_COUNTERFACTUAL_MAX_LABELS_PER_MOVE_PAIR",
    0
  ),
  counterfactualExcludedMovePairs: readStringListEnv(
    "RL_COUNTERFACTUAL_EXCLUDE_MOVE_PAIRS",
    []
  ),
  counterfactualRequireSameMoveType: readBooleanEnv(
    "RL_COUNTERFACTUAL_REQUIRE_SAME_MOVE_TYPE",
    false
  ),
  counterfactualRequireDifferentMoveType: readBooleanEnv(
    "RL_COUNTERFACTUAL_REQUIRE_DIFFERENT_MOVE_TYPE",
    false
  ),
  counterfactualStopAfterLabels: readIntegerEnv(
    "RL_COUNTERFACTUAL_STOP_AFTER_LABELS",
    0
  ),
  counterfactualScoreRewardWeight: readNumberEnv(
    "RL_COUNTERFACTUAL_SCORE_WEIGHT",
    0
  ),
  counterfactualPounceRewardWeight: readNumberEnv(
    "RL_COUNTERFACTUAL_POUNCE_WEIGHT",
    0
  ),
  counterfactualSkipCycleOverConnector: readBooleanEnv(
    "RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR",
    false
  ),
  counterfactualSkipWeakCycleOverConnector: readBooleanEnv(
    "RL_COUNTERFACTUAL_SKIP_WEAK_CYCLE_OVER_CONNECTOR",
    false
  ),
  counterfactualSkipSolitaireOverUsefulCycle: readBooleanEnv(
    "RL_COUNTERFACTUAL_SKIP_SOLITAIRE_OVER_USEFUL_CYCLE",
    false
  ),
  updateScope: readUpdateScopeEnv("RL_UPDATE_SCOPE", "exploratory"),
  maxMovesPerGame,
};

const audit = collectCounterfactualRlLabelAudit(policy, options);
const diagnostics = diagnoseCounterfactualLabels(audit.examples, policy);

console.log(
  JSON.stringify(
    {
      model: {
        path: modelPath,
      },
      options: {
        ...options,
        maxSampleExamples,
        maxSampleCandidates,
        focusPair,
      },
      collection: {
        examples: audit.examples.length,
        candidates: audit.examples.reduce(
          (sum, example) => sum + example.candidates.length,
          0
        ),
        counterfactualScannedEpisodes: audit.counterfactualScannedEpisodes,
        stoppedAfterLabelTarget: audit.stoppedAfterLabelTarget,
        sampledDecisionCount: audit.sampledDecisionCount,
        exploratoryDecisionCount: audit.exploratoryDecisionCount,
        noResultSkippedCount: audit.noResultSkippedCount,
        returnGapSkippedCount: audit.returnGapSkippedCount,
        policyGradientGreedySkippedCount:
          audit.policyGradientGreedySkippedCount,
        policyMarginSkippedCount: audit.policyMarginSkippedCount,
        policyChangeSkippedCount: audit.policyChangeSkippedCount,
        behaviorGapSkippedCount: audit.behaviorGapSkippedCount,
        behaviorConfidenceSkippedCount:
          audit.behaviorConfidenceSkippedCount,
        behaviorWinRateSkippedCount: audit.behaviorWinRateSkippedCount,
        confidenceSkippedCount: audit.confidenceSkippedCount,
        scoreGapSkippedCount: audit.scoreGapSkippedCount,
        scoreGapBudgetSkippedCount: audit.scoreGapBudgetSkippedCount,
        movePairBudgetSkippedCount: audit.movePairBudgetSkippedCount,
        movePairExcludedSkippedCount: audit.movePairExcludedSkippedCount,
        moveTypeMismatchSkippedCount: audit.moveTypeMismatchSkippedCount,
        moveTypeMatchSkippedCount: audit.moveTypeMatchSkippedCount,
        featureTieSkippedCount: audit.featureTieSkippedCount,
        connectorCycleSkippedCount: audit.connectorCycleSkippedCount,
        weakConnectorCycleSkippedCount:
          audit.weakConnectorCycleSkippedCount,
        usefulCycleSkippedCount: audit.usefulCycleSkippedCount,
        acceptedMovePairCounts: audit.acceptedMovePairCounts,
        acceptedMovePairSummaries: audit.acceptedMovePairSummaries,
        maxReturnGapSkippedCount: audit.maxReturnGapSkippedCount,
        averageCounterfactualReturnGap:
          audit.averageCounterfactualReturnGap,
        averageCounterfactualCandidateCount:
          audit.averageCounterfactualCandidateCount,
        averageCounterfactualScoreGap:
          audit.averageCounterfactualScoreGap,
        averageCounterfactualBehaviorWinRate:
          audit.averageCounterfactualBehaviorWinRate,
      },
      diagnostics,
    },
    null,
    2
  )
);

function diagnoseCounterfactualLabels(
  examples: readonly ActionRankingImitationExample[],
  auditPolicy: NeuralActionRankingPolicy
) {
  const winnerMoveCounts = createMoveTypeCounts();
  const behaviorMoveCounts = createMoveTypeCounts();
  const policyTopMoveCounts = createMoveTypeCounts();
  const winnerVsBehaviorPairs = new Map<string, PairStats>();
  const stateContextsByPair = new Map<string, PairStateContextStats>();
  const objectiveGap = createRunningStats();
  const pointDifferentialGap = createRunningStats();
  const scoreGap = createRunningStats();
  const pounceProgressGap = createRunningStats();
  const immediatePointDifferentialGap = createRunningStats();
  const policyScoreGapToWinner = createRunningStats();
  const policyTopMargin = createRunningStats();
  const sampleCandidates: {
    example: ActionRankingImitationExample;
    winner: ActionRankingImitationCandidate;
    behavior: ActionRankingImitationCandidate | null;
    pair: string;
    objectiveGap: number | null;
  }[] = [];

  let behaviorCandidateCount = 0;
  let policyTopMatchesWinnerCount = 0;
  let winnerMatchesBehaviorCount = 0;
  let winnerLowerImmediateThanBehaviorCount = 0;
  let winnerCycleOverConnectorCount = 0;

  for (const example of examples) {
    const winner = getSelectedCandidate(example);
    if (!winner) {
      continue;
    }
    const behavior = getCandidateByKey(example, example.behaviorActionKey ?? null);
    const policyRanking = auditPolicy.rankCandidates(
      example.candidates as ActionRankingCandidate[]
    );
    const policyTop = policyRanking[0]?.candidate ?? null;
    const winnerPrediction = policyRanking.find(
      (prediction) => prediction.candidate.key === winner.key
    );
    const topMargin =
      policyRanking.length > 1
        ? policyRanking[0].score - policyRanking[1].score
        : null;

    addMoveCount(winnerMoveCounts, winner.move.type);
    if (policyTop) {
      addMoveCount(policyTopMoveCounts, policyTop.move.type);
      if (policyTop.key === winner.key) {
        policyTopMatchesWinnerCount += 1;
      }
    }
    if (topMargin != null) {
      addValue(policyTopMargin, topMargin);
    }
    if (winnerPrediction && policyRanking[0]) {
      addValue(policyScoreGapToWinner, policyRanking[0].score - winnerPrediction.score);
    }

    if (behavior) {
      behaviorCandidateCount += 1;
      addMoveCount(behaviorMoveCounts, behavior.move.type);
      if (winner.key === behavior.key) {
        winnerMatchesBehaviorCount += 1;
      }
      const pair = `${winner.move.type}>${behavior.move.type}`;
      const gaps = getCandidateGaps(winner, behavior);
      const stateContext = getLabelStateContext(example, winner);
      addValueIfPresent(objectiveGap, gaps.objective);
      addValueIfPresent(pointDifferentialGap, gaps.pointDifferential);
      addValueIfPresent(scoreGap, gaps.score);
      addValueIfPresent(pounceProgressGap, gaps.pounceProgress);
      addValue(immediatePointDifferentialGap, gaps.immediatePointDifferential);
      addPairStats(
        winnerVsBehaviorPairs,
        pair,
        gaps,
        winnerPrediction && policyRanking[0]
          ? policyRanking[0].score - winnerPrediction.score
          : null
      );
      addPairStateContextStats(stateContextsByPair, pair, stateContext);
      if (gaps.immediatePointDifferential < 0) {
        winnerLowerImmediateThanBehaviorCount += 1;
      }
      if (winner.move.type === "cycle" && behavior.move.type === "c2s") {
        winnerCycleOverConnectorCount += 1;
      }
      sampleCandidates.push({
        example,
        winner,
        behavior,
        pair,
        objectiveGap: gaps.objective,
      });
    } else {
      sampleCandidates.push({
        example,
        winner,
        behavior: null,
        pair: `${winner.move.type}>unknown`,
        objectiveGap: null,
      });
    }
  }

  return {
    winnerMoveRates: normalizeMoveCounts(winnerMoveCounts, examples.length),
    behaviorMoveRates: normalizeMoveCounts(
      behaviorMoveCounts,
      behaviorCandidateCount
    ),
    policyTopMoveRates: normalizeMoveCounts(policyTopMoveCounts, examples.length),
    winnerMatchesBehaviorRate:
      behaviorCandidateCount === 0
        ? 0
        : winnerMatchesBehaviorCount / behaviorCandidateCount,
    policyTopMatchesWinnerRate:
      examples.length === 0 ? 0 : policyTopMatchesWinnerCount / examples.length,
    winnerLowerImmediateThanBehaviorRate:
      behaviorCandidateCount === 0
        ? 0
        : winnerLowerImmediateThanBehaviorCount / behaviorCandidateCount,
    winnerCycleOverConnectorRate:
      behaviorCandidateCount === 0
        ? 0
        : winnerCycleOverConnectorCount / behaviorCandidateCount,
    objectiveGap: summarizeStats(objectiveGap),
    pointDifferentialGap: summarizeStats(pointDifferentialGap),
    scoreGap: summarizeStats(scoreGap),
    pounceProgressGap: summarizeStats(pounceProgressGap),
    immediatePointDifferentialGap: summarizeStats(
      immediatePointDifferentialGap
    ),
    policyScoreGapToWinner: summarizeStats(policyScoreGapToWinner),
    policyTopMargin: summarizeStats(policyTopMargin),
    topWinnerVsBehaviorPairs: summarizePairStats(winnerVsBehaviorPairs, 12),
    stateContextsByPair: summarizePairStateContexts(stateContextsByPair, 12),
    sampleExamples: selectSampleExamples(sampleCandidates).map((item) =>
      summarizeExample(item, auditPolicy)
    ),
  };
}

function getCandidateGaps(
  winner: ActionRankingImitationCandidate,
  behavior: ActionRankingImitationCandidate
) {
  return {
    objective:
      getTrainingReturn(winner) == null || getTrainingReturn(behavior) == null
        ? null
        : getTrainingReturn(winner)! - getTrainingReturn(behavior)!,
    pointDifferential:
      winner.rolloutPointDifferentialReturn == null ||
      behavior.rolloutPointDifferentialReturn == null
        ? null
        : winner.rolloutPointDifferentialReturn -
          behavior.rolloutPointDifferentialReturn,
    score:
      winner.rolloutScoreReturn == null || behavior.rolloutScoreReturn == null
        ? null
        : winner.rolloutScoreReturn - behavior.rolloutScoreReturn,
    pounceProgress:
      winner.rolloutPounceProgressReturn == null ||
      behavior.rolloutPounceProgressReturn == null
        ? null
        : winner.rolloutPounceProgressReturn -
          behavior.rolloutPounceProgressReturn,
    immediatePointDifferential:
      winner.immediatePointDifferentialDelta -
      behavior.immediatePointDifferentialDelta,
  };
}

function summarizeExample(
  item: {
    example: ActionRankingImitationExample;
    winner: ActionRankingImitationCandidate;
    behavior: ActionRankingImitationCandidate | null;
    pair: string;
    objectiveGap: number | null;
  },
  auditPolicy: NeuralActionRankingPolicy
) {
  const policyRanking = auditPolicy.rankCandidates(
    item.example.candidates as ActionRankingCandidate[]
  );
  const policyScoreByKey = new Map(
    policyRanking.map((prediction) => [
      prediction.candidate.key,
      prediction.score,
    ])
  );
  const topScore = policyRanking[0]?.score ?? 0;
  const candidates = item.example.candidates
    .slice()
    .sort(
      (left, right) =>
        (getTrainingReturn(right) ?? Number.NEGATIVE_INFINITY) -
        (getTrainingReturn(left) ?? Number.NEGATIVE_INFINITY)
    )
    .slice(0, maxSampleCandidates)
    .map((candidate) => ({
      key: candidate.key,
      move: formatMove(candidate.move),
      policyScore: policyScoreByKey.get(candidate.key) ?? null,
      policyScoreGapFromTop:
        policyScoreByKey.get(candidate.key) == null
          ? null
          : topScore - policyScoreByKey.get(candidate.key)!,
      objectiveReturn: candidate.rolloutObjectiveReturn ?? null,
      pointDifferentialReturn:
        candidate.rolloutPointDifferentialReturn ?? null,
      scoreReturn: candidate.rolloutScoreReturn ?? null,
      pounceProgressReturn: candidate.rolloutPounceProgressReturn ?? null,
      immediatePointDifferentialDelta:
        candidate.immediatePointDifferentialDelta,
      endsRound: candidate.endsRound,
    }));

  return {
    trialIndex: item.example.trialIndex,
    stepIndex: item.example.stepIndex,
    playerIndex: item.example.playerIndex,
    pair: item.pair,
    stateContext: getLabelStateContext(item.example, item.winner),
    objectiveGap: item.objectiveGap,
    winner: summarizeCandidate(item.winner, policyScoreByKey, topScore),
    behavior: item.behavior
      ? summarizeCandidate(item.behavior, policyScoreByKey, topScore)
      : null,
    topFeatureDeltasVsBehavior: item.behavior
      ? getTopFeatureDeltas(item.winner, item.behavior, 10)
      : [],
    candidates,
  };
}

function summarizeCandidate(
  candidate: ActionRankingImitationCandidate,
  policyScoreByKey: ReadonlyMap<string, number>,
  topScore: number
) {
  const policyScore = policyScoreByKey.get(candidate.key);
  return {
    key: candidate.key,
    move: formatMove(candidate.move),
    policyScore: policyScore ?? null,
    policyScoreGapFromTop: policyScore == null ? null : topScore - policyScore,
    objectiveReturn: candidate.rolloutObjectiveReturn ?? null,
    pointDifferentialReturn: candidate.rolloutPointDifferentialReturn ?? null,
    scoreReturn: candidate.rolloutScoreReturn ?? null,
    pounceProgressReturn: candidate.rolloutPounceProgressReturn ?? null,
    immediatePointDifferentialDelta:
      candidate.immediatePointDifferentialDelta,
    endsRound: candidate.endsRound,
  };
}

function selectSampleExamples(
  items: readonly {
    example: ActionRankingImitationExample;
    winner: ActionRankingImitationCandidate;
    behavior: ActionRankingImitationCandidate | null;
    pair: string;
    objectiveGap: number | null;
  }[]
) {
  return items
    .slice()
    .sort((left, right) => {
      const leftFocus = left.pair === focusPair ? 1 : 0;
      const rightFocus = right.pair === focusPair ? 1 : 0;
      if (leftFocus !== rightFocus) {
        return rightFocus - leftFocus;
      }
      return (right.objectiveGap ?? 0) - (left.objectiveGap ?? 0);
    })
    .slice(0, maxSampleExamples);
}

function addPairStats(
  pairs: Map<string, PairStats>,
  pair: string,
  gaps: ReturnType<typeof getCandidateGaps>,
  policyScoreGap: number | null
): void {
  let stats = pairs.get(pair);
  if (!stats) {
    stats = {
      count: 0,
      objectiveGap: createRunningStats(),
      pointDifferentialGap: createRunningStats(),
      scoreGap: createRunningStats(),
      pounceProgressGap: createRunningStats(),
      immediatePointDifferentialGap: createRunningStats(),
      policyScoreGapToWinner: createRunningStats(),
    };
    pairs.set(pair, stats);
  }
  stats.count += 1;
  addValueIfPresent(stats.objectiveGap, gaps.objective);
  addValueIfPresent(stats.pointDifferentialGap, gaps.pointDifferential);
  addValueIfPresent(stats.scoreGap, gaps.score);
  addValueIfPresent(stats.pounceProgressGap, gaps.pounceProgress);
  addValue(stats.immediatePointDifferentialGap, gaps.immediatePointDifferential);
  addValueIfPresent(stats.policyScoreGapToWinner, policyScoreGap);
}

function summarizePairStats(pairs: ReadonlyMap<string, PairStats>, limit: number) {
  return Array.from(pairs.entries())
    .map(([pair, stats]) => ({
      pair,
      count: stats.count,
      objectiveGap: summarizeStats(stats.objectiveGap),
      pointDifferentialGap: summarizeStats(stats.pointDifferentialGap),
      scoreGap: summarizeStats(stats.scoreGap),
      pounceProgressGap: summarizeStats(stats.pounceProgressGap),
      immediatePointDifferentialGap: summarizeStats(
        stats.immediatePointDifferentialGap
      ),
      policyScoreGapToWinner: summarizeStats(stats.policyScoreGapToWinner),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

function getTopFeatureDeltas(
  left: ActionRankingImitationCandidate,
  right: ActionRankingImitationCandidate,
  limit: number
) {
  return left.features
    .map((value, index) => ({
      feature: ACTION_RANKING_FEATURE_NAMES[index] ?? `feature.${index}`,
      winnerValue: value,
      behaviorValue: right.features[index] ?? 0,
      delta: value - (right.features[index] ?? 0),
    }))
    .filter((item) => item.delta !== 0)
    .sort((leftItem, rightItem) => Math.abs(rightItem.delta) - Math.abs(leftItem.delta))
    .slice(0, limit);
}

function getLabelStateContext(
  example: ActionRankingImitationExample,
  candidate: ActionRankingImitationCandidate
): LabelStateContext {
  const pounceCount = getFeatureValue(candidate, "own.pounceCount", 13);
  const currentPoints = getFeatureValue(candidate, "own.currentPoints", 52);
  return {
    playerPointDifferential: example.playerPointDifferential,
    pounceCount,
    currentPoints,
    pointDifferentialBin: getPointDifferentialBin(
      example.playerPointDifferential
    ),
    pounceBin: getPounceBin(pounceCount),
    currentPointsBin: getCurrentPointsBin(currentPoints),
  };
}

function getFeatureValue(
  candidate: ActionRankingImitationCandidate,
  feature: (typeof ACTION_RANKING_FEATURE_NAMES)[number],
  scale: number
): number | null {
  const index = ACTION_RANKING_FEATURE_NAMES.indexOf(feature);
  if (index < 0) {
    return null;
  }
  const value = candidate.features[index];
  return value == null || !Number.isFinite(value) ? null : value * scale;
}

function getPointDifferentialBin(value: number): string {
  if (value <= -6) {
    return "behind_6_plus";
  }
  if (value < -1) {
    return "behind_1_to_5";
  }
  if (value <= 1) {
    return "near_even";
  }
  if (value < 6) {
    return "ahead_1_to_5";
  }
  return "ahead_6_plus";
}

function getPounceBin(value: number | null): string {
  if (value == null) {
    return "unknown";
  }
  if (value <= 3) {
    return "low_0_to_3";
  }
  if (value <= 7) {
    return "mid_4_to_7";
  }
  return "high_8_to_13";
}

function getCurrentPointsBin(value: number | null): string {
  if (value == null) {
    return "unknown";
  }
  if (value < 0) {
    return "negative";
  }
  if (value === 0) {
    return "zero";
  }
  return "positive";
}

function createPairStateContextStats(): PairStateContextStats {
  return {
    count: 0,
    playerPointDifferential: createRunningStats(),
    pounceCount: createRunningStats(),
    currentPoints: createRunningStats(),
    pointDifferentialBins: new Map<string, number>(),
    pounceBins: new Map<string, number>(),
    currentPointsBins: new Map<string, number>(),
  };
}

function addPairStateContextStats(
  contextsByPair: Map<string, PairStateContextStats>,
  pair: string,
  context: LabelStateContext
): void {
  let stats = contextsByPair.get(pair);
  if (!stats) {
    stats = createPairStateContextStats();
    contextsByPair.set(pair, stats);
  }
  stats.count += 1;
  addValue(stats.playerPointDifferential, context.playerPointDifferential);
  addValueIfPresent(stats.pounceCount, context.pounceCount);
  addValueIfPresent(stats.currentPoints, context.currentPoints);
  addBin(stats.pointDifferentialBins, context.pointDifferentialBin);
  addBin(stats.pounceBins, context.pounceBin);
  addBin(stats.currentPointsBins, context.currentPointsBin);
}

function summarizePairStateContexts(
  contextsByPair: ReadonlyMap<string, PairStateContextStats>,
  limit: number
) {
  return Array.from(contextsByPair.entries())
    .map(([pair, stats]) => ({
      pair,
      count: stats.count,
      playerPointDifferential: summarizeStats(stats.playerPointDifferential),
      pounceCount: summarizeStats(stats.pounceCount),
      currentPoints: summarizeStats(stats.currentPoints),
      pointDifferentialBins: summarizeBins(stats.pointDifferentialBins),
      pounceBins: summarizeBins(stats.pounceBins),
      currentPointsBins: summarizeBins(stats.currentPointsBins),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

function addBin(bins: Map<string, number>, bin: string): void {
  bins.set(bin, (bins.get(bin) ?? 0) + 1);
}

function summarizeBins(bins: ReadonlyMap<string, number>) {
  return Array.from(bins.entries())
    .map(([bin, count]) => ({ bin, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.bin.localeCompare(right.bin)
    );
}

function getSelectedCandidate(
  example: ActionRankingImitationExample
): ActionRankingImitationCandidate | null {
  const index = example.selectedCandidateIndex;
  if (index == null || index < 0 || index >= example.candidates.length) {
    return null;
  }
  return example.candidates[index] ?? null;
}

function getCandidateByKey(
  example: ActionRankingImitationExample,
  key: string | null
): ActionRankingImitationCandidate | null {
  if (!key) {
    return null;
  }
  return example.candidates.find((candidate) => candidate.key === key) ?? null;
}

function getTrainingReturn(
  candidate: ActionRankingImitationCandidate
): number | null {
  return (
    candidate.rolloutObjectiveReturn ??
    candidate.rolloutPointDifferentialReturn ??
    null
  );
}

function createMoveTypeCounts(): Record<MoveType, number> {
  return MOVE_TYPES.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {} as Record<MoveType, number>);
}

function addMoveCount(counts: Record<MoveType, number>, moveType: MoveType): void {
  counts[moveType] += 1;
}

function normalizeMoveCounts(
  counts: Record<MoveType, number>,
  total: number
): Record<MoveType, number> {
  return MOVE_TYPES.reduce((rates, type) => {
    rates[type] = total === 0 ? 0 : counts[type] / total;
    return rates;
  }, {} as Record<MoveType, number>);
}

function createRunningStats(): RunningStats {
  return { count: 0, total: 0, totalSquared: 0 };
}

function addValue(stats: RunningStats, value: number): void {
  stats.count += 1;
  stats.total += value;
  stats.totalSquared += value * value;
}

function addValueIfPresent(stats: RunningStats, value: number | null): void {
  if (value != null && Number.isFinite(value)) {
    addValue(stats, value);
  }
}

function summarizeStats(stats: RunningStats) {
  const mean = stats.count === 0 ? 0 : stats.total / stats.count;
  const variance =
    stats.count <= 1
      ? 0
      : (stats.totalSquared - stats.count * mean * mean) / (stats.count - 1);
  return {
    count: stats.count,
    mean,
    stdDev: Math.sqrt(Math.max(0, variance)),
  };
}

function formatMove(move: Move): string {
  if (move.type === "c2c") {
    return `c2c ${formatCenterSource(move.source)}->center:${move.dest}`;
  }
  if (move.type === "c2s") {
    return `c2s ${move.source}->stack:${move.dest}`;
  }
  if (move.type === "s2s") {
    return `s2s stack:${move.source}->stack:${move.dest} x${move.count}`;
  }
  if (move.type === "move_field_stack") {
    return `move_field_stack ${move.index}`;
  }
  return move.type;
}

function formatCenterSource(source: CenterSource): string {
  if (source.type === "solitaire") {
    return `solitaire:${source.index}`;
  }
  return source.type;
}

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function readStringListEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function readCounterfactualTrainingModeEnv(
  name: string,
  fallback: "policy_gradient" | "pairwise" | "value"
): "policy_gradient" | "pairwise" | "value" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === "policy_gradient" || normalized === "pairwise" || normalized === "value") {
    return normalized;
  }
  return fallback;
}

function readCounterfactualStateSourceEnv(
  name: string,
  fallback: "sampled" | "greedy"
): "sampled" | "greedy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "sampled" ? "sampled" : fallback;
}

function readUpdateScopeEnv(
  name: string,
  fallback: "all" | "exploratory"
): "all" | "exploratory" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "all" ? "all" : fallback;
}
