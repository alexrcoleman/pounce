import { getBasicAIMoveForStyle, getBasicAIStyleNames } from "../shared/ComputerV1";
import { getPointDifferential } from "../shared/ActionRankingPolicy";
import { createTrainingBoard } from "../shared/ActionRankingTraining";
import { isGameOver, type BoardState } from "../shared/GameUtils";
import { createSeededRandom } from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

type StyleResult = {
  styleName: string;
  score: number;
  pointDifferential: number;
  scoreWinShare: number;
  pouncedOut: number;
  pounceRemaining: number;
  moveCount: number;
};

const styleA = readStyleEnv("STYLE_A", "Alex 75%");
const styleB = readStyleEnv("STYLE_B", "Alex 66%");
const opponents = readStyleListEnv("OPPONENTS", ["Mom"]);
const participants = [styleA, styleB, ...opponents];
const games = readIntegerEnv("GAMES", 8192);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const seatRotations = readBooleanEnv("SEAT_ROTATIONS", true);
const seed = process.env.SEED ?? "basic-ai-style-compare";
const quiet = readBooleanEnv("QUIET", true);
const writeOutput = console.log.bind(console);

if (quiet) {
  console.log = () => {};
}
if (styleA === styleB) {
  throw new Error("STYLE_A and STYLE_B must be different.");
}
if (new Set(participants).size !== participants.length) {
  throw new Error("STYLE_A, STYLE_B, and OPPONENTS must be unique.");
}

const rotationsPerDeal = seatRotations ? participants.length : 1;
const scoreWinShareA: number[] = [];
const scoreWinShareB: number[] = [];
const scoreWinShareDelta: number[] = [];
const scoreA: number[] = [];
const scoreB: number[] = [];
const scoreDelta: number[] = [];
const pointDifferentialA: number[] = [];
const pointDifferentialB: number[] = [];
const pointDifferentialDelta: number[] = [];
const headToHeadScoreShareA: number[] = [];
const headToHeadScoreWinA: number[] = [];
const headToHeadScoreWinB: number[] = [];
const headToHeadScoreWinDelta: number[] = [];
const headToHeadScoreTie: number[] = [];
const pointDifferentialBetterA: number[] = [];
const pointDifferentialBetterB: number[] = [];
const pointDifferentialBetterDelta: number[] = [];
const pointDifferentialTie: number[] = [];
const pounceOutA: number[] = [];
const pounceOutB: number[] = [];
const pounceRemainingA: number[] = [];
const pounceRemainingB: number[] = [];
const moveCountA: number[] = [];
const moveCountB: number[] = [];

for (let gameIndex = 0; gameIndex < games; gameIndex++) {
  const dealScoreWinShareA: number[] = [];
  const dealScoreWinShareB: number[] = [];
  const dealScoreA: number[] = [];
  const dealScoreB: number[] = [];
  const dealPointDifferentialA: number[] = [];
  const dealPointDifferentialB: number[] = [];
  const dealHeadToHeadScoreShareA: number[] = [];
  const dealHeadToHeadScoreWinA: number[] = [];
  const dealHeadToHeadScoreWinB: number[] = [];
  const dealHeadToHeadScoreTie: number[] = [];
  const dealPointDifferentialBetterA: number[] = [];
  const dealPointDifferentialBetterB: number[] = [];
  const dealPointDifferentialTie: number[] = [];
  const dealPounceOutA: number[] = [];
  const dealPounceOutB: number[] = [];
  const dealPounceRemainingA: number[] = [];
  const dealPounceRemainingB: number[] = [];
  const dealMoveCountA: number[] = [];
  const dealMoveCountB: number[] = [];

  for (let rotation = 0; rotation < rotationsPerDeal; rotation++) {
    const seatedParticipants = rotate(participants, rotation);
    const board = createTrainingBoard(
      participants.length,
      `${seed}:deal:${gameIndex}`
    );
    const results = runGame(
      board,
      seatedParticipants,
      `${seed}:game:${gameIndex}:rotation:${rotation}`
    );
    const resultA = getStyleResult(results, styleA);
    const resultB = getStyleResult(results, styleB);

    dealScoreWinShareA.push(resultA.scoreWinShare);
    dealScoreWinShareB.push(resultB.scoreWinShare);
    dealScoreA.push(resultA.score);
    dealScoreB.push(resultB.score);
    dealPointDifferentialA.push(resultA.pointDifferential);
    dealPointDifferentialB.push(resultB.pointDifferential);
    dealHeadToHeadScoreShareA.push(
      resultA.score > resultB.score
        ? 1
        : resultA.score === resultB.score
          ? 0.5
          : 0
    );
    dealHeadToHeadScoreWinA.push(resultA.score > resultB.score ? 1 : 0);
    dealHeadToHeadScoreWinB.push(resultB.score > resultA.score ? 1 : 0);
    dealHeadToHeadScoreTie.push(resultA.score === resultB.score ? 1 : 0);
    dealPointDifferentialBetterA.push(
      resultA.pointDifferential > resultB.pointDifferential ? 1 : 0
    );
    dealPointDifferentialBetterB.push(
      resultB.pointDifferential > resultA.pointDifferential ? 1 : 0
    );
    dealPointDifferentialTie.push(
      resultA.pointDifferential === resultB.pointDifferential ? 1 : 0
    );
    dealPounceOutA.push(resultA.pouncedOut);
    dealPounceOutB.push(resultB.pouncedOut);
    dealPounceRemainingA.push(resultA.pounceRemaining);
    dealPounceRemainingB.push(resultB.pounceRemaining);
    dealMoveCountA.push(resultA.moveCount);
    dealMoveCountB.push(resultB.moveCount);
  }

  const dealScoreWinShareAverageA = mean(dealScoreWinShareA);
  const dealScoreWinShareAverageB = mean(dealScoreWinShareB);
  const dealScoreAverageA = mean(dealScoreA);
  const dealScoreAverageB = mean(dealScoreB);
  const dealPointDifferentialAverageA = mean(dealPointDifferentialA);
  const dealPointDifferentialAverageB = mean(dealPointDifferentialB);

  scoreWinShareA.push(dealScoreWinShareAverageA);
  scoreWinShareB.push(dealScoreWinShareAverageB);
  scoreWinShareDelta.push(
    dealScoreWinShareAverageA - dealScoreWinShareAverageB
  );
  scoreA.push(dealScoreAverageA);
  scoreB.push(dealScoreAverageB);
  scoreDelta.push(dealScoreAverageA - dealScoreAverageB);
  pointDifferentialA.push(dealPointDifferentialAverageA);
  pointDifferentialB.push(dealPointDifferentialAverageB);
  pointDifferentialDelta.push(
    dealPointDifferentialAverageA - dealPointDifferentialAverageB
  );
  headToHeadScoreShareA.push(mean(dealHeadToHeadScoreShareA));
  const dealHeadToHeadScoreWinAverageA = mean(dealHeadToHeadScoreWinA);
  const dealHeadToHeadScoreWinAverageB = mean(dealHeadToHeadScoreWinB);
  headToHeadScoreWinA.push(dealHeadToHeadScoreWinAverageA);
  headToHeadScoreWinB.push(dealHeadToHeadScoreWinAverageB);
  headToHeadScoreWinDelta.push(
    dealHeadToHeadScoreWinAverageA - dealHeadToHeadScoreWinAverageB
  );
  headToHeadScoreTie.push(mean(dealHeadToHeadScoreTie));
  const dealPointDifferentialBetterAverageA = mean(
    dealPointDifferentialBetterA
  );
  const dealPointDifferentialBetterAverageB = mean(
    dealPointDifferentialBetterB
  );
  pointDifferentialBetterA.push(dealPointDifferentialBetterAverageA);
  pointDifferentialBetterB.push(dealPointDifferentialBetterAverageB);
  pointDifferentialBetterDelta.push(
    dealPointDifferentialBetterAverageA - dealPointDifferentialBetterAverageB
  );
  pointDifferentialTie.push(mean(dealPointDifferentialTie));
  pounceOutA.push(mean(dealPounceOutA));
  pounceOutB.push(mean(dealPounceOutB));
  pounceRemainingA.push(mean(dealPounceRemainingA));
  pounceRemainingB.push(mean(dealPounceRemainingB));
  moveCountA.push(mean(dealMoveCountA));
  moveCountB.push(mean(dealMoveCountB));
}

writeOutput(
  JSON.stringify(
    {
      options: {
        styleA,
        styleB,
        opponents,
        games,
        seatRotations,
        rotationsPerDeal,
        totalRollouts: games * rotationsPerDeal,
        maxMovesPerGame,
        seed,
      },
      styleA: summarizeStyle({
        scoreWinShare: scoreWinShareA,
        score: scoreA,
        pointDifferential: pointDifferentialA,
        pounceOut: pounceOutA,
        pounceRemaining: pounceRemainingA,
        moveCount: moveCountA,
      }),
      styleB: summarizeStyle({
        scoreWinShare: scoreWinShareB,
        score: scoreB,
        pointDifferential: pointDifferentialB,
        pounceOut: pounceOutB,
        pounceRemaining: pounceRemainingB,
        moveCount: moveCountB,
      }),
      comparison: {
        scoreWinShareDelta: summarize(scoreWinShareDelta),
        scoreDelta: summarize(scoreDelta),
        pointDifferentialDelta: summarize(pointDifferentialDelta),
        headToHeadScoreShareA: summarize(headToHeadScoreShareA),
        headToHeadScoreWinRateA: summarize(headToHeadScoreWinA),
        headToHeadScoreWinRateB: summarize(headToHeadScoreWinB),
        headToHeadScoreWinRateDelta: summarize(headToHeadScoreWinDelta),
        headToHeadScoreTieRate: summarize(headToHeadScoreTie),
        pointDifferentialBetterRateA: summarize(pointDifferentialBetterA),
        pointDifferentialBetterRateB: summarize(pointDifferentialBetterB),
        pointDifferentialBetterRateDelta: summarize(
          pointDifferentialBetterDelta
        ),
        pointDifferentialTieRate: summarize(pointDifferentialTie),
      },
    },
    null,
    2
  )
);

function runGame(
  board: BoardState,
  seatedParticipants: readonly string[],
  gameSeed: string
): StyleResult[] {
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
    const styleName = seatedParticipants[playerIndex];
    const move = getBasicAIMoveForStyle(board, playerIndex, {}, styleName);
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

  return seatedParticipants.map((styleName, playerIndex) => ({
    styleName,
    score: scores[playerIndex],
    pointDifferential: getPointDifferential(board, playerIndex),
    scoreWinShare: scores[playerIndex] === bestScore ? 1 / winnerCount : 0,
    pouncedOut: board.players[playerIndex]?.pounceDeck.length === 0 ? 1 : 0,
    pounceRemaining: board.players[playerIndex]?.pounceDeck.length ?? 0,
    moveCount: moveCounts[playerIndex],
  }));
}

function getStyleResult(
  results: readonly StyleResult[],
  styleName: string
): StyleResult {
  const result = results.find((item) => item.styleName === styleName);
  if (!result) {
    throw new Error(`Missing style result for ${styleName}.`);
  }
  return result;
}

function summarizeStyle(values: {
  scoreWinShare: readonly number[];
  score: readonly number[];
  pointDifferential: readonly number[];
  pounceOut: readonly number[];
  pounceRemaining: readonly number[];
  moveCount: readonly number[];
}) {
  return {
    scoreWinShare: summarize(values.scoreWinShare),
    score: summarize(values.score),
    pointDifferential: summarize(values.pointDifferential),
    pounceOutRate: summarize(values.pounceOut),
    pounceRemaining: summarize(values.pounceRemaining),
    moveCount: summarize(values.moveCount),
  };
}

function summarize(values: readonly number[]) {
  const average = mean(values);
  const standardErrorValue = standardError(values);
  const confidenceInterval95 = 1.96 * standardErrorValue;
  return {
    average,
    standardError: standardErrorValue,
    confidenceInterval95,
    lower95: average - confidenceInterval95,
    upper95: average + confidenceInterval95,
  };
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

function rotate<T>(items: readonly T[], offset: number): T[] {
  return items.map((_, index) => items[(index + offset) % items.length]);
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

function readStyleEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return normalizeStyleName(value && value.length > 0 ? value : fallback);
}

function readStyleListEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback.map(normalizeStyleName);
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeStyleName);
}

function normalizeStyleName(styleName: string): string {
  const knownStyle = getBasicAIStyleNames().find(
    (style) => style.toLowerCase() === styleName.toLowerCase()
  );
  if (!knownStyle) {
    throw new Error(
      `Unknown style "${styleName}". Known styles: ${getBasicAIStyleNames().join(
        ", "
      )}`
    );
  }
  return knownStyle;
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
