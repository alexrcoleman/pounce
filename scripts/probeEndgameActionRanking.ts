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
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";

type Scenario = {
  name: string;
  board: BoardState;
  playerIndex: number;
  note: string;
};

const modelPaths = getModelPaths();
const scenarios = [
  createSafeExtraPointsScenario(),
  createOpponentRaceScenario(),
];
const featureNames: ActionRankingFeatureName[] = [
  "board.isHeadsUp",
  "own.pounceCount",
  "own.pointDifferential",
  "move.immediatePointDelta",
  "move.immediatePointDifferentialDelta",
  "move.clearsPounce",
  "center.opponentsCanFollowAfter",
  "center.opponentPounceCanFollowAfter",
  "opponent.minPounceCount",
];

const results = modelPaths.map((modelPath) => {
  const policy = new NeuralActionRankingPolicy(readModel(modelPath));
  return {
    model: path.basename(modelPath),
    scenarios: scenarios.map((scenario) => summarizeScenario(policy, scenario)),
  };
});

console.log(JSON.stringify({ models: results }, null, 2));

function summarizeScenario(
  policy: NeuralActionRankingPolicy,
  scenario: Scenario
) {
  const candidates = enumerateActionRankingCandidates(
    scenario.board,
    scenario.playerIndex,
    {
      includePremove: true,
      includeWait: true,
    }
  );
  const ranked = policy.rankCandidates(candidates).slice(0, 10);
  return {
    name: scenario.name,
    note: scenario.note,
    pointDifferentialBefore: getPointDifferential(
      scenario.board,
      scenario.playerIndex
    ),
    scoreBefore: getCurrentPointsFromCards(
      scenario.board.players[scenario.playerIndex]
    ),
    candidateCount: candidates.length,
    topMove: ranked[0] ? describeCandidate(ranked[0].candidate) : null,
    topScore: ranked[0]?.score ?? null,
    topCandidates: ranked.map((prediction) => ({
      score: prediction.score,
      probability: prediction.probability,
      ...describeCandidate(prediction.candidate),
    })),
  };
}

function describeCandidate(candidate: ActionRankingCandidate) {
  return {
    key: candidate.key,
    move: candidate.move,
    immediatePointDelta: candidate.immediatePointDelta,
    immediatePointDifferentialDelta: candidate.immediatePointDifferentialDelta,
    endsRound: candidate.endsRound,
    features: Object.fromEntries(
      featureNames.map((featureName) => [
        featureName,
        getFeature(candidate, featureName),
      ])
    ),
  };
}

function createSafeExtraPointsScenario(): Scenario {
  const board = createEmptyBoard(2);
  board.piles = [
    [card("hearts", 1, -1)],
    [card("clubs", 4, -1)],
    [card("diamonds", 6, -1)],
    [],
    [],
    [],
    [],
    [],
  ];
  board.players[0].pounceDeck = [card("hearts", 2, 0)];
  board.players[0].flippedDeck = [card("clubs", 5, 0)];
  board.players[0].stacks = [[card("diamonds", 7, 0)], [], [], []];
  board.players[1].pounceDeck = [
    card("spades", 8, 1),
    card("clubs", 9, 1),
    card("hearts", 10, 1),
    card("diamonds", 11, 1),
  ];

  return {
    name: "safe_extra_points_before_last_pounce",
    board,
    playerIndex: 0,
    note:
      "The last pounce card can end the round now, but deck and solitaire center moves are also immediately playable.",
  };
}

function createOpponentRaceScenario(): Scenario {
  const board = createEmptyBoard(2);
  board.piles = [
    [card("hearts", 1, -1)],
    [card("clubs", 4, -1)],
    [card("diamonds", 6, -1)],
    [card("spades", 8, -1)],
    [],
    [],
    [],
    [],
  ];
  board.players[0].pounceDeck = [card("hearts", 2, 0)];
  board.players[0].flippedDeck = [card("clubs", 5, 0)];
  board.players[0].stacks = [[card("diamonds", 7, 0)], [], [], []];
  board.players[1].pounceDeck = [card("spades", 9, 1)];
  board.players[1].flippedDeck = [card("clubs", 5, 1)];

  return {
    name: "opponent_can_also_pounce_out",
    board,
    playerIndex: 0,
    note:
      "The last pounce card can end the round now, while the opponent also has a playable last pounce card.",
  };
}

function createEmptyBoard(playerCount: number): BoardState {
  const board = createBoard(playerCount);
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.ticksSinceMove = 0;
  board.players.forEach((player) => {
    player.deck = [];
    player.flippedDeck = [];
    player.pounceDeck = [];
    player.stacks = [[], [], [], []];
    player.currentPoints = 0;
  });
  board.piles = Array.from({ length: playerCount * 4 }, () => []);
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
  const fromEnv = process.env.MODEL_PATHS;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [
    ".\\node_modules\\pounce-action-ranking-cursor-1v1-actionspace-calibrated.json",
    ".\\node_modules\\pounce-action-ranking-cursor-actionspace-lightcal.json",
  ].filter((modelPath) => fs.existsSync(modelPath));
}

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}
