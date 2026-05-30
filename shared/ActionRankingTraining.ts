import { getBasicAIMove } from "./ComputerV1";
import deepClone from "./deepClone";
import {
  createBoard,
  dealPlayerHand,
  isGameOver,
  resetBoard,
  type BoardState,
  type CardState,
  type Suits,
  type Values,
} from "./GameUtils";
import {
  enumerateActionRankingCandidates,
  getCurrentPointsFromCards,
  getPointDifferential,
  type ActionRankingCandidate,
} from "./ActionRankingPolicy";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type ImitationTrainingStats,
  type NeuralActionRankingModel,
} from "./NeuralActionRankingPolicy";
import { executeMove, type Move } from "./MoveHandler";
import {
  collectActionRankingImitationDataset,
  type ActionRankingImitationExample,
} from "./ActionRankingImitation";

export type NeuralTrainingOptions = {
  playerCount?: number;
  hiddenSize?: number;
  seed?: string;
  imitationDeals?: number;
  imitationEpochs?: number;
  imitationLearningRate?: number;
  rlEpisodes?: number;
  rlLearningRate?: number;
  rlTemperature?: number;
  rlLocalRewardWeight?: number;
  maxMovesPerGame?: number;
};

export type NeuralTrainingResult = {
  model: NeuralActionRankingModel;
  imitation: {
    examples: number;
    candidates: number;
    matchedTeacherMoveCount: number;
    unmatchedTeacherMoveCount: number;
    stats: ImitationTrainingStats;
  };
  reinforcement: {
    episodes: number;
    averageFinalPointDifferential: number;
    averageTeacherBaselinePointDifferential: number;
    averageBaselineAdjustedReturn: number;
    averagePolicyUpdates: number;
  };
  evaluation: PolicyEvaluationResult;
};

export type PolicyEvaluationResult = {
  games: number;
  averageNeuralPointDifferential: number;
  averageTeacherBaselinePointDifferential: number;
  averageBaselineAdjustedPointDifferential: number;
  neuralWinRate: number;
  averageNeuralScore: number;
  averageTeacherScore: number;
};

type RolloutTransition = {
  playerIndex: number;
  pointDifferentialBefore: number;
  candidates: ActionRankingCandidate[];
  selectedCandidateIndex: number;
  localReward: number;
};

type RolloutResult = {
  finalScores: number[];
  finalPointDifferentials: number[];
  transitions: RolloutTransition[];
};

const SUITS: Suits[] = ["hearts", "spades", "diamonds", "clubs"];
const VALUES: Values[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const DEFAULT_MAX_MOVES_PER_GAME = 1800;

export function trainNeuralActionRankingPolicy(
  options: NeuralTrainingOptions = {}
): NeuralTrainingResult {
  const playerCount = options.playerCount ?? 4;
  const seed = options.seed ?? "action-ranking-training";
  const imitationDeals = options.imitationDeals ?? 24;
  const imitationEpochs = options.imitationEpochs ?? 4;
  const rlEpisodes = options.rlEpisodes ?? 32;
  const maxMovesPerGame = options.maxMovesPerGame ?? DEFAULT_MAX_MOVES_PER_GAME;
  const policy = NeuralActionRankingPolicy.create({
    hiddenSize: options.hiddenSize,
    seed,
  });

  const imitationExamples = collectImitationExamplesFromDeals({
    playerCount,
    dealCount: imitationDeals,
    seed: `${seed}:imitation`,
    maxMovesPerGame,
  });
  const imitationStats = policy.trainImitation(imitationExamples, {
    epochs: imitationEpochs,
    learningRate: options.imitationLearningRate,
    shuffleSeed: `${seed}:imitation-shuffle`,
  });

  const reinforcement = trainPolicyGradientFromRollouts(policy, {
    playerCount,
    episodes: rlEpisodes,
    seed: `${seed}:rl`,
    learningRate: options.rlLearningRate ?? 0.001,
    temperature: options.rlTemperature ?? 0.85,
    localRewardWeight: options.rlLocalRewardWeight ?? 0.15,
    maxMovesPerGame,
  });

  return {
    model: policy.getModel(),
    imitation: {
      examples: imitationExamples.length,
      candidates: imitationExamples.reduce(
        (sum, example) => sum + example.candidates.length,
        0
      ),
      matchedTeacherMoveCount: imitationExamples.filter(
        (example) =>
          example.selectedCandidateIndex != null &&
          example.selectedCandidateIndex >= 0
      ).length,
      unmatchedTeacherMoveCount: imitationExamples.filter(
        (example) =>
          example.selectedActionKey != null &&
          (example.selectedCandidateIndex == null ||
            example.selectedCandidateIndex < 0)
      ).length,
      stats: imitationStats,
    },
    reinforcement,
    evaluation: evaluateNeuralPolicy(policy, {
      playerCount,
      games: 12,
      seed: `${seed}:eval`,
      maxMovesPerGame,
    }),
  };
}

export function collectImitationExamplesFromDeals(options: {
  playerCount: number;
  dealCount: number;
  seed: string;
  maxMovesPerGame: number;
}): ActionRankingImitationExample[] {
  const examples: ActionRankingImitationExample[] = [];
  for (let dealIndex = 0; dealIndex < options.dealCount; dealIndex++) {
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${dealIndex}`
    );
    const dataset = collectActionRankingImitationDataset(board, {
      maxTrials: 1,
      maxMovesPerTrial: options.maxMovesPerGame,
      seed: `${options.seed}:rollout:${dealIndex}`,
    });
    examples.push(...dataset.examples);
  }
  return examples;
}

export function trainPolicyGradientFromRollouts(
  policy: NeuralActionRankingPolicy,
  options: {
    playerCount: number;
    episodes: number;
    seed: string;
    learningRate: number;
    temperature: number;
    localRewardWeight: number;
    maxMovesPerGame: number;
  }
) {
  let finalPointDifferentialTotal = 0;
  let teacherBaselinePointDifferentialTotal = 0;
  let baselineAdjustedReturnTotal = 0;
  let updateTotal = 0;

  for (let episode = 0; episode < options.episodes; episode++) {
    const neuralPlayerIndex = episode % options.playerCount;
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${episode}`
    );
    const teacherBaseline = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(`${options.seed}:baseline:${episode}`),
      temperature: 1,
      sample: false,
      maxMovesPerGame: options.maxMovesPerGame,
      neuralPlayerIndices: [],
    });
    const teacherBaselineDifferential =
      teacherBaseline.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const rollout = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(`${options.seed}:sample:${episode}`),
      temperature: options.temperature,
      sample: true,
      maxMovesPerGame: options.maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
    });
    const finalDifferential =
      rollout.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const baselineAdjustedReturn =
      finalDifferential - teacherBaselineDifferential;

    rollout.transitions.forEach((transition) => {
      const advantage =
        (baselineAdjustedReturn +
          options.localRewardWeight * transition.localReward) /
        20;
      policy.trainPolicyGradient(
        transition.candidates,
        transition.selectedCandidateIndex,
        advantage,
        options.learningRate,
        options.temperature
      );
      updateTotal += 1;
    });

    finalPointDifferentialTotal += finalDifferential;
    teacherBaselinePointDifferentialTotal += teacherBaselineDifferential;
    baselineAdjustedReturnTotal += baselineAdjustedReturn;
  }

  return {
    episodes: options.episodes,
    averageFinalPointDifferential:
      options.episodes === 0
        ? 0
        : finalPointDifferentialTotal / options.episodes,
    averageTeacherBaselinePointDifferential:
      options.episodes === 0
        ? 0
        : teacherBaselinePointDifferentialTotal / options.episodes,
    averageBaselineAdjustedReturn:
      options.episodes === 0
        ? 0
        : baselineAdjustedReturnTotal / options.episodes,
    averagePolicyUpdates:
      options.episodes === 0 ? 0 : updateTotal / options.episodes,
  };
}

export function evaluateNeuralPolicy(
  policy: NeuralActionRankingPolicy,
  options: {
    playerCount?: number;
    games?: number;
    seed?: string;
    maxMovesPerGame?: number;
  } = {}
): PolicyEvaluationResult {
  const playerCount = options.playerCount ?? 4;
  const games = options.games ?? 12;
  const seed = options.seed ?? "action-ranking-eval";
  const maxMovesPerGame = options.maxMovesPerGame ?? DEFAULT_MAX_MOVES_PER_GAME;
  let neuralDifferentialTotal = 0;
  let teacherBaselineDifferentialTotal = 0;
  let baselineAdjustedDifferentialTotal = 0;
  let neuralWins = 0;
  let neuralScoreTotal = 0;
  let teacherScoreTotal = 0;

  for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const neuralPlayerIndex = gameIndex % playerCount;
    const board = createTrainingBoard(playerCount, `${seed}:deal:${gameIndex}`);
    const teacherBaseline = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(`${seed}:baseline:${gameIndex}`),
      temperature: 1,
      sample: false,
      maxMovesPerGame,
      neuralPlayerIndices: [],
    });
    const random = createSeededRandom(`${seed}:sample:${gameIndex}`);
    const rollout = runPolicyRollout(board, {
      policy,
      random,
      temperature: 1,
      sample: false,
      maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
    });
    const neuralScore = rollout.finalScores[neuralPlayerIndex] ?? 0;
    const teacherScores = rollout.finalScores.filter(
      (_, playerIndex) => playerIndex !== neuralPlayerIndex
    );
    const averageTeacherScore =
      teacherScores.reduce((sum, value) => sum + value, 0) /
      Math.max(1, teacherScores.length);
    const neuralDifferential =
      rollout.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const teacherBaselineDifferential =
      teacherBaseline.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    neuralDifferentialTotal += neuralDifferential;
    teacherBaselineDifferentialTotal += teacherBaselineDifferential;
    baselineAdjustedDifferentialTotal +=
      neuralDifferential - teacherBaselineDifferential;
    neuralScoreTotal += neuralScore;
    teacherScoreTotal += averageTeacherScore;
    if (neuralScore > Math.max(...teacherScores)) {
      neuralWins += 1;
    }
  }

  return {
    games,
    averageNeuralPointDifferential:
      games === 0 ? 0 : neuralDifferentialTotal / games,
    averageTeacherBaselinePointDifferential:
      games === 0 ? 0 : teacherBaselineDifferentialTotal / games,
    averageBaselineAdjustedPointDifferential:
      games === 0 ? 0 : baselineAdjustedDifferentialTotal / games,
    neuralWinRate: games === 0 ? 0 : neuralWins / games,
    averageNeuralScore: games === 0 ? 0 : neuralScoreTotal / games,
    averageTeacherScore: games === 0 ? 0 : teacherScoreTotal / games,
  };
}

export function createTrainingBoard(playerCount: number, seed: string): BoardState {
  const board = createBoard(playerCount);
  const decks = Array.from({ length: playerCount }, (_, playerIndex) =>
    createShuffledDeck(playerIndex, `${seed}:player:${playerIndex}`)
  );
  resetBoard(board, decks);
  board.pileLocs = createDeterministicPileLocations(
    board.piles.length,
    `${seed}:piles`
  );
  board.players.forEach((_, playerIndex) => {
    dealPlayerHand(board, playerIndex);
  });
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.players.forEach((player) => {
    player.currentPoints = getCurrentPointsFromCards(player);
  });
  return board;
}

export function evaluateNeuralModel(
  model: NeuralActionRankingModel,
  options: {
    playerCount?: number;
    games?: number;
    seed?: string;
    maxMovesPerGame?: number;
  } = {}
): PolicyEvaluationResult {
  return evaluateNeuralPolicy(new NeuralActionRankingPolicy(model), options);
}

function runPolicyRollout(
  startBoard: BoardState,
  options: {
    policy: NeuralActionRankingPolicy;
    random: () => number;
    temperature: number;
    sample: boolean;
    maxMovesPerGame: number;
    neuralPlayerIndices?: number[];
  }
): RolloutResult {
  const board = deepClone(startBoard);
  const activePlayerIndices = board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);
  const neuralPlayers = new Set(
    options.neuralPlayerIndices ?? activePlayerIndices
  );
  const cooldowns = board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? options.random()
      : Number.POSITIVE_INFINITY
  );
  const transitions: RolloutTransition[] = [];

  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.players.forEach((player, playerIndex) => {
    if (activePlayerIndices.includes(playerIndex)) {
      player.socketId = null;
    }
  });

  for (
    let moveCount = 0;
    !isGameOver(board) && moveCount < options.maxMovesPerGame;
    moveCount++
  ) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }

    const move = neuralPlayers.has(playerIndex)
      ? chooseNeuralMove(board, playerIndex, options, transitions)
      : getBasicAIMove(board, playerIndex, {});

    if (move) {
      executeMove(board, playerIndex, move);
    }
    cooldowns[playerIndex] += getMoveDelay(move?.type, options.random);
  }

  const finalScores = board.players.map(getCurrentPointsFromCards);
  const finalPointDifferentials = board.players.map((_, playerIndex) =>
    getPointDifferential(board, playerIndex)
  );
  return { finalScores, finalPointDifferentials, transitions };
}

function chooseNeuralMove(
  board: BoardState,
  playerIndex: number,
  options: {
    policy: NeuralActionRankingPolicy;
    random: () => number;
    temperature: number;
    sample: boolean;
  },
  transitions: RolloutTransition[]
): Move | undefined {
  const candidates = enumerateActionRankingCandidates(board, playerIndex);
  if (candidates.length === 0) {
    return;
  }

  const pointDifferentialBefore = getPointDifferential(board, playerIndex);
  const selected = options.policy.chooseCandidate(candidates, {
    temperature: options.temperature,
    random: options.random,
    sample: options.sample,
  });
  if (!selected) {
    return;
  }

  const selectedCandidateIndex = candidates.findIndex(
    (candidate) => candidate.key === selected.key
  );
  if (selectedCandidateIndex >= 0 && options.sample) {
    transitions.push({
      playerIndex,
      pointDifferentialBefore,
      candidates,
      selectedCandidateIndex,
      localReward: selected.immediatePointDifferentialDelta,
    });
  }
  return selected.move;
}

function createShuffledDeck(player: number, seed: string): CardState[] {
  const random = createSeededRandom(seed);
  const deck = SUITS.flatMap((suit) =>
    VALUES.map((value) => ({ suit, value, player }))
  );
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function createDeterministicPileLocations(
  count: number,
  seed: string
): [number, number, number][] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / Math.max(1, count);
    const ring = 0.28 + 0.2 * (index % 2);
    const jitter = 0.04;
    return [
      clamp01(0.5 + Math.cos(angle) * ring + (random() - 0.5) * jitter),
      clamp01(0.5 + Math.sin(angle) * ring + (random() - 0.5) * jitter),
      random(),
    ];
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
