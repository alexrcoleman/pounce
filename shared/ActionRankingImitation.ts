import { getBasicAIMove, getBasicAIMoveForStyle } from "./ComputerV1";
import deepClone from "./deepClone";
import { isGameOver, type BoardState } from "./GameUtils";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  getActionRankingMoveKey,
  getCurrentPointsFromCards,
  getPointDifferential,
  type ActionRankingCandidate,
} from "./ActionRankingPolicy";
import { executeMove, type Move } from "./MoveHandler";

export type ActionRankingImitationCandidate = {
  key: string;
  equivalenceKey: string;
  move: Move;
  features: number[];
  label: 0 | 1;
  immediatePointDelta: number;
  immediatePointDifferentialDelta: number;
  rolloutPointDifferential?: number;
  rolloutPointDifferentialReturn?: number;
  rolloutScore?: number;
  rolloutScoreReturn?: number;
  rolloutPounceProgressReturn?: number;
  rolloutObjectiveReturn?: number;
  endsRound: boolean;
};

export type ActionRankingImitationExample = {
  trialIndex: number;
  stepIndex: number;
  playerIndex: number;
  playerPointDifferential: number;
  finalPlayerPoints: number | null;
  finalPointDifferential: number | null;
  pointDifferentialReturn: number | null;
  teacherActionKey?: string | null;
  teacherPointDifferentialReturn?: number | null;
  teacherObjectiveReturn?: number | null;
  behaviorActionKey?: string | null;
  behaviorPointDifferentialReturn?: number | null;
  behaviorObjectiveReturn?: number | null;
  selectedActionKey: string | null;
  selectedCandidateIndex: number | null;
  candidates: ActionRankingImitationCandidate[];
};

export type ActionRankingImitationOptions = {
  maxTrials?: number;
  maxMovesPerTrial?: number;
  seed?: string;
  teacherStyleName?: string;
};

export type ActionRankingImitationDataset = {
  featureNames: readonly string[];
  examples: ActionRankingImitationExample[];
  summary: {
    trialCount: number;
    exampleCount: number;
    candidateCount: number;
    matchedTeacherMoveCount: number;
    unmatchedTeacherMoveCount: number;
  };
};

const DEFAULT_TRIALS = 1;
const DEFAULT_MAX_MOVES_PER_TRIAL = 1800;

export function collectActionRankingImitationDataset(
  startBoard: BoardState,
  options: ActionRankingImitationOptions = {}
): ActionRankingImitationDataset {
  const maxTrials = Math.max(1, Math.floor(options.maxTrials ?? DEFAULT_TRIALS));
  const maxMovesPerTrial = Math.max(
    1,
    Math.floor(options.maxMovesPerTrial ?? DEFAULT_MAX_MOVES_PER_TRIAL)
  );
  const seed = options.seed ?? getBoardSeed(startBoard);
  const examples: ActionRankingImitationExample[] = [];
  let matchedTeacherMoveCount = 0;
  let unmatchedTeacherMoveCount = 0;

  for (let trialIndex = 0; trialIndex < maxTrials; trialIndex++) {
    const result = collectActionRankingImitationTrial(
      startBoard,
      trialIndex,
      `${seed}:${trialIndex}`,
      maxMovesPerTrial,
      options.teacherStyleName
    );
    examples.push(...result.examples);
    matchedTeacherMoveCount += result.matchedTeacherMoveCount;
    unmatchedTeacherMoveCount += result.unmatchedTeacherMoveCount;
  }

  return {
    featureNames: ACTION_RANKING_FEATURE_NAMES,
    examples,
    summary: {
      trialCount: maxTrials,
      exampleCount: examples.length,
      candidateCount: examples.reduce(
        (sum, example) => sum + example.candidates.length,
        0
      ),
      matchedTeacherMoveCount,
      unmatchedTeacherMoveCount,
    },
  };
}

function collectActionRankingImitationTrial(
  startBoard: BoardState,
  trialIndex: number,
  seed: string,
  maxMoves: number,
  teacherStyleName: string | undefined
) {
  const random = createSeededRandom(seed);
  const board = deepClone(startBoard);
  const activePlayerIndices = board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);
  const cooldowns = board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? random()
      : Number.POSITIVE_INFINITY
  );
  const examples: ActionRankingImitationExample[] = [];
  let matchedTeacherMoveCount = 0;
  let unmatchedTeacherMoveCount = 0;

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
    let stepIndex = 0;
    !isGameOver(board) && stepIndex < maxMoves;
    stepIndex++
  ) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }

    const candidates = enumerateActionRankingCandidates(board, playerIndex);
    const teacherMove = teacherStyleName
      ? getBasicAIMoveForStyle(board, playerIndex, {}, teacherStyleName)
      : getBasicAIMove(board, playerIndex, {});
    const selectedActionKey = teacherMove
      ? getActionRankingMoveKey(teacherMove)
      : null;
    const selectedCandidateIndex =
      selectedActionKey == null
        ? null
        : candidates.findIndex(
            (candidate) => candidate.key === selectedActionKey
          );

    if (candidates.length > 0) {
      if (selectedCandidateIndex != null && selectedCandidateIndex >= 0) {
        matchedTeacherMoveCount += 1;
      } else if (selectedActionKey != null) {
        unmatchedTeacherMoveCount += 1;
      }

      examples.push(
        createImitationExample(
          board,
          trialIndex,
          stepIndex,
          playerIndex,
          selectedActionKey,
          selectedCandidateIndex,
          candidates
        )
      );
    }

    if (teacherMove) {
      executeMove(board, playerIndex, teacherMove);
    }
    cooldowns[playerIndex] += getMoveDelay(teacherMove?.type, random);
  }

  annotateFinalRewards(board, examples);

  return {
    examples,
    matchedTeacherMoveCount,
    unmatchedTeacherMoveCount,
  };
}

function createImitationExample(
  board: BoardState,
  trialIndex: number,
  stepIndex: number,
  playerIndex: number,
  selectedActionKey: string | null,
  selectedCandidateIndex: number | null,
  candidates: ActionRankingCandidate[]
): ActionRankingImitationExample {
  return {
    trialIndex,
    stepIndex,
    playerIndex,
    playerPointDifferential: getPointDifferential(board, playerIndex),
    finalPlayerPoints: null,
    finalPointDifferential: null,
    pointDifferentialReturn: null,
    selectedActionKey,
    selectedCandidateIndex,
    candidates: candidates.map((candidate) => ({
      key: candidate.key,
      equivalenceKey: candidate.equivalenceKey,
      move: candidate.move,
      features: candidate.features,
      label: candidate.key === selectedActionKey ? 1 : 0,
      immediatePointDelta: candidate.immediatePointDelta,
      immediatePointDifferentialDelta:
        candidate.immediatePointDifferentialDelta,
      endsRound: candidate.endsRound,
    })),
  };
}

function annotateFinalRewards(
  board: BoardState,
  examples: ActionRankingImitationExample[]
): void {
  const finalPoints = new Map<number, number>();
  const finalDifferentials = new Map<number, number>();

  board.players.forEach((player, playerIndex) => {
    if (player.isSpectating) {
      return;
    }
    finalPoints.set(playerIndex, getCurrentPointsFromCards(player));
    finalDifferentials.set(
      playerIndex,
      getPointDifferential(board, playerIndex)
    );
  });

  examples.forEach((example) => {
    const finalPlayerPoints = finalPoints.get(example.playerIndex);
    const finalPointDifferential = finalDifferentials.get(example.playerIndex);
    example.finalPlayerPoints = finalPlayerPoints ?? null;
    example.finalPointDifferential = finalPointDifferential ?? null;
    example.pointDifferentialReturn =
      finalPointDifferential == null
        ? null
        : finalPointDifferential - example.playerPointDifferential;
  });
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
