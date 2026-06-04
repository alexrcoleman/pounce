import fs from "fs";
import path from "path";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  getCurrentPointsFromCards,
  getPointDifferential,
  type ActionRankingCandidate,
  type ActionRankingFeatureName,
} from "../shared/ActionRankingPolicy";
import { createBoard, type BoardState, type CardState } from "../shared/GameUtils";
import {
  NeuralActionRankingPolicy,
  type ActionRankingPrediction,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove } from "../shared/MoveHandler";
import deepClone from "../shared/deepClone";

type ScenarioConfig = {
  name: string;
  note: string;
  heartsCenterValue: CardState["value"];
  clubsCenterValue: CardState["value"];
  fourthStack?: CardState;
  pounceTop?: CardState;
  opponentPounceTop?: CardState;
};

const PLAYER_INDEX = 0;
const FEATURE_NAMES: ActionRankingFeatureName[] = [
  "move.c2c",
  "move.s2s",
  "source.solitaire",
  "dest.center",
  "dest.solitaire",
  "dest.isEmpty",
  "card.value",
  "card.canPlaySoon",
  "card.centerDistance",
  "own.emptyStackCount",
  "move.immediatePointDelta",
  "move.immediatePointDifferentialDelta",
  "solitaire.makesPouncePlayable",
  "solitaire.movesFullStack",
  "solitaire.postTopConnectorCount",
  "solitaire.postTopConnectorCloseness",
  "solitaire.postTopConnectsStackRoot",
  "solitaire.sourceCenterLowerDistance",
  "solitaire.destTopCenterLowerDistance",
];

const SCENARIOS: ScenarioConfig[] = [
  {
    name: "far_clubs_no_empty",
    note:
      "JC, QH, and KC are separate solitaire piles; QH is playable on JH, while clubs are far away on AC.",
    heartsCenterValue: 11,
    clubsCenterValue: 1,
    fourthStack: card("spades", 9, PLAYER_INDEX),
  },
  {
    name: "far_clubs_with_empty",
    note:
      "Same visible chain, but the fourth solitaire slot is already empty.",
    heartsCenterValue: 11,
    clubsCenterValue: 1,
  },
  {
    name: "mid_clubs_no_empty",
    note:
      "Same visible chain with clubs closer to playability, but still not immediately playable.",
    heartsCenterValue: 11,
    clubsCenterValue: 6,
    fourthStack: card("spades", 9, PLAYER_INDEX),
  },
  {
    name: "close_clubs_no_empty",
    note:
      "Same visible chain with JC also playable, testing whether the policy still prefers immediate center plays.",
    heartsCenterValue: 11,
    clubsCenterValue: 10,
    fourthStack: card("spades", 9, PLAYER_INDEX),
  },
  {
    name: "qh_soon_not_now",
    note:
      "The chain is available, but QH is only near the center pile rather than immediately playable.",
    heartsCenterValue: 10,
    clubsCenterValue: 1,
    fourthStack: card("spades", 9, PLAYER_INDEX),
  },
  {
    name: "opponent_pressure_far_clubs",
    note:
      "The base tension with an opponent showing a last pounce card that can play soon.",
    heartsCenterValue: 11,
    clubsCenterValue: 1,
    fourthStack: card("spades", 9, PLAYER_INDEX),
    opponentPounceTop: card("spades", 2, 1),
  },
];

const modelPaths = getModelPaths();
const results = modelPaths.map((modelPath) => {
  const policy = new NeuralActionRankingPolicy(readModel(modelPath));
  return {
    model: path.basename(modelPath),
    modelPath,
    scenarios: SCENARIOS.map((scenario) =>
      summarizeScenario(policy, scenario)
    ),
  };
});

console.log(JSON.stringify({ models: results }, null, 2));

function summarizeScenario(
  policy: NeuralActionRankingPolicy,
  scenario: ScenarioConfig
) {
  const board = createScenarioBoard(scenario);
  const candidates = enumerateCandidates(board);
  const ranked = policy.rankCandidates(candidates);

  return {
    name: scenario.name,
    note: scenario.note,
    scoreBefore: getCurrentPointsFromCards(board.players[PLAYER_INDEX]),
    pointDifferentialBefore: getPointDifferential(board, PLAYER_INDEX),
    candidateCount: candidates.length,
    topCandidates: ranked
      .slice(0, 8)
      .map((prediction) => describePrediction(prediction, ranked)),
    watchedMoves: {
      playQhToCenter: describeKey(ranked, "c2c:solitaire:1:0"),
      qhOntoKc: describeKey(ranked, "s2s:1:2:1"),
      jcOntoQh: describeKey(ranked, "s2s:0:1:1"),
      kcToEmpty: describeKey(ranked, "s2s:2:3:1"),
    },
    forcedLines: {
      qhOntoKcFirst: summarizeForcedLine(
        policy,
        board,
        "s2s:1:2:1",
        "s2s:0:2:1"
      ),
      jcOntoQhFirst: summarizeForcedLine(
        policy,
        board,
        "s2s:0:1:1",
        "s2s:1:2:2"
      ),
    },
  };
}

function summarizeForcedLine(
  policy: NeuralActionRankingPolicy,
  board: BoardState,
  firstKey: string,
  secondKey: string
) {
  const firstCandidates = enumerateCandidates(board);
  const first = firstCandidates.find((candidate) => candidate.key === firstKey);
  if (!first) {
    return null;
  }

  const nextBoard = deepClone(board);
  const result = executeMove(nextBoard, PLAYER_INDEX, first.move);
  if (!result) {
    return null;
  }

  const rankedAfter = policy.rankCandidates(enumerateCandidates(nextBoard));
  return {
    firstMove: describeCandidate(first),
    topAfterFirst: rankedAfter[0]
      ? describePrediction(rankedAfter[0], rankedAfter)
      : null,
    chainSecondMove: describeKey(rankedAfter, secondKey),
  };
}

function describeKey(
  ranked: readonly ActionRankingPrediction[],
  key: string
) {
  const prediction = ranked.find((item) => item.candidate.key === key);
  return prediction ? describePrediction(prediction, ranked) : null;
}

function describePrediction(
  prediction: ActionRankingPrediction,
  ranked: readonly ActionRankingPrediction[]
) {
  return {
    rank:
      ranked.findIndex((item) => item.candidate.key === prediction.candidate.key) +
      1,
    score: round(prediction.score),
    probability: round(prediction.probability),
    ...describeCandidate(prediction.candidate),
  };
}

function describeCandidate(candidate: ActionRankingCandidate) {
  return {
    key: candidate.key,
    move: candidate.move,
    immediatePointDelta: candidate.immediatePointDelta,
    immediatePointDifferentialDelta: candidate.immediatePointDifferentialDelta,
    features: Object.fromEntries(
      FEATURE_NAMES.map((featureName) => [
        featureName,
        getFeature(candidate, featureName),
      ])
    ),
  };
}

function enumerateCandidates(board: BoardState): ActionRankingCandidate[] {
  return enumerateActionRankingCandidates(board, PLAYER_INDEX, {
    includeWait: true,
    includePremove: true,
    hands: [{}, {}],
  });
}

function createScenarioBoard(config: ScenarioConfig): BoardState {
  const board = createBoard(2);
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.ticksSinceMove = 0;
  board.ticksSinceNonWaitMove = 0;
  board.piles = Array.from({ length: 8 }, () => []);
  board.piles[0] = [card("hearts", config.heartsCenterValue, -1)];
  board.piles[1] = [card("clubs", config.clubsCenterValue, -1)];

  board.players.forEach((player) => {
    player.deck = [];
    player.flippedDeck = [];
    player.pounceDeck = [];
    player.stacks = [[], [], [], []];
    player.currentPoints = 0;
  });

  board.players[PLAYER_INDEX].pounceDeck = [
    card("diamonds", 4, PLAYER_INDEX),
    config.pounceTop ?? card("spades", 6, PLAYER_INDEX),
  ];
  board.players[PLAYER_INDEX].stacks = [
    [card("clubs", 11, PLAYER_INDEX)],
    [card("hearts", 12, PLAYER_INDEX)],
    [card("clubs", 13, PLAYER_INDEX)],
    config.fourthStack ? [config.fourthStack] : [],
  ];

  board.players[1].pounceDeck = [
    card("diamonds", 8, 1),
    card("hearts", 10, 1),
    config.opponentPounceTop ?? card("spades", 12, 1),
  ];
  return board;
}

function getFeature(
  candidate: ActionRankingCandidate,
  featureName: ActionRankingFeatureName
): number {
  const index = ACTION_RANKING_FEATURE_NAMES.indexOf(featureName);
  return index < 0 ? 0 : candidate.features[index] ?? 0;
}

function card(
  suit: CardState["suit"],
  value: CardState["value"],
  player: number
): CardState {
  return { suit, value, player };
}

function getModelPaths(): string[] {
  const fromEnv = process.env.MODEL_PATHS ?? process.env.MODEL_IN;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => path.resolve(item));
  }

  return [
    path.resolve(
      __dirname,
      "../shared/models/pounce-action-ranking-cursor-champion.json"
    ),
  ];
}

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
