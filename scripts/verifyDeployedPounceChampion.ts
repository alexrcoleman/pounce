import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AI_LEVEL, MAX_AI_LEVEL, getAISpeedMultiplier } from "../shared/AIDifficulty";
import { enumerateActionRankingCandidates, getCurrentPointsFromCards } from "../shared/ActionRankingPolicy";
import { createTrainingBoard } from "../shared/ActionRankingTraining";
import { isGameOver, type BoardState } from "../shared/GameUtils";
import { NeuralActionRankingPolicy, createSeededRandom, type NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";
import { getReactionDelay, tickRoom } from "../shared/RoomLogic";
import deepClone from "../shared/deepClone";
import { pounceChampionModel } from "../shared/pounceChampion/champion";

// These CommonJS exports are patched only in this offline process. The game
// loop, champion selector, and actual legacy bot selector all run unmodified.
const bot = require("../shared/NeuralActionRankingBot") as typeof import("../shared/NeuralActionRankingBot");
const roomState = require("../shared/RoomState") as typeof import("../shared/RoomState");
const movement = require("../shared/MoveHandler") as typeof import("../shared/MoveHandler");

type RoundResult = {
  scores: number[];
  margin: number;
  completed: boolean;
  attemptedMoves: number;
  noActionPauses: number;
};
type DealResult = { index: number; rounds: RoundResult[] };
type Archive = {
  seed: string;
  players: number;
  aiLevel: number;
  delayed: boolean;
  roundTick: boolean;
  maxTicks: number;
  candidatePath: string;
  baselinePath: string;
  baselineUsesReviewer: boolean;
  mode?: string;
  baselineMode?: string;
  forecast: string;
  modelSha256: { candidate: string; baseline: string };
  rows: DealResult[];
};

const archivePath = process.env.POUNCE_CHAMPION_ARCHIVE;
const archive = archivePath && JSON.parse(fs.readFileSync(archivePath, "utf8")) as Archive;
const deals = Number(process.env.DEALS ?? (archive ? 24 : 128));
const firstDeal = Number(process.env.FIRST_DEAL ?? (archive ? archive.rows[0].index : 0));
const aiLevel = archive ? archive.aiLevel : Number(process.env.AI_LEVEL ?? DEFAULT_AI_LEVEL);
const seed = archive ? archive.seed : process.env.SEED ?? "pounce-deployment-vs-live-v1";
const maxTicks = archive ? archive.maxTicks : Number(process.env.MAX_ROOM_TICKS ?? 16000);
assert.ok(Number.isInteger(deals) && deals > 0 && Number.isInteger(firstDeal) && firstDeal >= 0);
assert.ok(Number.isInteger(aiLevel) && aiLevel >= 1 && aiLevel <= MAX_AI_LEVEL);
assert.ok(Number.isInteger(maxTicks) && maxTicks > 0);

let raw: NeuralActionRankingPolicy | undefined;
if (archive && archivePath) {
  assert.ok(archive.players === 4 && archive.delayed && !archive.roundTick && !archive.baselineUsesReviewer &&
    !archive.mode && !archive.baselineMode && !archive.forecast && archive.baselinePath === archive.candidatePath);
  const rawPath = process.env.POUNCE_CHAMPION_ARCHIVE_MODEL ??
    path.join(path.dirname(archivePath), path.basename(archive.baselinePath));
  const bytes = fs.readFileSync(rawPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.deepEqual(archive.modelSha256, { candidate: sha256, baseline: sha256 });
  const rawModel: NeuralActionRankingModel = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(rawModel, pounceChampionModel, "The raw scorer bundled with the champion differs from the archived scorer");
  raw = new NeuralActionRankingPolicy(rawModel);
}

const archivedDeals = new Map(archive ? archive.rows.map((row) => [row.index, row]) : []);
const rows: DealResult[] = [];
for (let index = firstDeal; index < firstDeal + deals; index++) {
  const expected = archivedDeals.get(index);
  if (archive) assert.ok(expected?.rounds.length === 2, `Missing archived result for deal ${index}`);
  const deal = createTrainingBoard(4, `${seed}:deal:${index}`);
  const timingSeed = `${seed}:timing:${index}`;
  const rounds = [0, 1].map((parity) => {
    const result = runRound(deal, timingSeed, parity, raw);
    if (expected) {
      assert.deepEqual(result, expected.rounds[parity], `Production round differs at deal ${index}, rotation ${parity}`);
    }
    return result;
  });
  rows.push({ index, rounds });
  if (rows.length % 16 === 0 || rows.length === deals) console.error(`${rows.length}/${deals} deals`);
}

const pointMargins = rows.map(({ rounds }) => mean(rounds.map(({ margin }) => margin)));
const wins = rows.map(({ rounds }) => mean(rounds.map(({ scores }, parity) => {
  const best = Math.max(...scores);
  const seats = scores.map((score, seat) => score === best ? seat : -1).filter((seat) => seat >= 0);
  return seats.filter((seat) => seat % 2 === parity).length / seats.length;
})));
const report = {
  seed,
  aiLevel,
  deals,
  firstDeal,
  rounds: deals * 2,
  comparator: archive ? "archived raw scorer" : "previous production bot",
  archiveParity: archive ? deals * 2 : undefined,
  completionRate: mean(rows.flatMap(({ rounds }) => rounds.map(({ completed }) => Number(completed)))),
  pointMargin: estimate(pointMargins, `${seed}:${firstDeal}:points`),
  winShare: estimate(wins, `${seed}:${firstDeal}:wins`),
};
if (process.env.OUT) {
  fs.writeFileSync(process.env.OUT, JSON.stringify({ ...report, rows }, null, 2) + "\n", { flag: "wx" });
}
console.log(JSON.stringify(report, null, 2));

function runRound(deal: BoardState, timingSeed: string, parity: number, rawOpponent?: NeuralActionRankingPolicy): RoundResult {
  const room = roomState.createRoomState(deal.players.length);
  room.board = deepClone(deal);
  room.board.isActive = true;
  room.board.isDealt = true;
  room.board.isPaused = false;
  room.board.roundStartsAt = undefined;
  room.board.players.forEach((player) => { player.socketId = null; });
  room.aiBoard = deepClone(room.board);
  room.settings.aiMode = "trained";
  room.settings.aiSpeed = aiLevel;
  room.aiSpeed = getAISpeedMultiplier(aiLevel);
  const randomness = room.board.players.map((_, seat) => createSeededRandom(`${timingSeed}:player:${seat}`));
  const defaultRandom = createSeededRandom(timingSeed);
  room.aiCooldowns = randomness.map((random) => 10_000 + random());

  const memory = room.board.players.map(() => rawOpponent?.createInitialMemoryState() ?? []);
  const pending: { time: number; board: BoardState }[] = [];
  const previousChoose = bot.getConfiguredAIMove;
  const previousResolveMode = roomState.getAIPlayerResolvedMode;
  const previousExecute = movement.executeMove;
  const previousRandom = Math.random;
  let actingPlayer = -1;
  let attemptedMoves = 0;
  let noActionPauses = 0;
  const candidateSeats = new Set<number>();

  try {
    roomState.getAIPlayerResolvedMode = (board, seat, mode) =>
      seat % 2 === parity ? previousResolveMode(board, seat, mode) : "fixed";
    bot.getConfiguredAIMove = (...args) => {
      const [board, seat, cursor, hands] = args;
      if (seat % 2 === parity) {
        assert.ok(args.at(5), `Seat ${seat} did not enter the production champion path`);
        candidateSeats.add(seat);
        return previousChoose(...args);
      }
      assert.equal(args.at(5), undefined, `Comparator seat ${seat} entered the champion path`);
      if (rawOpponent) {
        const candidates = enumerateActionRankingCandidates(board, seat, {
          hands, includeWait: true, includePremove: true, includeFlipDeck: true,
        });
        const choice = rawOpponent.chooseCandidateWithMemory(candidates, memory[seat]);
        if (choice) {
          memory[seat] = choice.memoryState;
          return choice.candidate.move;
        }
        return previousChoose(...args);
      }
      // The previous deployed room passed the delayed clone as the memory key.
      return bot.getNeuralAIMove(board, seat, cursor, hands) ?? previousChoose(...args);
    };
    movement.executeMove = (...args) => {
      if (args[3]) {
        actingPlayer = args[1];
        attemptedMoves++;
      }
      return previousExecute(...args);
    };
    Math.random = () => (randomness[actingPlayer] ?? defaultRandom)();

    for (let tick = 0; tick < maxTicks && !isGameOver(room.board); tick++) {
      const now = Math.min(...room.aiCooldowns);
      if (!Number.isFinite(now)) break;
      while (pending.length && pending[0].time <= now) room.aiBoard = pending.shift()!.board;
      const due = room.aiCooldowns.filter((cooldown) => cooldown <= now).length;
      const before = attemptedMoves;
      const result = tickRoom(room, now);
      noActionPauses += due - (attemptedMoves - before);
      if (result.hasUpdate || result.actions.length) {
        room.revision += Math.max(1, result.actions.length);
        pending.push({ time: now + getReactionDelay(room), board: deepClone(room.board) });
      }
    }
  } finally {
    bot.getConfiguredAIMove = previousChoose;
    roomState.getAIPlayerResolvedMode = previousResolveMode;
    movement.executeMove = previousExecute;
    Math.random = previousRandom;
  }

  assert.equal(candidateSeats.size, 2);
  const scores = room.board.players.map(getCurrentPointsFromCards);
  const margin = scores.reduce((sum, score, seat) => sum + (seat % 2 === parity ? score : -score), 0) / 2;
  return { scores, margin, completed: isGameOver(room.board), attemptedMoves, noActionPauses };
}

function estimate(samples: readonly number[], seed: string) {
  const random = createSeededRandom(seed);
  const bootstrap = Array.from({ length: 10_000 }, () =>
    mean(samples.map(() => samples[Math.floor(random() * samples.length)])))
    .sort((left, right) => left - right);
  return { mean: mean(samples), ci95: [bootstrap[249], bootstrap[9749]] };
}

function mean(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
