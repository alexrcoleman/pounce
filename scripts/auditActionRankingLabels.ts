import fs from "fs";
import type {
  ActionRankingImitationCandidate,
  ActionRankingImitationExample,
} from "../shared/ActionRankingImitation";
import { collectRewardImprovementExamples } from "../shared/ActionRankingTraining";
import {
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import type { Move } from "../shared/MoveHandler";

type MoveType = Move["type"];
type MoveTypeCounts = Record<MoveType, number>;

type RunningStats = {
  count: number;
  total: number;
  totalSquared: number;
};

type PairStats = RunningStats & {
  winnerImmediateTotal: number;
  loserImmediateTotal: number;
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
const policy = modelPath
  ? new NeuralActionRankingPolicy(readModel(modelPath))
  : undefined;
const playerCount = readIntegerEnv("PLAYERS", 4);
const maxStates = readIntegerEnv("LABEL_STATES", 120);
const stateSource = readStateSourceEnv(
  "LABEL_STATE_SOURCE",
  policy ? "policy" : "teacher"
);
const stateTemperature = readNumberEnv("LABEL_STATE_TEMPERATURE", 1);
const stateSample = readBooleanEnv("LABEL_STATE_SAMPLE", false);
const maxPolicyScoreGap = readNumberEnv("LABEL_MAX_SCORE_GAP", 0);
const maxWinnerPolicyScoreGap = readNumberEnv("LABEL_MAX_WINNER_SCORE_GAP", 0);
const policyCandidateLimit = readIntegerEnv("LABEL_POLICY_CANDIDATES", 0);
const candidateLimit = readIntegerEnv("LABEL_CANDIDATES", 8);
const rolloutMoves = readIntegerEnv("LABEL_ROLLOUT_MOVES", 450);
const rolloutCount = readIntegerEnv("LABEL_ROLLOUT_COUNT", 1);
const commonRandom = readBooleanEnv("LABEL_COMMON_RANDOM", true);
const continuationMode = readContinuationModeEnv(
  "LABEL_CONTINUATION",
  "teacher"
);
const requireBehaviorGap = readBooleanEnv("LABEL_REQUIRE_BEHAVIOR_GAP", false);
const minBehaviorImprovement = readNumberEnv(
  "LABEL_MIN_BEHAVIOR_IMPROVEMENT",
  2
);
const minReturnGap = readNumberEnv("LABEL_MIN_RETURN_GAP", 1);
const topPairCount = readIntegerEnv("LABEL_TOP_PAIRS", 12);
const maxSampleExamples = readIntegerEnv("LABEL_MAX_EXAMPLES", 8);
const maxSampleCandidates = readIntegerEnv("LABEL_SAMPLE_CANDIDATES", 8);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const seed = process.env.SEED ?? "action-ranking-label-audit";

if (
  !policy &&
  (stateSource === "policy" ||
    continuationMode === "policy" ||
    maxPolicyScoreGap > 0 ||
    maxWinnerPolicyScoreGap > 0 ||
    policyCandidateLimit > 0)
) {
  throw new Error(
    "MODEL_IN is required for policy-sourced states, policy continuation, policy score-gap filters, or policy candidate forcing."
  );
}

const collection = collectRewardImprovementExamples({
  playerCount,
  maxStates,
  stateSource,
  statePolicy: policy,
  stateTemperature,
  stateSample,
  maxPolicyScoreGap,
  maxWinnerPolicyScoreGap,
  policyCandidateLimit,
  candidateLimit,
  rolloutMoves,
  rolloutCount,
  commonRandom,
  continuationMode,
  continuationPolicy: policy,
  requireBehaviorGap,
  minBehaviorImprovement,
  seed,
  maxMovesPerGame,
});
const diagnostics = diagnoseLabels(collection.examples, policy);

console.log(
  JSON.stringify(
    {
      model: {
        path: modelPath ?? null,
      },
      options: {
        playerCount,
        maxStates,
        stateSource,
        stateTemperature,
        stateSample,
        maxPolicyScoreGap,
        maxWinnerPolicyScoreGap,
        policyCandidateLimit,
        candidateLimit,
        rolloutMoves,
        rolloutCount,
        commonRandom,
        continuationMode,
        requireBehaviorGap,
        minBehaviorImprovement,
        minReturnGap,
        topPairCount,
        maxSampleExamples,
        maxSampleCandidates,
        maxMovesPerGame,
        seed,
      },
      collection: {
        examples: collection.examples.length,
        candidates: collection.examples.reduce(
          (sum, example) => sum + example.candidates.length,
          0
        ),
        scannedStates: collection.scannedStateCount,
        skippedBehaviorGap: collection.skippedBehaviorGapCount,
        skippedPolicyScoreGap: collection.skippedPolicyScoreGapCount,
        skippedPolicyWinnerScoreGap:
          collection.skippedPolicyWinnerScoreGapCount,
        averageTeacherReturn: collection.averageTeacherReturn,
        averageBehaviorReturn: collection.averageBehaviorReturn,
        averageBestReturn: collection.averageBestReturn,
        averageImprovement: collection.averageImprovement,
        averageBestBehaviorImprovement:
          collection.averageBestBehaviorImprovement,
        averageCandidateReturnStdDev:
          collection.averageCandidateReturnStdDev,
      },
      diagnostics,
    },
    null,
    2
  )
);

function diagnoseLabels(
  examples: readonly ActionRankingImitationExample[],
  auditPolicy: NeuralActionRankingPolicy | undefined
) {
  const bestMoveCounts = createMoveTypeCounts();
  const behaviorMoveCounts = createMoveTypeCounts();
  const teacherMoveCounts = createMoveTypeCounts();
  const policyTopMoveCounts = createMoveTypeCounts();
  const bestVsBehaviorPairs = new Map<string, PairStats>();
  const bestVsTeacherPairs = new Map<string, PairStats>();
  const bestVsPolicyTopPairs = new Map<string, PairStats>();
  const allPairwisePairs = new Map<string, PairStats>();
  const bestVsBehaviorReturnGap = createRunningStats();
  const bestVsTeacherReturnGap = createRunningStats();
  const bestVsPolicyTopReturnGap = createRunningStats();
  const policyScoreGapToBest = createRunningStats();
  const policyTopMargin = createRunningStats();
  const localRewardConflictGap = createRunningStats();
  const sampleExamples: {
    example: ActionRankingImitationExample;
    best: ActionRankingImitationCandidate;
    behavior: ActionRankingImitationCandidate | null;
    teacher: ActionRankingImitationCandidate | null;
    policyTop: ActionRankingImitationCandidate | null;
    bestBehaviorGap: number;
  }[] = [];

  let candidateCount = 0;
  let behaviorCandidateCount = 0;
  let teacherCandidateCount = 0;
  let policyTopCandidateCount = 0;
  let bestMatchesBehaviorCount = 0;
  let bestMatchesTeacherCount = 0;
  let bestMatchesPolicyTopCount = 0;
  let policyTopMatchesBehaviorCount = 0;
  let policyCloseMarginAt005Count = 0;
  let policyCloseMarginAt010Count = 0;
  let policyCloseMarginAt025Count = 0;
  let behaviorTradeoffCount = 0;
  let bestLowerImmediateThanBehaviorCount = 0;
  let bestEqualImmediateToBehaviorCount = 0;
  let bestHigherImmediateThanBehaviorCount = 0;

  for (const example of examples) {
    candidateCount += example.candidates.length;
    const best = getSelectedCandidate(example);
    if (!best) {
      continue;
    }

    addMoveCount(bestMoveCounts, best.move.type);
    const behavior = getCandidateByKey(
      example,
      example.behaviorActionKey ?? null
    );
    const teacher = getCandidateByKey(example, example.teacherActionKey ?? null);
    const policyTop = getPolicyTopCandidate(example, auditPolicy);
    const policyTopPrediction = getPolicyTopPrediction(example, auditPolicy);

    if (behavior) {
      behaviorCandidateCount += 1;
      addMoveCount(behaviorMoveCounts, behavior.move.type);
      const gap = getReturnGap(best, behavior);
      if (gap != null) {
        addValue(bestVsBehaviorReturnGap, gap);
        addDirectedPair(bestVsBehaviorPairs, best, behavior, gap);
        if (best.key !== behavior.key) {
          behaviorTradeoffCount += 1;
          const immediateGap =
            best.immediatePointDifferentialDelta -
            behavior.immediatePointDifferentialDelta;
          addValue(localRewardConflictGap, immediateGap);
          if (immediateGap < 0) {
            bestLowerImmediateThanBehaviorCount += 1;
          } else if (immediateGap > 0) {
            bestHigherImmediateThanBehaviorCount += 1;
          } else {
            bestEqualImmediateToBehaviorCount += 1;
          }
        }
      }
      if (best.key === behavior.key) {
        bestMatchesBehaviorCount += 1;
      }
    }

    if (teacher) {
      teacherCandidateCount += 1;
      addMoveCount(teacherMoveCounts, teacher.move.type);
      const gap = getReturnGap(best, teacher);
      if (gap != null) {
        addValue(bestVsTeacherReturnGap, gap);
        addDirectedPair(bestVsTeacherPairs, best, teacher, gap);
      }
      if (best.key === teacher.key) {
        bestMatchesTeacherCount += 1;
      }
    }

    if (policyTop) {
      policyTopCandidateCount += 1;
      addMoveCount(policyTopMoveCounts, policyTop.move.type);
      const gap = getReturnGap(best, policyTop);
      if (gap != null) {
        addValue(bestVsPolicyTopReturnGap, gap);
        addDirectedPair(bestVsPolicyTopPairs, best, policyTop, gap);
      }
      if (best.key === policyTop.key) {
        bestMatchesPolicyTopCount += 1;
      }
      if (behavior && policyTop.key === behavior.key) {
        policyTopMatchesBehaviorCount += 1;
      }
    }

    if (policyTopPrediction) {
      const margin = getPolicyTopMargin(example, auditPolicy);
      if (margin != null) {
        addValue(policyTopMargin, margin);
        if (margin <= 0.05) {
          policyCloseMarginAt005Count += 1;
        }
        if (margin <= 0.1) {
          policyCloseMarginAt010Count += 1;
        }
        if (margin <= 0.25) {
          policyCloseMarginAt025Count += 1;
        }
      }
      const bestScore =
        auditPolicy && best ? auditPolicy.scoreFeatures(best.features) : null;
      if (
        bestScore != null &&
        policyTopPrediction.candidate.key !== best.key
      ) {
        addValue(policyScoreGapToBest, policyTopPrediction.score - bestScore);
      }
    }

    addAllPairwisePreferences(allPairwisePairs, example.candidates);

    const behaviorGap = behavior ? getReturnGap(best, behavior) ?? 0 : 0;
    if (
      best.key !== behavior?.key &&
      (sampleExamples.length < maxSampleExamples ||
        behaviorGap >
          sampleExamples[sampleExamples.length - 1].bestBehaviorGap)
    ) {
      sampleExamples.push({
        example,
        best,
        behavior,
        teacher,
        policyTop,
        bestBehaviorGap: behaviorGap,
      });
      sampleExamples.sort(
        (left, right) => right.bestBehaviorGap - left.bestBehaviorGap
      );
      sampleExamples.splice(maxSampleExamples);
    }
  }

  return {
    examples: examples.length,
    candidates: candidateCount,
    averageCandidatesPerExample:
      examples.length === 0 ? 0 : candidateCount / examples.length,
    bestMatchesBehaviorRate:
      behaviorCandidateCount === 0
        ? 0
        : bestMatchesBehaviorCount / behaviorCandidateCount,
    bestMatchesTeacherRate:
      teacherCandidateCount === 0 ? 0 : bestMatchesTeacherCount / teacherCandidateCount,
    bestMatchesPolicyTopRate:
      policyTopCandidateCount === 0
        ? 0
        : bestMatchesPolicyTopCount / policyTopCandidateCount,
    policyTopMatchesBehaviorRate:
      behaviorCandidateCount === 0
        ? 0
        : policyTopMatchesBehaviorCount / behaviorCandidateCount,
    bestMoveRates: normalizeMoveCounts(bestMoveCounts, examples.length),
    behaviorMoveRates: normalizeMoveCounts(
      behaviorMoveCounts,
      behaviorCandidateCount
    ),
    teacherMoveRates: normalizeMoveCounts(teacherMoveCounts, teacherCandidateCount),
    policyTopMoveRates: normalizeMoveCounts(
      policyTopMoveCounts,
      policyTopCandidateCount
    ),
    rolloutReturnGaps: {
      bestVsBehavior: summarizeRunningStats(bestVsBehaviorReturnGap),
      bestVsTeacher: summarizeRunningStats(bestVsTeacherReturnGap),
      bestVsPolicyTop: summarizeRunningStats(bestVsPolicyTopReturnGap),
    },
    policyScoreGaps: {
      topMargin: summarizeRunningStats(policyTopMargin),
      topOverBestWhenWrong: summarizeRunningStats(policyScoreGapToBest),
      closeTopMarginRateAt005:
        policyTopMargin.count === 0
          ? 0
          : policyCloseMarginAt005Count / policyTopMargin.count,
      closeTopMarginRateAt010:
        policyTopMargin.count === 0
          ? 0
          : policyCloseMarginAt010Count / policyTopMargin.count,
      closeTopMarginRateAt025:
        policyTopMargin.count === 0
          ? 0
          : policyCloseMarginAt025Count / policyTopMargin.count,
    },
    localRewardConflicts: {
      behaviorTradeoffs: behaviorTradeoffCount,
      bestLowerImmediateThanBehaviorRate:
        behaviorTradeoffCount === 0
          ? 0
          : bestLowerImmediateThanBehaviorCount / behaviorTradeoffCount,
      bestEqualImmediateToBehaviorRate:
        behaviorTradeoffCount === 0
          ? 0
          : bestEqualImmediateToBehaviorCount / behaviorTradeoffCount,
      bestHigherImmediateThanBehaviorRate:
        behaviorTradeoffCount === 0
          ? 0
          : bestHigherImmediateThanBehaviorCount / behaviorTradeoffCount,
      immediatePointDifferentialGap:
        summarizeRunningStats(localRewardConflictGap),
    },
    bestVsBehaviorMoveTypePairs: summarizePairMap(
      bestVsBehaviorPairs,
      behaviorCandidateCount
    ),
    bestVsTeacherMoveTypePairs: summarizePairMap(
      bestVsTeacherPairs,
      teacherCandidateCount
    ),
    bestVsPolicyTopMoveTypePairs: summarizePairMap(
      bestVsPolicyTopPairs,
      policyTopCandidateCount
    ),
    allPairwisePreferenceMoveTypePairs: summarizePairMap(
      allPairwisePairs,
      getPairTotalCount(allPairwisePairs)
    ),
    sampleExamples: sampleExamples.map(describeSampleExample),
  };
}

function addAllPairwisePreferences(
  pairs: Map<string, PairStats>,
  candidates: readonly ActionRankingImitationCandidate[]
) {
  candidates.forEach((winner) => {
    candidates.forEach((loser) => {
      if (winner.key === loser.key) {
        return;
      }
      const gap = getReturnGap(winner, loser);
      if (gap != null && gap >= minReturnGap) {
        addDirectedPair(pairs, winner, loser, gap);
      }
    });
  });
}

function describeSampleExample(item: {
  example: ActionRankingImitationExample;
  best: ActionRankingImitationCandidate;
  behavior: ActionRankingImitationCandidate | null;
  teacher: ActionRankingImitationCandidate | null;
  policyTop: ActionRankingImitationCandidate | null;
  bestBehaviorGap: number;
}) {
  const rankedCandidates = item.example.candidates
    .slice()
    .sort((left, right) => {
      const rightReturn = right.rolloutPointDifferentialReturn ?? -Infinity;
      const leftReturn = left.rolloutPointDifferentialReturn ?? -Infinity;
      return rightReturn - leftReturn;
    })
    .slice(0, maxSampleCandidates)
    .map((candidate) => describeCandidate(candidate));

  return {
    trialIndex: item.example.trialIndex,
    stepIndex: item.example.stepIndex,
    playerIndex: item.example.playerIndex,
    playerPointDifferential: item.example.playerPointDifferential,
    bestBehaviorGap: item.bestBehaviorGap,
    best: describeCandidate(item.best),
    behavior: item.behavior ? describeCandidate(item.behavior) : null,
    teacher: item.teacher ? describeCandidate(item.teacher) : null,
    policyTop: item.policyTop ? describeCandidate(item.policyTop) : null,
    candidatesByRolloutReturn: rankedCandidates,
  };
}

function describeCandidate(candidate: ActionRankingImitationCandidate) {
  const policyScore = policy ? policy.scoreFeatures(candidate.features) : null;
  return {
    key: candidate.key,
    move: describeMove(candidate.move),
    moveType: candidate.move.type,
    rolloutPointDifferentialReturn:
      candidate.rolloutPointDifferentialReturn ?? null,
    immediatePointDelta: candidate.immediatePointDelta,
    immediatePointDifferentialDelta:
      candidate.immediatePointDifferentialDelta,
    policyScore,
    endsRound: candidate.endsRound,
  };
}

function getSelectedCandidate(
  example: ActionRankingImitationExample
): ActionRankingImitationCandidate | null {
  const byKey = getCandidateByKey(example, example.selectedActionKey);
  if (byKey) {
    return byKey;
  }
  const index = example.selectedCandidateIndex;
  return index == null ? null : example.candidates[index] ?? null;
}

function getCandidateByKey(
  example: ActionRankingImitationExample,
  key: string | null | undefined
): ActionRankingImitationCandidate | null {
  return key == null
    ? null
    : example.candidates.find((candidate) => candidate.key === key) ?? null;
}

function getPolicyTopCandidate(
  example: ActionRankingImitationExample,
  auditPolicy: NeuralActionRankingPolicy | undefined
): ActionRankingImitationCandidate | null {
  const top = getPolicyTopPrediction(example, auditPolicy);
  return top
    ? getCandidateByKey(example, top.candidate.key) ?? null
    : null;
}

function getPolicyTopPrediction(
  example: ActionRankingImitationExample,
  auditPolicy: NeuralActionRankingPolicy | undefined
) {
  if (!auditPolicy || example.candidates.length === 0) {
    return null;
  }
  return auditPolicy.rankCandidates(example.candidates)[0] ?? null;
}

function getPolicyTopMargin(
  example: ActionRankingImitationExample,
  auditPolicy: NeuralActionRankingPolicy | undefined
): number | null {
  if (!auditPolicy || example.candidates.length <= 1) {
    return null;
  }
  const ranking = auditPolicy.rankCandidates(example.candidates);
  return ranking.length <= 1 ? null : ranking[0].score - ranking[1].score;
}

function getReturnGap(
  winner: ActionRankingImitationCandidate,
  loser: ActionRankingImitationCandidate
): number | null {
  const winnerReturn = winner.rolloutPointDifferentialReturn;
  const loserReturn = loser.rolloutPointDifferentialReturn;
  if (winnerReturn == null || loserReturn == null) {
    return null;
  }
  return winnerReturn - loserReturn;
}

function addDirectedPair(
  pairs: Map<string, PairStats>,
  winner: ActionRankingImitationCandidate,
  loser: ActionRankingImitationCandidate,
  gap: number
) {
  if (winner.key === loser.key) {
    return;
  }
  const pairKey = `${winner.move.type}>${loser.move.type}`;
  const stats = pairs.get(pairKey) ?? createPairStats();
  addValue(stats, gap);
  stats.winnerImmediateTotal += winner.immediatePointDifferentialDelta;
  stats.loserImmediateTotal += loser.immediatePointDifferentialDelta;
  pairs.set(pairKey, stats);
}

function summarizePairMap(pairs: Map<string, PairStats>, denominator: number) {
  return Array.from(pairs.entries())
    .map(([pair, stats]) => ({
      pair,
      count: stats.count,
      rate: denominator === 0 ? 0 : stats.count / denominator,
      averageReturnGap: stats.count === 0 ? 0 : stats.total / stats.count,
      returnGapStdDev: getStdDev(stats),
      averageWinnerImmediatePointDifferentialDelta:
        stats.count === 0 ? 0 : stats.winnerImmediateTotal / stats.count,
      averageLoserImmediatePointDifferentialDelta:
        stats.count === 0 ? 0 : stats.loserImmediateTotal / stats.count,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, topPairCount);
}

function getPairTotalCount(pairs: Map<string, PairStats>): number {
  return Array.from(pairs.values()).reduce(
    (sum, stats) => sum + stats.count,
    0
  );
}

function createRunningStats(): RunningStats {
  return { count: 0, total: 0, totalSquared: 0 };
}

function createPairStats(): PairStats {
  return {
    ...createRunningStats(),
    winnerImmediateTotal: 0,
    loserImmediateTotal: 0,
  };
}

function addValue(stats: RunningStats, value: number): void {
  stats.count += 1;
  stats.total += value;
  stats.totalSquared += value * value;
}

function summarizeRunningStats(stats: RunningStats) {
  return {
    count: stats.count,
    average: stats.count === 0 ? 0 : stats.total / stats.count,
    stdDev: getStdDev(stats),
  };
}

function getStdDev(stats: RunningStats): number {
  if (stats.count <= 1) {
    return 0;
  }
  const mean = stats.total / stats.count;
  const variance =
    (stats.totalSquared - stats.count * mean * mean) / (stats.count - 1);
  return Math.sqrt(Math.max(0, variance));
}

function addMoveCount(counts: MoveTypeCounts, moveType: MoveType): void {
  counts[moveType] += 1;
}

function normalizeMoveCounts(counts: MoveTypeCounts, denominator: number) {
  return Object.fromEntries(
    Object.entries(counts).map(([moveType, count]) => [
      moveType,
      denominator === 0 ? 0 : count / denominator,
    ])
  );
}

function createMoveTypeCounts(): MoveTypeCounts {
  return MOVE_TYPES.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {} as MoveTypeCounts);
}

function describeMove(move: Move): string {
  if (move.type === "c2c") {
    const source =
      move.source.type === "solitaire"
        ? `solitaire:${move.source.index}`
        : move.source.type;
    return `c2c ${source}->center:${move.dest}`;
  }
  if (move.type === "c2s") {
    return `c2s ${move.source}->stack:${move.dest}`;
  }
  if (move.type === "s2s") {
    return `s2s stack:${move.source}->stack:${move.dest} count:${move.count}`;
  }
  if (move.type === "move_field_stack") {
    return `move_field_stack ${move.index}`;
  }
  return move.type;
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
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readStateSourceEnv(
  name: string,
  fallback: "teacher" | "policy"
): "teacher" | "policy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "teacher" ? "teacher" : "policy";
}

function readContinuationModeEnv(
  name: string,
  fallback: "teacher" | "policy"
): "teacher" | "policy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "policy" ? "policy" : "teacher";
}
