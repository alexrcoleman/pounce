import fs from "fs";
import deepClone from "../shared/deepClone";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  getCurrentPointsFromCards,
  getPointDifferential,
  type ActionRankingCandidate,
  type ActionRankingFeatureName,
} from "../shared/ActionRankingPolicy";
import { createTrainingBoard } from "../shared/ActionRankingTraining";
import { getBasicAIMove } from "../shared/ComputerV1";
import { isGameOver, type BoardState } from "../shared/GameUtils";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type ActionRankingPrediction,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

type MoveTypeCounts = Record<Move["type"], number>;

type RolloutMetrics = {
  pointDifferential: number;
  score: number;
  pounceRemaining: number;
  decisionCount: number;
  centerMoveRate: number;
  solitaireMoveRate: number;
  cycleMoveRate: number;
};

type DivergenceTrace = {
  seed: string;
  gameIndex: number;
  neuralPlayerIndex: number;
  stepIndex: number;
  playerPointDifferentialBefore: number;
  playerScoreBefore: number;
  playerPounceRemainingBefore: number;
  pair: string;
  modelA: ReturnType<typeof describePrediction>;
  modelB: ReturnType<typeof describePrediction>;
  topFeatureDeltas: ReturnType<typeof getCandidateFeatureDeltas>;
  focusedFeatureDeltas: ReturnType<typeof getFocusedFeatureDeltas>;
  final: {
    modelA: RolloutMetrics;
    modelB: RolloutMetrics;
    pointDifferentialDelta: number;
    scoreDelta: number;
    pounceRemainingDelta: number;
  };
};

const modelAPath = process.env.MODEL_A;
const modelBPath = process.env.MODEL_B;
if (!modelAPath || !modelBPath) {
  throw new Error("MODEL_A and MODEL_B are required.");
}

const modelA = readModel(modelAPath);
const modelB = readModel(modelBPath);
const policyA = new NeuralActionRankingPolicy(modelA);
const policyB = new NeuralActionRankingPolicy(modelB);
const playerCount = readIntegerEnv("PLAYERS", 4);
const games = readIntegerEnv("TRACE_GAMES", readIntegerEnv("EVAL_GAMES", 48));
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const maxExamples = readIntegerEnv("TRACE_MAX_EXAMPLES", 12);
const topFeatureCount = readIntegerEnv("TRACE_TOP_FEATURES", 10);
const focusedFeatures = readFeatureListEnv("TRACE_FOCUS_FEATURES", [
  "move.c2s",
  "move.cycle",
  "source.deck",
  "source.stackHeight",
  "source.exposedCenterPlayable",
  "source.exposedCanPlaySoon",
  "source.exposedMatchesPounceParity",
  "source.exposedPounceConnectorCloseness",
  "cycle.revealedValue",
  "cycle.revealedCenterPlayable",
  "cycle.revealedCanPlaySoon",
  "cycle.revealedOwnSolitaireDestinationCount",
  "cycle.revealedOwnSolitaireConnectorForPounce",
  "cycle.revealedMatchesPounceParity",
  "cycle.revealedPounceConnectorCloseness",
  "cycle.resetsWaste",
  "cycle.stockFractionAfter",
  "cycle.resetRevealsCard",
  "cycle.resetRevealedValue",
  "cycle.resetRevealedCenterPlayable",
  "cycle.resetRevealedCanPlaySoon",
  "cycle.resetRevealedOwnSolitaireDestinationCount",
  "cycle.resetRevealedOwnSolitaireConnectorForPounce",
  "cycle.resetRevealedMatchesPounceParity",
  "cycle.resetRevealedPounceConnectorCloseness",
  "dest.solitaire",
  "dest.bottomValue",
  "card.value",
  "card.stackParity",
  "card.matchesPounceParity",
  "card.pounceConnectorCloseness",
  "card.canPlaySoon",
  "card.centerPlayableDestinationCount",
  "card.ownSolitaireDestinationCount",
  "card.ownSolitaireConnectorForPounce",
  "own.pounceCount",
  "own.currentPoints",
  "own.pointDifferential",
  "own.pounceCenterPlayable",
  "own.deckCenterPlayable",
  "own.stackCenterPlayableCount",
  "own.pounceCanPlaySoon",
  "opponent.pounceCenterPlayableCount",
  "opponent.deckCenterPlayableCount",
  "opponent.stackCenterPlayableCount",
  "opponent.pounceCanPlaySoonCount",
  "center.opponentPounceCanFollowAfter",
  "center.opponentDeckCanFollowAfter",
  "center.opponentStackCanFollowAfter",
  "center.opponentPounceCanPlaySameNow",
  "solitaire.isTuck",
  "solitaire.deckMoveHelpful",
  "solitaire.destTopCanPlaySoon",
  "solitaire.makesPouncePlayable",
  "solitaire.exposesCenterPlayable",
  "solitaire.exposesCanPlaySoon",
  "solitaire.postTopConnectorCount",
  "solitaire.postTopConnectorCloseness",
  "solitaire.postTopConnectsPounce",
  "solitaire.postTopConnectsStackRoot",
  "solitaire.deckStockFraction",
]);
const seed = process.env.SEED ?? "action-ranking-compare";
const seeds = readSeedList(seed);

const results = seeds.flatMap((traceSeed) =>
  Array.from({ length: games }, (_, gameIndex) =>
    traceGame(traceSeed, gameIndex)
  )
);
const traces = results
  .filter((result): result is DivergenceTrace => result != null)
  .sort(
    (left, right) =>
      left.final.pointDifferentialDelta - right.final.pointDifferentialDelta
  );

console.log(
  JSON.stringify(
    {
      modelA: {
        path: modelAPath,
        label: process.env.LABEL_A ?? null,
      },
      modelB: {
        path: modelBPath,
        label: process.env.LABEL_B ?? null,
      },
      options: {
        playerCount,
        gamesPerSeed: games,
        seedCount: seeds.length,
        maxMovesPerGame,
        maxExamples,
        topFeatureCount,
        focusedFeatures,
        seeds,
      },
      summary: summarizeTraces(traces, results.length),
      worstForModelA: traces.slice(0, maxExamples),
      bestForModelA: traces.slice(-maxExamples).reverse(),
    },
    null,
    2
  )
);

function traceGame(traceSeed: string, gameIndex: number): DivergenceTrace | null {
  const neuralPlayerIndex = gameIndex % playerCount;
  const initialBoard = createTrainingBoard(
    playerCount,
    `${traceSeed}:deal:${gameIndex}`
  );
  const boardA = deepClone(initialBoard);
  const boardB = deepClone(initialBoard);
  const activePlayerIndices = getActivePlayerIndices(boardA);
  const randomA = createSeededRandom(`${traceSeed}:rollout:${gameIndex}`);
  const randomB = createSeededRandom(`${traceSeed}:rollout:${gameIndex}`);
  const cooldownsA = createInitialCooldowns(boardA, activePlayerIndices, randomA);
  const cooldownsB = createInitialCooldowns(boardB, activePlayerIndices, randomB);
  const moveTypeCountsA = boardA.players.map(() => createMoveTypeCounts());
  const moveTypeCountsB = boardB.players.map(() => createMoveTypeCounts());
  prepareBoardForSimulation(boardA, activePlayerIndices);
  prepareBoardForSimulation(boardB, activePlayerIndices);

  for (
    let stepIndex = 0;
    !isGameOver(boardA) && stepIndex < maxMovesPerGame;
    stepIndex++
  ) {
    const playerIndex = getNextPlayerIndex(cooldownsA, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }

    if (playerIndex !== neuralPlayerIndex) {
      const move = getBasicAIMove(boardA, playerIndex, {});
      applyMove(boardA, playerIndex, move, moveTypeCountsA);
      applyMove(boardB, playerIndex, move, moveTypeCountsB);
      cooldownsA[playerIndex] += getMoveDelay(move?.type, randomA);
      cooldownsB[playerIndex] += getMoveDelay(move?.type, randomB);
      continue;
    }

    const candidates = enumerateActionRankingCandidates(boardA, playerIndex);
    const rankingA = policyA.rankCandidates(candidates);
    const rankingB = policyB.rankCandidates(candidates);
    const topA = rankingA[0];
    const topB = rankingB[0];
    if (!topA || !topB) {
      cooldownsA[playerIndex] += getMoveDelay(undefined, randomA);
      cooldownsB[playerIndex] += getMoveDelay(undefined, randomB);
      continue;
    }

    if (topA.candidate.key === topB.candidate.key) {
      applyMove(boardA, playerIndex, topA.candidate.move, moveTypeCountsA);
      applyMove(boardB, playerIndex, topB.candidate.move, moveTypeCountsB);
      cooldownsA[playerIndex] += getMoveDelay(topA.candidate.move.type, randomA);
      cooldownsB[playerIndex] += getMoveDelay(topB.candidate.move.type, randomB);
      continue;
    }

    const scoreAByKey = getScoreMap(rankingA);
    const scoreBByKey = getScoreMap(rankingB);
    const traceStart = {
      seed: traceSeed,
      gameIndex,
      neuralPlayerIndex,
      stepIndex,
      playerPointDifferentialBefore: getPointDifferential(boardA, playerIndex),
      playerScoreBefore: getCurrentPointsFromCards(boardA.players[playerIndex]),
      playerPounceRemainingBefore:
        boardA.players[playerIndex]?.pounceDeck.length ?? 0,
      pair: `${topA.candidate.move.type}>${topB.candidate.move.type}`,
      modelA: describePrediction(
        topA,
        getTopScoreMargin(rankingA),
        scoreAByKey.get(topB.candidate.key) ?? null
      ),
      modelB: describePrediction(
        topB,
        getTopScoreMargin(rankingB),
        scoreBByKey.get(topA.candidate.key) ?? null
      ),
      topFeatureDeltas: getCandidateFeatureDeltas(
        topA.candidate,
        topB.candidate,
        topFeatureCount
      ),
      focusedFeatureDeltas: getFocusedFeatureDeltas(
        topA.candidate,
        topB.candidate,
        focusedFeatures
      ),
    };

    applyMove(boardA, playerIndex, topA.candidate.move, moveTypeCountsA);
    applyMove(boardB, playerIndex, topB.candidate.move, moveTypeCountsB);
    cooldownsA[playerIndex] += getMoveDelay(topA.candidate.move.type, randomA);
    cooldownsB[playerIndex] += getMoveDelay(topB.candidate.move.type, randomB);
    const metricsA = finishRollout(
      boardA,
      policyA,
      activePlayerIndices,
      neuralPlayerIndex,
      cooldownsA,
      randomA,
      moveTypeCountsA,
      stepIndex + 1
    );
    const metricsB = finishRollout(
      boardB,
      policyB,
      activePlayerIndices,
      neuralPlayerIndex,
      cooldownsB,
      randomB,
      moveTypeCountsB,
      stepIndex + 1
    );

    return {
      ...traceStart,
      final: {
        modelA: metricsA,
        modelB: metricsB,
        pointDifferentialDelta:
          metricsA.pointDifferential - metricsB.pointDifferential,
        scoreDelta: metricsA.score - metricsB.score,
        pounceRemainingDelta:
          metricsA.pounceRemaining - metricsB.pounceRemaining,
      },
    };
  }

  return null;
}

function finishRollout(
  board: BoardState,
  policy: NeuralActionRankingPolicy,
  activePlayerIndices: readonly number[],
  neuralPlayerIndex: number,
  cooldowns: number[],
  random: () => number,
  moveTypeCountsByPlayer: MoveTypeCounts[],
  startingMoveCount: number
): RolloutMetrics {
  for (
    let moveCount = startingMoveCount;
    !isGameOver(board) && moveCount < maxMovesPerGame;
    moveCount++
  ) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }
    const move =
      playerIndex === neuralPlayerIndex
        ? policy.chooseCandidate(
            enumerateActionRankingCandidates(board, playerIndex),
            {
              temperature: 1,
              sample: false,
            }
          )?.move
        : getBasicAIMove(board, playerIndex, {});
    applyMove(board, playerIndex, move, moveTypeCountsByPlayer);
    cooldowns[playerIndex] += getMoveDelay(move?.type, random);
  }

  return getRolloutPlayerMetrics(board, moveTypeCountsByPlayer, neuralPlayerIndex);
}

function summarizeTraces(
  tracesToSummarize: readonly DivergenceTrace[],
  totalGames: number
) {
  const pairStats = new Map<
    string,
    {
      count: number;
      pointDifferentialDeltaTotal: number;
      scoreDeltaTotal: number;
      pounceRemainingDeltaTotal: number;
      modelABetterCount: number;
      modelBBetterCount: number;
      tiedCount: number;
    }
  >();
  let pointDifferentialDeltaTotal = 0;
  let scoreDeltaTotal = 0;
  let pounceRemainingDeltaTotal = 0;
  let modelABetterCount = 0;
  let modelBBetterCount = 0;
  let tiedCount = 0;

  tracesToSummarize.forEach((trace) => {
    const delta = trace.final.pointDifferentialDelta;
    pointDifferentialDeltaTotal += delta;
    scoreDeltaTotal += trace.final.scoreDelta;
    pounceRemainingDeltaTotal += trace.final.pounceRemainingDelta;
    if (delta > 0) {
      modelABetterCount += 1;
    } else if (delta < 0) {
      modelBBetterCount += 1;
    } else {
      tiedCount += 1;
    }

    const stats =
      pairStats.get(trace.pair) ??
      {
        count: 0,
        pointDifferentialDeltaTotal: 0,
        scoreDeltaTotal: 0,
        pounceRemainingDeltaTotal: 0,
        modelABetterCount: 0,
        modelBBetterCount: 0,
        tiedCount: 0,
      };
    stats.count += 1;
    stats.pointDifferentialDeltaTotal += delta;
    stats.scoreDeltaTotal += trace.final.scoreDelta;
    stats.pounceRemainingDeltaTotal += trace.final.pounceRemainingDelta;
    if (delta > 0) {
      stats.modelABetterCount += 1;
    } else if (delta < 0) {
      stats.modelBBetterCount += 1;
    } else {
      stats.tiedCount += 1;
    }
    pairStats.set(trace.pair, stats);
  });

  return {
    games: totalGames,
    firstDivergenceCount: tracesToSummarize.length,
    firstDivergenceRate:
      totalGames === 0 ? 0 : tracesToSummarize.length / totalGames,
    noDivergenceCount: totalGames - tracesToSummarize.length,
    averagePointDifferentialDeltaOnDivergence:
      tracesToSummarize.length === 0
        ? 0
        : pointDifferentialDeltaTotal / tracesToSummarize.length,
    averageScoreDeltaOnDivergence:
      tracesToSummarize.length === 0
        ? 0
        : scoreDeltaTotal / tracesToSummarize.length,
    averagePounceRemainingDeltaOnDivergence:
      tracesToSummarize.length === 0
        ? 0
        : pounceRemainingDeltaTotal / tracesToSummarize.length,
    modelABetterRateOnDivergence:
      tracesToSummarize.length === 0
        ? 0
        : modelABetterCount / tracesToSummarize.length,
    modelBBetterRateOnDivergence:
      tracesToSummarize.length === 0
        ? 0
        : modelBBetterCount / tracesToSummarize.length,
    tiedRateOnDivergence:
      tracesToSummarize.length === 0 ? 0 : tiedCount / tracesToSummarize.length,
    pairStats: Array.from(pairStats.entries())
      .map(([pair, stats]) => ({
        pair,
        count: stats.count,
        rate:
          tracesToSummarize.length === 0
            ? 0
            : stats.count / tracesToSummarize.length,
        averagePointDifferentialDelta:
          stats.pointDifferentialDeltaTotal / stats.count,
        averageScoreDelta: stats.scoreDeltaTotal / stats.count,
        averagePounceRemainingDelta:
          stats.pounceRemainingDeltaTotal / stats.count,
        modelABetterRate: stats.modelABetterCount / stats.count,
        modelBBetterRate: stats.modelBBetterCount / stats.count,
        tiedRate: stats.tiedCount / stats.count,
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.averagePointDifferentialDelta -
            right.averagePointDifferentialDelta
      ),
  };
}

function getRolloutPlayerMetrics(
  board: BoardState,
  moveTypeCountsByPlayer: readonly MoveTypeCounts[],
  playerIndex: number
): RolloutMetrics {
  const moveCounts =
    moveTypeCountsByPlayer[playerIndex] ?? createMoveTypeCounts();
  return {
    pointDifferential: getPointDifferential(board, playerIndex),
    score: getCurrentPointsFromCards(board.players[playerIndex]),
    pounceRemaining: board.players[playerIndex]?.pounceDeck.length ?? 0,
    decisionCount: getTotalMoveCount(moveCounts),
    centerMoveRate: getMoveRate(moveCounts, ["c2c"]),
    solitaireMoveRate: getMoveRate(moveCounts, ["c2s", "s2s"]),
    cycleMoveRate: getMoveRate(moveCounts, ["cycle", "flip_deck"]),
  };
}

function describePrediction(
  prediction: ActionRankingPrediction,
  topScoreMargin: number,
  alternativeScore: number | null
) {
  return {
    key: prediction.candidate.key,
    move: describeMove(prediction.candidate.move),
    moveType: prediction.candidate.move.type,
    score: prediction.score,
    probability: prediction.probability,
    topScoreMargin,
    scoreMarginVsOtherTop:
      alternativeScore == null ? null : prediction.score - alternativeScore,
    immediatePointDelta: prediction.candidate.immediatePointDelta,
    immediatePointDifferentialDelta:
      prediction.candidate.immediatePointDifferentialDelta,
    endsRound: prediction.candidate.endsRound,
  };
}

function getCandidateFeatureDeltas(
  candidateA: ActionRankingCandidate,
  candidateB: ActionRankingCandidate,
  limit: number
) {
  return ACTION_RANKING_FEATURE_NAMES.map((feature, index) => {
    const modelAValue = candidateA.features[index] ?? 0;
    const modelBValue = candidateB.features[index] ?? 0;
    return {
      feature: feature as ActionRankingFeatureName,
      modelAValue,
      modelBValue,
      delta: modelAValue - modelBValue,
    };
  })
    .filter((item) => item.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, limit);
}

function getFocusedFeatureDeltas(
  candidateA: ActionRankingCandidate,
  candidateB: ActionRankingCandidate,
  features: readonly ActionRankingFeatureName[]
) {
  return features.map((feature) => {
    const index = ACTION_RANKING_FEATURE_NAMES.indexOf(feature);
    const modelAValue = index < 0 ? 0 : candidateA.features[index] ?? 0;
    const modelBValue = index < 0 ? 0 : candidateB.features[index] ?? 0;
    return {
      feature,
      modelAValue,
      modelBValue,
      delta: modelAValue - modelBValue,
    };
  });
}

function getScoreMap(predictions: readonly ActionRankingPrediction[]) {
  return new Map(
    predictions.map((prediction) => [
      prediction.candidate.key,
      prediction.score,
    ])
  );
}

function getTopScoreMargin(predictions: readonly ActionRankingPrediction[]) {
  if (predictions.length <= 1) {
    return Number.POSITIVE_INFINITY;
  }
  return predictions[0].score - predictions[1].score;
}

function applyMove(
  board: BoardState,
  playerIndex: number,
  move: Move | undefined,
  moveTypeCountsByPlayer: MoveTypeCounts[]
): void {
  if (!move) {
    return;
  }
  executeMove(board, playerIndex, move);
  moveTypeCountsByPlayer[playerIndex][move.type] += 1;
}

function createInitialCooldowns(
  board: BoardState,
  activePlayerIndices: readonly number[],
  random: () => number
): number[] {
  return board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? random()
      : Number.POSITIVE_INFINITY
  );
}

function prepareBoardForSimulation(
  board: BoardState,
  activePlayerIndices: readonly number[]
): void {
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.players.forEach((player, playerIndex) => {
    if (activePlayerIndices.includes(playerIndex)) {
      player.socketId = null;
    }
  });
}

function getActivePlayerIndices(board: BoardState): number[] {
  return board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);
}

function getNextPlayerIndex(
  cooldowns: number[],
  activePlayerIndices: readonly number[]
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

function getTotalMoveCount(counts: MoveTypeCounts): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function getMoveRate(
  counts: MoveTypeCounts,
  moveTypes: readonly Move["type"][]
): number {
  const total = getTotalMoveCount(counts);
  if (total === 0) {
    return 0;
  }
  return moveTypes.reduce((sum, moveType) => sum + counts[moveType], 0) / total;
}

function createMoveTypeCounts(): MoveTypeCounts {
  return {
    c2c: 0,
    c2s: 0,
    s2s: 0,
    cycle: 0,
    flip_deck: 0,
    move_field_stack: 0,
  };
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
    return `s2s stack:${move.source}->stack:${move.dest} x${move.count}`;
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

function readSeedList(defaultSeed: string): string[] {
  const explicit = process.env.TRACE_SEEDS ?? process.env.EVAL_SEEDS;
  if (explicit && explicit.trim() !== "") {
    return explicit
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const runs = readIntegerEnv("TRACE_RUNS", readIntegerEnv("EVAL_RUNS", 1));
  return Array.from({ length: Math.max(1, runs) }, (_, index) =>
    runs === 1 ? defaultSeed : `${defaultSeed}:${index}`
  );
}

function readFeatureListEnv(
  name: string,
  fallback: readonly ActionRankingFeatureName[]
): ActionRankingFeatureName[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback.slice();
  }

  const featureSet = new Set<string>(ACTION_RANKING_FEATURE_NAMES);
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ActionRankingFeatureName => featureSet.has(item));
  return parsed.length === 0 ? fallback.slice() : parsed;
}
