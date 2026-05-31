import { isGameOver, type BoardState } from "./GameUtils";
import {
  analysisStrategyProfiles,
  defaultHumanAnalysisStrategyProfile,
  getAIPlayerStrategyProfile,
  getBasicAIMove,
  type AIStrategyLean,
  type AIStrategyProfile,
} from "./ComputerV1";
import { executeMove, type Move } from "./MoveHandler";
import deepClone from "./deepClone";

export type DealSimulationStrategyLean = AIStrategyLean | "mixed";

export type DealSimulationStrategy = {
  id: string;
  name: string;
  lean: DealSimulationStrategyLean;
  summary: string;
};

export type DealSimulationStrategyComparison = DealSimulationStrategy & {
  predictedScore: number;
  predictedScoreConfidenceInterval95: number;
  predictedPointDifferential: number;
  predictedPointDifferentialConfidenceInterval95: number;
  simulationCount: number;
  averageCenterMoves: number;
  averageSolitaireMoves: number;
  solitaireMoveShare: number | null;
  isBaseline: boolean;
  pointDifferentialGain: number;
  pointDifferentialGainConfidenceInterval95: number;
  clearBestMargin: number;
  clearBestMarginConfidenceInterval95: number;
  isClearBest: boolean;
};

export type DealSimulationPlayerResult = {
  playerIndex: number;
  predictedScore: number;
  predictedScoreConfidenceInterval95: number;
  predictedPointDifferential: number;
  predictedPointDifferentialConfidenceInterval95: number;
  predictedRank: number;
  simulationCount: number;
  pounceOutRate: number;
  averagePounceCardsLeft: number;
  averageCenterMoves?: number;
  averageSolitaireMoves?: number;
  solitaireMoveShare?: number | null;
  strategy?: DealSimulationStrategy;
  bestStrategy?: DealSimulationStrategyComparison;
  recommendedStrategy?: DealSimulationStrategyComparison;
  strategyComparisons?: DealSimulationStrategyComparison[];
};

type DealSimulationOptions = {
  maxTrials?: number;
  maxMovesPerTrial?: number;
  strategyComparisonTrials?: number;
  includeStrategyComparisons?: boolean;
  strategyComparisonPlayerIndices?: number[];
  sharedStrategyProfile?: AIStrategyProfile;
};

type PlayerTrialResult = {
  score: number;
  pouncedOut: boolean;
  pounceCardsLeft: number;
  centerMoves: number;
  solitaireMoves: number;
};

type PlayerTrialTotals = {
  score: number;
  scoreSquared: number;
  pointDifferential: number;
  pointDifferentialSquared: number;
  pouncedOut: number;
  pounceCardsLeft: number;
  centerMoves: number;
  solitaireMoves: number;
};

type PlayerStrategyAssignment =
  | { type: "fixed"; profile: AIStrategyProfile }
  | {
      type: "sample";
      baselineProfile: AIStrategyProfile;
      profiles: AIStrategyProfile[];
      strategy: DealSimulationStrategy;
    };

const DEFAULT_TRIALS = 25;
const DEFAULT_MAX_MOVES_PER_TRIAL = 1800;
const DEFAULT_STRATEGY_COMPARISON_TRIALS = 8;
const MIN_CLEAR_STRATEGY_MARGIN = 1;
const mixedHumanAnalysisStrategy: DealSimulationStrategy = {
  id: "mixed-human-analysis",
  name: "Mixed strategy sample",
  lean: "mixed",
  summary:
    "Samples solitaire-heavy, balanced setup, and center-pressure strategies across trials.",
};

export function simulateDealQuality(
  startBoard: BoardState,
  options: DealSimulationOptions = {}
): DealSimulationPlayerResult[] {
  const activePlayerIndices = startBoard.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);

  if (activePlayerIndices.length === 0) {
    return [];
  }

  const maxTrials = Math.max(
    1,
    Math.floor(options.maxTrials ?? DEFAULT_TRIALS)
  );
  const maxMovesPerTrial = Math.max(
    1,
    Math.floor(options.maxMovesPerTrial ?? DEFAULT_MAX_MOVES_PER_TRIAL)
  );

  const baseSeed = getBoardSeed(startBoard);
  const strategyAssignments = getDefaultStrategyAssignments(
    startBoard,
    activePlayerIndices,
    options.sharedStrategyProfile
  );
  const totals = runDealSimulationTrials(
    startBoard,
    activePlayerIndices,
    strategyAssignments,
    baseSeed,
    maxTrials,
    maxMovesPerTrial
  );

  const unranked = activePlayerIndices.map((playerIndex) => {
    const total = totals.get(playerIndex)!;
    const predictedScore = total.score / maxTrials;
    const predictedPointDifferential = total.pointDifferential / maxTrials;
    return {
      playerIndex,
      predictedScore,
      predictedScoreConfidenceInterval95: getMeanConfidenceInterval95(
        getSampleVariance(total.score, total.scoreSquared, maxTrials),
        maxTrials
      ),
      predictedPointDifferential,
      predictedPointDifferentialConfidenceInterval95:
        getMeanConfidenceInterval95(
          getSampleVariance(
            total.pointDifferential,
            total.pointDifferentialSquared,
            maxTrials
          ),
          maxTrials
        ),
      predictedRank: 1,
      simulationCount: maxTrials,
      pounceOutRate: total.pouncedOut / maxTrials,
      averagePounceCardsLeft: total.pounceCardsLeft / maxTrials,
      averageCenterMoves: total.centerMoves / maxTrials,
      averageSolitaireMoves: total.solitaireMoves / maxTrials,
      solitaireMoveShare: getSolitaireMoveShare(
        total.solitaireMoves,
        total.centerMoves
      ),
      strategy: getDealSimulationStrategy(
        strategyAssignments.get(playerIndex) ?? {
          type: "fixed",
          profile: defaultHumanAnalysisStrategyProfile,
        }
      ),
    };
  });
  const ranked = unranked
    .slice()
    .sort(
      (a, b) =>
        b.predictedScore - a.predictedScore || a.playerIndex - b.playerIndex
    );
  ranked.forEach((result, index) => {
    result.predictedRank = index + 1;
  });

  if (options.includeStrategyComparisons ?? true) {
    const strategyComparisonTrials = Math.max(
      1,
      Math.floor(
        options.strategyComparisonTrials ??
          Math.min(maxTrials, DEFAULT_STRATEGY_COMPARISON_TRIALS)
      )
    );
    addStrategyComparisons(
      startBoard,
      activePlayerIndices,
      strategyAssignments,
      unranked,
      baseSeed,
      strategyComparisonTrials,
      maxMovesPerTrial,
      options.strategyComparisonPlayerIndices
    );
  }

  return unranked;
}

export function simulateBalancedDealScores(
  startBoard: BoardState,
  options: Pick<DealSimulationOptions, "maxTrials" | "maxMovesPerTrial"> = {}
): DealSimulationPlayerResult[] {
  return simulateDealQuality(startBoard, {
    ...options,
    includeStrategyComparisons: false,
    sharedStrategyProfile: defaultHumanAnalysisStrategyProfile,
  });
}

function getDefaultStrategyAssignments(
  startBoard: BoardState,
  activePlayerIndices: number[],
  sharedStrategyProfile?: AIStrategyProfile
): Map<number, PlayerStrategyAssignment> {
  if (sharedStrategyProfile) {
    return new Map(
      activePlayerIndices.map((playerIndex) => [
        playerIndex,
        { type: "fixed", profile: sharedStrategyProfile },
      ])
    );
  }

  return new Map(
    activePlayerIndices.map((playerIndex) => {
      const player = startBoard.players[playerIndex];
      return [
        playerIndex,
        player.socketId == null
          ? {
              type: "fixed",
              profile: getAIPlayerStrategyProfile(startBoard, playerIndex),
            }
          : {
              type: "sample",
              baselineProfile: defaultHumanAnalysisStrategyProfile,
              profiles: analysisStrategyProfiles,
              strategy: mixedHumanAnalysisStrategy,
            },
      ];
    })
  );
}

function runDealSimulationTrials(
  startBoard: BoardState,
  activePlayerIndices: number[],
  strategyAssignments: Map<number, PlayerStrategyAssignment>,
  seed: string,
  maxTrials: number,
  maxMovesPerTrial: number
): Map<number, PlayerTrialTotals> {
  const totals = createPlayerTrialTotals(activePlayerIndices);

  for (let trialIndex = 0; trialIndex < maxTrials; trialIndex++) {
    const trialResults = runDealSimulationTrial(
      startBoard,
      activePlayerIndices,
      resolveTrialStrategyAssignments(
        strategyAssignments,
        activePlayerIndices,
        seed,
        trialIndex
      ),
      `${seed}:${trialIndex}`,
      maxMovesPerTrial
    );
    addTrialResultsToTotals(totals, trialResults, activePlayerIndices);
  }

  return totals;
}

function resolveTrialStrategyAssignments(
  strategyAssignments: Map<number, PlayerStrategyAssignment>,
  activePlayerIndices: number[],
  seed: string,
  trialIndex: number
): Map<number, AIStrategyProfile> {
  return new Map(
    activePlayerIndices.map((playerIndex) => [
      playerIndex,
      resolveTrialStrategyAssignment(
        strategyAssignments.get(playerIndex),
        `${seed}:strategy:${trialIndex}:${playerIndex}`
      ),
    ])
  );
}

function resolveTrialStrategyAssignment(
  assignment: PlayerStrategyAssignment | undefined,
  seed: string
): AIStrategyProfile {
  if (!assignment) {
    return defaultHumanAnalysisStrategyProfile;
  }

  if (assignment.type === "fixed") {
    return assignment.profile;
  }

  const profiles =
    assignment.profiles.length > 0
      ? assignment.profiles
      : [assignment.baselineProfile];
  const random = createSeededRandom(seed);
  return profiles[Math.floor(random() * profiles.length) % profiles.length];
}

function createPlayerTrialTotals(
  activePlayerIndices: number[]
): Map<number, PlayerTrialTotals> {
  return new Map(
    activePlayerIndices.map((playerIndex) => [
      playerIndex,
      {
        score: 0,
        scoreSquared: 0,
        pointDifferential: 0,
        pointDifferentialSquared: 0,
        pouncedOut: 0,
        pounceCardsLeft: 0,
        centerMoves: 0,
        solitaireMoves: 0,
      },
    ])
  );
}

function addTrialResultsToTotals(
  totals: Map<number, PlayerTrialTotals>,
  trialResults: Map<number, PlayerTrialResult>,
  activePlayerIndices: number[]
): void {
  const trialScoreTotal = activePlayerIndices.reduce(
    (sum, playerIndex) => sum + (trialResults.get(playerIndex)?.score ?? 0),
    0
  );

  trialResults.forEach((result, playerIndex) => {
    const total = totals.get(playerIndex);
    if (!total) {
      return;
    }
    const pointDifferential = getPointDifferentialFromScore(
      result.score,
      trialScoreTotal,
      activePlayerIndices.length
    );
    total.score += result.score;
    total.scoreSquared += result.score * result.score;
    total.pointDifferential += pointDifferential;
    total.pointDifferentialSquared += pointDifferential * pointDifferential;
    total.pouncedOut += result.pouncedOut ? 1 : 0;
    total.pounceCardsLeft += result.pounceCardsLeft;
    total.centerMoves += result.centerMoves;
    total.solitaireMoves += result.solitaireMoves;
  });
}

function addStrategyComparisons(
  startBoard: BoardState,
  activePlayerIndices: number[],
  defaultStrategyAssignments: Map<number, PlayerStrategyAssignment>,
  results: DealSimulationPlayerResult[],
  baseSeed: string,
  maxTrials: number,
  maxMovesPerTrial: number,
  strategyComparisonPlayerIndices?: number[]
): void {
  const comparedPlayerIndices =
    strategyComparisonPlayerIndices == null
      ? null
      : new Set(strategyComparisonPlayerIndices);

  results.forEach((result) => {
    if (
      comparedPlayerIndices &&
      !comparedPlayerIndices.has(result.playerIndex)
    ) {
      return;
    }

    const defaultAssignment = defaultStrategyAssignments.get(
      result.playerIndex
    );
    const baselineProfile = getBaselineStrategyProfile(defaultAssignment);
    const comparisonProfiles = getStrategyComparisonProfiles(baselineProfile);
    const comparisons = comparisonProfiles.map((strategyProfile) => {
      const strategyAssignments = new Map(defaultStrategyAssignments);
      strategyAssignments.set(result.playerIndex, {
        type: "fixed",
        profile: strategyProfile,
      });
      const totals = runDealSimulationTrials(
        startBoard,
        activePlayerIndices,
        strategyAssignments,
        `${baseSeed}:strategy:${result.playerIndex}`,
        maxTrials,
        maxMovesPerTrial
      );
      const playerTotal = totals.get(result.playerIndex)!;
      return getStrategyComparison(strategyProfile, playerTotal, maxTrials);
    });
    const annotatedComparisons = annotateStrategyComparisons(
      comparisons,
      baselineProfile.id
    );

    result.strategyComparisons = annotatedComparisons;
    result.bestStrategy = getBestStrategyComparison(annotatedComparisons);
    result.recommendedStrategy =
      getClearRecommendedStrategy(annotatedComparisons);
  });
}

function getBaselineStrategyProfile(
  assignment: PlayerStrategyAssignment | undefined
): AIStrategyProfile {
  if (!assignment) {
    return defaultHumanAnalysisStrategyProfile;
  }
  if (assignment.type === "fixed") {
    return assignment.profile;
  }
  return assignment.baselineProfile;
}

function getStrategyComparisonProfiles(
  baselineProfile: AIStrategyProfile
): AIStrategyProfile[] {
  const profiles = analysisStrategyProfiles.slice();
  if (!profiles.some((profile) => profile.id === baselineProfile.id)) {
    profiles.push(baselineProfile);
  }
  return profiles;
}

function getStrategyComparison(
  strategyProfile: AIStrategyProfile,
  total: PlayerTrialTotals,
  maxTrials: number
): DealSimulationStrategyComparison {
  const predictedScore = total.score / maxTrials;
  const predictedPointDifferential = total.pointDifferential / maxTrials;
  return {
    ...getDealSimulationStrategy(strategyProfile),
    predictedScore,
    predictedScoreConfidenceInterval95: getMeanConfidenceInterval95(
      getSampleVariance(total.score, total.scoreSquared, maxTrials),
      maxTrials
    ),
    predictedPointDifferential,
    predictedPointDifferentialConfidenceInterval95:
      getMeanConfidenceInterval95(
        getSampleVariance(
          total.pointDifferential,
          total.pointDifferentialSquared,
          maxTrials
        ),
        maxTrials
      ),
    simulationCount: maxTrials,
    averageCenterMoves: total.centerMoves / maxTrials,
    averageSolitaireMoves: total.solitaireMoves / maxTrials,
    solitaireMoveShare: getSolitaireMoveShare(
      total.solitaireMoves,
      total.centerMoves
    ),
    isBaseline: false,
    pointDifferentialGain: 0,
    pointDifferentialGainConfidenceInterval95: 0,
    clearBestMargin: 0,
    clearBestMarginConfidenceInterval95: 0,
    isClearBest: false,
  };
}

function getDealSimulationStrategy(
  strategyProfile: AIStrategyProfile | PlayerStrategyAssignment
): DealSimulationStrategy {
  if ("type" in strategyProfile) {
    if (strategyProfile.type === "sample") {
      return strategyProfile.strategy;
    }
    return getDealSimulationStrategy(strategyProfile.profile);
  }

  return {
    id: strategyProfile.id,
    name: strategyProfile.name,
    lean: strategyProfile.lean,
    summary: strategyProfile.summary,
  };
}

function annotateStrategyComparisons(
  comparisons: DealSimulationStrategyComparison[],
  baselineStrategyId: string
): DealSimulationStrategyComparison[] {
  const baseline =
    comparisons.find((comparison) => comparison.id === baselineStrategyId) ??
    comparisons[0];
  const ranked = comparisons
    .slice()
    .sort(
      (a, b) =>
        b.predictedPointDifferential - a.predictedPointDifferential ||
        b.predictedScore - a.predictedScore
    );
  const best = ranked[0];
  const runnerUp = ranked[1];
  const clearBestMargin =
    best && runnerUp
      ? best.predictedPointDifferential - runnerUp.predictedPointDifferential
      : 0;
  const clearBestMarginConfidenceInterval95 =
    best && runnerUp
      ? getCombinedConfidenceInterval95(
          best.predictedPointDifferentialConfidenceInterval95,
          runnerUp.predictedPointDifferentialConfidenceInterval95
        )
      : 0;
  const isClearBest =
    best != null &&
    clearBestMargin >
      Math.max(MIN_CLEAR_STRATEGY_MARGIN, clearBestMarginConfidenceInterval95);

  return comparisons.map((comparison) => {
    const isBaseline = comparison.id === baseline.id;
    const pointDifferentialGain =
      comparison.predictedPointDifferential -
      baseline.predictedPointDifferential;
    return {
      ...comparison,
      isBaseline,
      pointDifferentialGain,
      pointDifferentialGainConfidenceInterval95: isBaseline
        ? 0
        : getCombinedConfidenceInterval95(
            comparison.predictedPointDifferentialConfidenceInterval95,
            baseline.predictedPointDifferentialConfidenceInterval95
          ),
      clearBestMargin:
        best && comparison.id === best.id ? clearBestMargin : 0,
      clearBestMarginConfidenceInterval95:
        best && comparison.id === best.id
          ? clearBestMarginConfidenceInterval95
          : 0,
      isClearBest: best != null && comparison.id === best.id && isClearBest,
    };
  });
}

function getBestStrategyComparison(
  comparisons: DealSimulationStrategyComparison[]
): DealSimulationStrategyComparison | undefined {
  return comparisons
    .slice()
    .sort(
      (a, b) =>
        b.predictedPointDifferential - a.predictedPointDifferential ||
        b.predictedScore - a.predictedScore
    )[0];
}

function getClearRecommendedStrategy(
  comparisons: DealSimulationStrategyComparison[]
): DealSimulationStrategyComparison | undefined {
  const best = getBestStrategyComparison(comparisons);
  if (!best || !best.isClearBest) {
    return;
  }

  return best;
}

function getCombinedConfidenceInterval95(first: number, second: number): number {
  return Math.sqrt(first * first + second * second);
}

function getSolitaireMoveShare(
  solitaireMoves: number,
  centerMoves: number
): number | null {
  const totalMoves = solitaireMoves + centerMoves;
  if (totalMoves <= 0) {
    return null;
  }
  return solitaireMoves / totalMoves;
}

function getPointDifferentialFromScore(
  score: number,
  totalScore: number,
  playerCount: number
): number {
  if (playerCount <= 1) {
    return 0;
  }
  return (score * playerCount - totalScore) / (playerCount - 1);
}

function getSampleVariance(
  sum: number,
  sumSquares: number,
  sampleSize: number
): number {
  if (sampleSize <= 1) {
    return 0;
  }
  return Math.max(0, (sumSquares - (sum * sum) / sampleSize) / (sampleSize - 1));
}

function getMeanConfidenceInterval95(
  sampleVariance: number,
  sampleSize: number
): number {
  if (sampleSize <= 1) {
    return 0;
  }
  return (
    getT95CriticalValue(sampleSize) * Math.sqrt(sampleVariance / sampleSize)
  );
}

function getT95CriticalValue(sampleSize: number): number {
  const degreesOfFreedom = sampleSize - 1;
  const exactValues = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
    2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093,
    2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048,
    2.045, 2.042,
  ];
  if (degreesOfFreedom <= exactValues.length) {
    return exactValues[Math.max(0, degreesOfFreedom - 1)];
  }
  if (degreesOfFreedom <= 40) {
    return 2.021;
  }
  if (degreesOfFreedom <= 60) {
    return 2;
  }
  if (degreesOfFreedom <= 120) {
    return 1.98;
  }
  return 1.96;
}

function runDealSimulationTrial(
  startBoard: BoardState,
  activePlayerIndices: number[],
  strategyAssignments: Map<number, AIStrategyProfile>,
  seed: string,
  maxMoves: number
): Map<number, PlayerTrialResult> {
  const random = createSeededRandom(seed);
  const board = deepClone(startBoard);
  const cooldowns = board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? random()
      : Number.POSITIVE_INFINITY
  );
  const moveStats = new Map(
    activePlayerIndices.map((playerIndex) => [
      playerIndex,
      { centerMoves: 0, solitaireMoves: 0 },
    ])
  );

  board.isActive = true;
  board.isPaused = false;
  board.players.forEach((player, playerIndex) => {
    if (activePlayerIndices.includes(playerIndex)) {
      player.socketId = null;
    }
  });

  let moveCount = 0;
  while (!isGameOver(board) && moveCount < maxMoves) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }

    const move = getBasicAIMove(
      board,
      playerIndex,
      {},
      strategyAssignments.get(playerIndex) ?? defaultHumanAnalysisStrategyProfile
    );
    if (move) {
      const moveResult = executeMove(board, playerIndex, move);
      if (moveResult?.boardChanged) {
        recordSimulationMove(moveStats.get(playerIndex), move);
      }
    }

    cooldowns[playerIndex] += getMoveDelay(move?.type, random);
    moveCount += 1;
  }

  return new Map(
    activePlayerIndices.map((playerIndex) => {
      const player = board.players[playerIndex];
      const stats = moveStats.get(playerIndex);
      return [
        playerIndex,
        {
          score: player.currentPoints,
          pouncedOut: player.pounceDeck.length === 0,
          pounceCardsLeft: player.pounceDeck.length,
          centerMoves: stats?.centerMoves ?? 0,
          solitaireMoves: stats?.solitaireMoves ?? 0,
        },
      ];
    })
  );
}

function recordSimulationMove(
  stats: { centerMoves: number; solitaireMoves: number } | undefined,
  move: Move
): void {
  if (!stats) {
    return;
  }

  if (move.type === "c2c") {
    stats.centerMoves += 1;
  } else if (move.type === "c2s" || move.type === "s2s") {
    stats.solitaireMoves += 1;
  }
}

function getNextPlayerIndex(
  cooldowns: number[],
  activePlayerIndices: number[]
): number {
  return activePlayerIndices.reduce((bestIndex, playerIndex) => {
    if (bestIndex < 0 || cooldowns[playerIndex] < cooldowns[bestIndex]) {
      return playerIndex;
    }
    return bestIndex;
  }, -1);
}

function getMoveDelay(
  moveType: Move["type"] | undefined,
  random: () => number
): number {
  const jitter = 0.72 + random() * 0.56;
  if (moveType === "cycle" || moveType === "flip_deck") {
    return 0.34 * jitter;
  }
  if (moveType === "s2s") {
    return 0.88 * jitter;
  }
  if (moveType === "c2s") {
    return 0.76 * jitter;
  }
  if (moveType === "c2c") {
    return 0.62 * jitter;
  }
  return 1.1 * jitter;
}

function getBoardSeed(board: BoardState): string {
  return board.players
    .map((player) =>
      [
        player.name,
        ...player.pounceDeck.map(formatSeedCard),
        "|",
        ...player.stacks.flatMap((stack) => stack.map(formatSeedCard)),
        "|",
        ...player.deck.map(formatSeedCard),
      ].join(",")
    )
    .join(";");
}

function formatSeedCard(card: {
  player: number;
  suit: string;
  value: number;
}): string {
  return `${card.player}:${card.suit}:${card.value}`;
}

function createSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
