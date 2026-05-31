import fs from "fs";
import { getBasicAIMoveForStyle, getBasicAIStyleNames } from "../shared/ComputerV1";
import {
  enumerateActionRankingCandidates,
  getPointDifferential,
} from "../shared/ActionRankingPolicy";
import { createTrainingBoard } from "../shared/ActionRankingTraining";
import { isGameOver, type BoardState } from "../shared/GameUtils";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

type Participant =
  | {
      id: string;
      label: string;
      type: "style";
      styleName: string;
    }
  | {
      id: string;
      label: string;
      type: "model";
      modelPath: string;
      policy: NeuralActionRankingPolicy;
    };

type ParticipantResult = {
  participant: Participant;
  score: number;
  pointDifferential: number;
  scoreWinShare: number;
  soloScoreWin: number;
  pouncedOut: number;
  pounceRemaining: number;
  moveCount: number;
};

const playerCount = readIntegerEnv("PLAYERS", 3);
const gamesPerMatchup = readIntegerEnv("GAMES", 64);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const seatRotations = readBooleanEnv("SEAT_ROTATIONS", true);
const includeMatchups = readBooleanEnv("INCLUDE_MATCHUPS", false);
const quiet = readBooleanEnv("QUIET", true);
const seed = process.env.SEED ?? "action-ranking-tournament";
const participants = readParticipants();
const writeOutput = console.log.bind(console);
if (quiet) {
  console.log = () => {};
}

if (participants.length < playerCount) {
  throw new Error(
    `Need at least ${playerCount} participants, got ${participants.length}.`
  );
}

const matchups = combinations(participants, playerCount);
const results: ParticipantResult[] = [];
const matchupSummaries = matchups.map((matchup, matchupIndex) => {
  const matchupResults: ParticipantResult[] = [];
  for (let gameIndex = 0; gameIndex < gamesPerMatchup; gameIndex++) {
    const rotations = seatRotations ? playerCount : 1;
    for (let rotation = 0; rotation < rotations; rotation++) {
      const seatedParticipants = rotate(matchup, rotation);
      const board = createTrainingBoard(
        playerCount,
        `${seed}:matchup:${matchupIndex}:deal:${gameIndex}`
      );
      const gameResults = runGame(
        board,
        seatedParticipants,
        `${seed}:matchup:${matchupIndex}:game:${gameIndex}:rotation:${rotation}`
      );
      results.push(...gameResults);
      matchupResults.push(...gameResults);
    }
  }

  return {
    participants: matchup.map(describeParticipant),
    summary: summarizeResults(matchupResults),
  };
});

writeOutput(
  JSON.stringify(
    {
      options: {
        playerCount,
        gamesPerMatchup,
        seatRotations,
        rolloutsPerMatchup: gamesPerMatchup * (seatRotations ? playerCount : 1),
        totalRollouts:
          matchups.length * gamesPerMatchup * (seatRotations ? playerCount : 1),
        maxMovesPerGame,
        seed,
      },
      participants: participants.map(describeParticipant),
      overall: summarizeResults(results),
      matchups: includeMatchups ? matchupSummaries : undefined,
    },
    null,
    2
  )
);

function runGame(
  board: BoardState,
  seatedParticipants: readonly Participant[],
  gameSeed: string
): ParticipantResult[] {
  const random = createSeededRandom(gameSeed);
  const activePlayerIndices = board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);
  const cooldowns = board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? random()
      : Number.POSITIVE_INFINITY
  );
  const moveCounts = board.players.map(() => 0);

  for (
    let moveIndex = 0;
    !isGameOver(board) && moveIndex < maxMovesPerGame;
    moveIndex++
  ) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }
    const participant = seatedParticipants[playerIndex];
    const move = getParticipantMove(participant, board, playerIndex);
    const result = move ? executeMove(board, playerIndex, move) : null;
    if (result?.boardChanged) {
      moveCounts[playerIndex] += 1;
    }
    cooldowns[playerIndex] += getMoveDelay(move?.type, random);
  }

  const scores = seatedParticipants.map(
    (_, playerIndex) => board.players[playerIndex]?.currentPoints ?? 0
  );
  const bestScore = Math.max(...scores);
  const winnerCount = scores.filter((score) => score === bestScore).length;

  return seatedParticipants.map((participant, playerIndex) => ({
    participant,
    score: scores[playerIndex],
    pointDifferential: getPointDifferential(board, playerIndex),
    scoreWinShare: scores[playerIndex] === bestScore ? 1 / winnerCount : 0,
    soloScoreWin: scores[playerIndex] === bestScore && winnerCount === 1 ? 1 : 0,
    pouncedOut: board.players[playerIndex]?.pounceDeck.length === 0 ? 1 : 0,
    pounceRemaining: board.players[playerIndex]?.pounceDeck.length ?? 0,
    moveCount: moveCounts[playerIndex],
  }));
}

function getParticipantMove(
  participant: Participant,
  board: BoardState,
  playerIndex: number
): Move | undefined {
  if (participant.type === "style") {
    return getBasicAIMoveForStyle(board, playerIndex, {}, participant.styleName);
  }

  const candidates = enumerateActionRankingCandidates(board, playerIndex);
  return participant.policy.chooseCandidate(candidates)?.move;
}

function summarizeResults(results: readonly ParticipantResult[]) {
  const byParticipant = new Map<string, ParticipantResult[]>();
  results.forEach((result) => {
    const id = result.participant.id;
    byParticipant.set(id, [...(byParticipant.get(id) ?? []), result]);
  });

  return Array.from(byParticipant.entries())
    .map(([id, items]) => {
      const participant = items[0].participant;
      const scoreWins = items.map((item) => item.scoreWinShare);
      const score = items.map((item) => item.score);
      const pointDifferential = items.map((item) => item.pointDifferential);
      return {
        participant: describeParticipant(participant),
        appearances: items.length,
        scoreWinShare: mean(scoreWins),
        scoreWinShareStandardError: standardError(scoreWins),
        soloScoreWinRate: mean(items.map((item) => item.soloScoreWin)),
        pounceOutRate: mean(items.map((item) => item.pouncedOut)),
        averageScore: mean(score),
        averageScoreStandardError: standardError(score),
        averagePointDifferential: mean(pointDifferential),
        pointDifferentialStandardError: standardError(pointDifferential),
        averagePounceRemaining: mean(items.map((item) => item.pounceRemaining)),
        averageMoveCount: mean(items.map((item) => item.moveCount)),
        id,
      };
    })
    .sort(
      (a, b) =>
        b.scoreWinShare - a.scoreWinShare ||
        b.averagePointDifferential - a.averagePointDifferential ||
        a.participant.label.localeCompare(b.participant.label)
    );
}

function readParticipants(): Participant[] {
  const styleNames = readStyleListEnv("STYLES", getBasicAIStyleNames());
  const styles = styleNames.map((styleName) => ({
    id: `style:${styleName}`,
    label: styleName,
    type: "style" as const,
    styleName,
  }));
  return [...styles, ...readModelParticipants()];
}

function readModelParticipants(): Participant[] {
  const spec = process.env.MODEL_SPECS;
  if (!spec || spec.trim() === "") {
    return [];
  }

  return spec
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separatorIndex = entry.indexOf("=");
      const label =
        separatorIndex < 0 ? `model-${index + 1}` : entry.slice(0, separatorIndex);
      const modelPath = separatorIndex < 0 ? entry : entry.slice(separatorIndex + 1);
      const model = JSON.parse(
        fs.readFileSync(modelPath, "utf8")
      ) as NeuralActionRankingModel;
      return {
        id: `model:${label}`,
        label,
        type: "model" as const,
        modelPath,
        policy: new NeuralActionRankingPolicy(model),
      };
    });
}

function readStyleListEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }

  const byLowerName = new Map(
    getBasicAIStyleNames().map((style) => [style.toLowerCase(), style])
  );
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((style) => {
      const knownStyle = byLowerName.get(style.toLowerCase());
      if (!knownStyle) {
        throw new Error(
          `Unknown style "${style}". Known styles: ${getBasicAIStyleNames().join(
            ", "
          )}`
        );
      }
      return knownStyle;
    });
}

function describeParticipant(participant: Participant) {
  return {
    id: participant.id,
    label: participant.label,
    type: participant.type,
    styleName: participant.type === "style" ? participant.styleName : undefined,
    modelPath: participant.type === "model" ? participant.modelPath : undefined,
  };
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    return [[]];
  }
  if (size > items.length) {
    return [];
  }
  if (size === 1) {
    return items.map((item) => [item]);
  }

  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), size - 1).map((rest) => [item, ...rest])
  );
}

function rotate<T>(items: readonly T[], offset: number): T[] {
  return items.map((_, index) => items[(index + offset) % items.length]);
}

function getNextPlayerIndex(
  cooldowns: readonly number[],
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

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardError(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
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
