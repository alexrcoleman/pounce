import { performance } from "perf_hooks";
import {
  enumerateActionRankingCandidates,
  type ActionRankingOptions,
} from "../shared/ActionRankingPolicy";
import {
  createTrainingBoard,
} from "../shared/ActionRankingTraining";
import {
  applySimulationMoveResult,
  createSimulationHands,
  getSimulationHand,
} from "../shared/AISimulationCursor";
import {
  getBasicAIMove,
  getCurrentAIDragMove,
} from "../shared/ComputerV1";
import { isGameOver, type BoardState, type CursorState } from "../shared/GameUtils";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

type BenchmarkMode = "fixed" | "neural" | "enumerate";

type GameResult = {
  completed: boolean;
  moves: number;
  candidates: number;
};

const mode = readModeEnv("MODE", "fixed");
const playerCount = readIntegerEnv("PLAYERS", 4);
const games = readIntegerEnv("GAMES", 500);
const warmupGames = readIntegerEnv("WARMUP_GAMES", Math.min(50, games));
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const seed = process.env.SEED ?? "simulation-benchmark";
const includeWait = readBooleanEnv("INCLUDE_WAIT", false);
const includePremove = readBooleanEnv("INCLUDE_PREMOVE", false);

const actionOptions: ActionRankingOptions = {
  includeWait,
  includePremove,
};

for (let index = 0; index < warmupGames; index++) {
  runGame(index, `${seed}:warmup`, mode);
}

const startedAt = performance.now();
let totalMoves = 0;
let totalCandidates = 0;
let completedGames = 0;

for (let index = 0; index < games; index++) {
  const result = runGame(index, seed, mode);
  totalMoves += result.moves;
  totalCandidates += result.candidates;
  if (result.completed) {
    completedGames += 1;
  }
}

const elapsedMs = performance.now() - startedAt;
const elapsedSeconds = elapsedMs / 1000;
console.log(
  JSON.stringify(
    {
      mode,
      playerCount,
      games,
      warmupGames,
      completedGames,
      maxMovesPerGame,
      totalMoves,
      averageMovesPerGame: totalMoves / games,
      totalCandidates,
      averageCandidatesPerGame: totalCandidates / games,
      elapsedMs,
      gamesPerSecond: games / elapsedSeconds,
      movesPerSecond: totalMoves / elapsedSeconds,
      candidatesPerSecond:
        totalCandidates === 0 ? 0 : totalCandidates / elapsedSeconds,
      actionOptions,
    },
    null,
    2
  )
);

function runGame(
  gameIndex: number,
  seedPrefix: string,
  benchmarkMode: BenchmarkMode
): GameResult {
  const board = createTrainingBoard(
    playerCount,
    `${seedPrefix}:deal:${gameIndex}`
  );
  const random = createSeededRandom(`${seedPrefix}:rollout:${gameIndex}`);
  const activePlayerIndices = getActivePlayerIndices(board);
  const cooldowns = board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? random()
      : Number.POSITIVE_INFINITY
  );
  const hands = createSimulationHands(board);
  const policy =
    benchmarkMode === "neural"
      ? NeuralActionRankingPolicy.create({
          seed: `${seedPrefix}:policy`,
        })
      : null;

  let candidates = 0;
  let moves = 0;
  while (!isGameOver(board) && moves < maxMovesPerGame) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }

    const hand = getSimulationHand(hands, playerIndex);
    const move = chooseBenchmarkMove(
      board,
      playerIndex,
      hand,
      hands,
      benchmarkMode,
      policy,
      (count) => {
        candidates += count;
      }
    );

    if (move) {
      const result = executeMove(board, playerIndex, move, hand);
      applySimulationMoveResult(board, playerIndex, move, hand, result);
    }
    cooldowns[playerIndex] += getMoveDelay(move?.type, random);
    moves += 1;
  }

  return {
    completed: isGameOver(board),
    moves,
    candidates,
  };
}

function chooseBenchmarkMove(
  board: BoardState,
  playerIndex: number,
  hand: CursorState,
  hands: readonly CursorState[],
  benchmarkMode: BenchmarkMode,
  policy: NeuralActionRankingPolicy | null,
  recordCandidates: (count: number) => void
): Move | undefined {
  const currentDragMove = getCurrentAIDragMove(board, playerIndex, hand);
  if (currentDragMove) {
    return currentDragMove;
  }

  if (benchmarkMode === "fixed") {
    return getBasicAIMove(board, playerIndex, hand);
  }

  const candidates = enumerateActionRankingCandidates(board, playerIndex, {
    ...actionOptions,
    hands,
  });
  recordCandidates(candidates.length);

  if (benchmarkMode === "enumerate") {
    return getBasicAIMove(board, playerIndex, hand);
  }

  return policy?.chooseCandidate(candidates, { sample: false })?.move;
}

function getActivePlayerIndices(board: BoardState): number[] {
  const indices: number[] = [];
  for (let playerIndex = 0; playerIndex < board.players.length; playerIndex++) {
    if (!board.players[playerIndex].isSpectating) {
      indices.push(playerIndex);
    }
  }
  return indices;
}

function getNextPlayerIndex(
  cooldowns: number[],
  activePlayerIndices: readonly number[]
): number {
  let bestIndex = -1;
  for (const playerIndex of activePlayerIndices) {
    if (bestIndex < 0 || cooldowns[playerIndex] < cooldowns[bestIndex]) {
      bestIndex = playerIndex;
    }
  }
  return bestIndex;
}

function getMoveDelay(
  moveType: Move["type"] | undefined,
  random: () => number
): number {
  const jitter = 0.72 + random() * 0.56;
  if (moveType === "cycle" || moveType === "flip_deck") {
    return 0.34 * jitter;
  }
  if (moveType === "premove") {
    return 0.42 * jitter;
  }
  if (moveType === "wait") {
    return 0.55 * jitter;
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

function readModeEnv(name: string, fallback: BenchmarkMode): BenchmarkMode {
  const value = process.env[name];
  if (value === "fixed" || value === "neural" || value === "enumerate") {
    return value;
  }
  return fallback;
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === "") {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}
