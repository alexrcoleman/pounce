import { isGameOver, type BoardState } from "./GameUtils";
import { getBasicAIMove } from "./ComputerV1";
import { executeMove, type Move } from "./MoveHandler";
import deepClone from "./deepClone";

export type DealSimulationPlayerResult = {
  playerIndex: number;
  predictedScore: number;
  predictedScoreConfidenceInterval95: number;
  predictedPointDifferential: number;
  predictedRank: number;
  simulationCount: number;
  pounceOutRate: number;
  averagePounceCardsLeft: number;
};

type DealSimulationOptions = {
  maxTrials?: number;
  maxMovesPerTrial?: number;
};

type PlayerTrialResult = {
  score: number;
  pouncedOut: boolean;
  pounceCardsLeft: number;
};

const DEFAULT_TRIALS = 16;
const DEFAULT_MAX_MOVES_PER_TRIAL = 1800;

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
  const totals = new Map<
    number,
    {
      score: number;
      scoreSquared: number;
      pouncedOut: number;
      pounceCardsLeft: number;
    }
  >();
  activePlayerIndices.forEach((playerIndex) => {
    totals.set(playerIndex, {
      score: 0,
      scoreSquared: 0,
      pouncedOut: 0,
      pounceCardsLeft: 0,
    });
  });

  const baseSeed = getBoardSeed(startBoard);
  for (let trialIndex = 0; trialIndex < maxTrials; trialIndex++) {
    const trialResults = runDealSimulationTrial(
      startBoard,
      activePlayerIndices,
      `${baseSeed}:${trialIndex}`,
      maxMovesPerTrial
    );
    trialResults.forEach((result, playerIndex) => {
      const total = totals.get(playerIndex);
      if (!total) {
        return;
      }
      total.score += result.score;
      total.scoreSquared += result.score * result.score;
      total.pouncedOut += result.pouncedOut ? 1 : 0;
      total.pounceCardsLeft += result.pounceCardsLeft;
    });
  }

  const unranked = activePlayerIndices.map((playerIndex) => {
    const total = totals.get(playerIndex)!;
    const predictedScore = total.score / maxTrials;
    return {
      playerIndex,
      predictedScore,
      predictedScoreConfidenceInterval95: getMeanConfidenceInterval95(
        getSampleVariance(total.score, total.scoreSquared, maxTrials),
        maxTrials
      ),
      predictedPointDifferential: 0,
      predictedRank: 1,
      simulationCount: maxTrials,
      pounceOutRate: total.pouncedOut / maxTrials,
      averagePounceCardsLeft: total.pounceCardsLeft / maxTrials,
    };
  });
  const predictedScoreTotal = unranked.reduce(
    (sum, result) => sum + result.predictedScore,
    0
  );
  unranked.forEach((result) => {
    result.predictedPointDifferential = getPointDifferentialFromScore(
      result.predictedScore,
      predictedScoreTotal,
      activePlayerIndices.length
    );
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

  return unranked;
}

function getPointDifferentialFromScore(
  score: number,
  totalScore: number,
  playerCount: number
): number {
  if (playerCount <= 1) {
    return 0;
  }
  return score * playerCount - totalScore;
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

    const move = getBasicAIMove(board, playerIndex, {});
    if (move) {
      executeMove(board, playerIndex, move);
    }

    cooldowns[playerIndex] += getMoveDelay(move?.type, random);
    moveCount += 1;
  }

  return new Map(
    activePlayerIndices.map((playerIndex) => {
      const player = board.players[playerIndex];
      return [
        playerIndex,
        {
          score: player.currentPoints,
          pouncedOut: player.pounceDeck.length === 0,
          pounceCardsLeft: player.pounceDeck.length,
        },
      ];
    })
  );
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
