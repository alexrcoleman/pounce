import fs from "fs";
import path from "path";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  getActionRankingMoveKey,
  getCurrentPointsFromCards,
  getPointDifferential,
  type ActionRankingCandidate,
  type ActionRankingFeatureName,
} from "../shared/ActionRankingPolicy";
import { getBasicAIMoveForStyle, getBasicAIStyleNames } from "../shared/ComputerV1";
import {
  createBoard,
  type BoardState,
  type CardState,
  type CursorState,
} from "../shared/GameUtils";
import {
  NeuralActionRankingPolicy,
  type ActionRankingPrediction,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";

type WatchedMoveGroup = {
  label: string;
  keys: string[];
};

type ScenarioBoard = {
  board: BoardState;
  hands?: readonly CursorState[];
};

type ScenarioProbe = {
  name: string;
  note: string;
  expectedTopGroup?: string;
  expectedPreference: string;
  watchedMoves: WatchedMoveGroup[];
  create: () => ScenarioBoard;
};

type ModelProbeResult = {
  model: string;
  modelPath: string;
  scenarios: ReturnType<typeof summarizeScenario>[];
};

type ProbeOutput = {
  models: ModelProbeResult[];
  fixedStyles: ReturnType<typeof summarizeFixedStyles>;
};

const PLAYER_INDEX = 0;
const CENTER_COUNT = 8;

const FEATURE_NAMES: ActionRankingFeatureName[] = [
  "move.c2c",
  "move.c2s",
  "move.s2s",
  "source.pounce",
  "source.solitaire",
  "dest.center",
  "dest.solitaire",
  "dest.isEmpty",
  "card.value",
  "card.isAce",
  "card.canPlaySoon",
  "card.centerDistance",
  "card.centerPlayableDestinationCount",
  "own.emptyStackCount",
  "own.pounceCount",
  "own.pounceCenterPlayable",
  "own.stackCenterPlayableCount",
  "opponent.minPounceCount",
  "opponent.maxPouncePressure",
  "opponent.pounceCenterPlayableCount",
  "opponent.pounceCanPlaySoonCount",
  "opponent.handVisibleCount",
  "opponent.handCenterPlayableCount",
  "opponent.handCanPlaySoonCount",
  "move.immediatePointDelta",
  "move.immediatePointDifferentialDelta",
  "move.clearsPounce",
  "center.opponentsCanPlaySameNow",
  "center.opponentPounceCanPlaySameNow",
  "center.opponentHandCanPlaySameNow",
  "center.opponentFollowPressureAfter",
  "center.opponentSameNowPressure",
  "center.ownCanFollowAfter",
  "center.ownPounceCanFollowAfter",
  "center.ownStackCanFollowAfter",
  "solitaire.movesFullStack",
  "solitaire.makesPouncePlayable",
  "solitaire.sourceCenterLowerDistance",
  "stuck.noVisibleCenterMoves",
];

const SCENARIOS: ScenarioProbe[] = [
  {
    name: "ace_vs_three_center",
    note:
      "Own solitaire piles include AC and 3H; both are playable, but the ace has many empty center destinations.",
    expectedTopGroup: "play3HToCenter",
    expectedPreference:
      "Prefer 3H before AC because aces have no same-card race and can be played later.",
    watchedMoves: [
      {
        label: "play3HToCenter",
        keys: ["c2c:solitaire:1:1"],
      },
      {
        label: "playACToCenter",
        keys: centerKeys("c2c:solitaire:0", exceptCenters([1])),
      },
    ],
    create: () =>
      scenarioBoard({
        piles: {
          1: [card("hearts", 2, -1)],
        },
        ownPounce: [
          card("diamonds", 7, PLAYER_INDEX),
          card("spades", 6, PLAYER_INDEX),
        ],
        ownStacks: [
          [card("clubs", 1, PLAYER_INDEX)],
          [card("hearts", 3, PLAYER_INDEX)],
          [card("spades", 8, PLAYER_INDEX)],
          [card("diamonds", 10, PLAYER_INDEX)],
        ],
      }),
  },
  {
    name: "ace_vs_three_center_swapped",
    note:
      "Same as ace_vs_three_center, but 3H is solitaire stack 0 and AC is stack 1.",
    expectedTopGroup: "play3HToCenter",
    expectedPreference:
      "Prefer 3H before AC even when the stack order is swapped.",
    watchedMoves: [
      {
        label: "play3HToCenter",
        keys: ["c2c:solitaire:0:1"],
      },
      {
        label: "playACToCenter",
        keys: centerKeys("c2c:solitaire:1", exceptCenters([1])),
      },
    ],
    create: () =>
      scenarioBoard({
        piles: {
          1: [card("hearts", 2, -1)],
        },
        ownPounce: [
          card("diamonds", 7, PLAYER_INDEX),
          card("spades", 6, PLAYER_INDEX),
        ],
        ownStacks: [
          [card("hearts", 3, PLAYER_INDEX)],
          [card("clubs", 1, PLAYER_INDEX)],
          [card("spades", 8, PLAYER_INDEX)],
          [card("diamonds", 10, PLAYER_INDEX)],
        ],
      }),
  },
  {
    name: "center_slot_contention_5c_5h",
    note:
      "Own solitaire piles include 5C and 5H; 5C has three playable center piles while 5H has one.",
    expectedTopGroup: "play5HToCenter",
    expectedPreference:
      "Prefer 5H before 5C because the hearts destination is scarcer.",
    watchedMoves: [
      {
        label: "play5HToCenter",
        keys: ["c2c:solitaire:1:3"],
      },
      {
        label: "play5CToCenter",
        keys: centerKeys("c2c:solitaire:0", [0, 1, 2]),
      },
    ],
    create: () =>
      scenarioBoard({
        piles: {
          0: [card("clubs", 4, -1)],
          1: [card("clubs", 4, -1)],
          2: [card("clubs", 4, -1)],
          3: [card("hearts", 4, -1)],
        },
        ownPounce: [
          card("diamonds", 7, PLAYER_INDEX),
          card("spades", 6, PLAYER_INDEX),
        ],
        ownStacks: [
          [card("clubs", 5, PLAYER_INDEX)],
          [card("hearts", 5, PLAYER_INDEX)],
          [card("spades", 8, PLAYER_INDEX)],
          [card("diamonds", 10, PLAYER_INDEX)],
        ],
      }),
  },
  {
    name: "visible_hand_race_5h",
    note:
      "Own solitaire piles include 5C and 5H; each has one destination, and an opponent is visibly holding 5H.",
    expectedTopGroup: "play5HToCenter",
    expectedPreference:
      "Prefer 5H before 5C when a visible opponent hand can play the same 5H now.",
    watchedMoves: [
      {
        label: "play5HToCenter",
        keys: ["c2c:solitaire:1:1"],
      },
      {
        label: "play5CToCenter",
        keys: ["c2c:solitaire:0:0"],
      },
    ],
    create: () =>
      scenarioBoard({
        piles: {
          0: [card("clubs", 4, -1)],
          1: [card("hearts", 4, -1)],
        },
        ownPounce: [
          card("diamonds", 7, PLAYER_INDEX),
          card("spades", 6, PLAYER_INDEX),
        ],
        ownStacks: [
          [card("clubs", 5, PLAYER_INDEX)],
          [card("hearts", 5, PLAYER_INDEX)],
          [card("spades", 8, PLAYER_INDEX)],
          [card("diamonds", 10, PLAYER_INDEX)],
        ],
        opponentHands: [
          { item: card("hearts", 5, 1) },
        ],
      }),
  },
  {
    name: "pounce_ace_vs_solitaire_three_under_pressure",
    note:
      "Own pounce card is AC and own solitaire 3H can play on 2H; an opponent has one playable pounce card left.",
    expectedTopGroup: "playPounceACToCenter",
    expectedPreference:
      "Prefer the pounce ace for the immediate +3 and possible round end before the opponent pounces.",
    watchedMoves: [
      {
        label: "playPounceACToCenter",
        keys: centerKeys("c2c:pounce", exceptCenters([1])),
      },
      {
        label: "play3HToCenter",
        keys: ["c2c:solitaire:0:1"],
      },
    ],
    create: () =>
      scenarioBoard({
        piles: {
          1: [card("hearts", 2, -1)],
        },
        ownPounce: [card("clubs", 1, PLAYER_INDEX)],
        ownStacks: [
          [card("hearts", 3, PLAYER_INDEX)],
          [card("spades", 8, PLAYER_INDEX)],
          [card("diamonds", 10, PLAYER_INDEX)],
          [card("clubs", 12, PLAYER_INDEX)],
        ],
        opponentPounce: [card("diamonds", 1, 1)],
      }),
  },
  {
    name: "open_slot_unplayable_pounce_safe",
    note:
      "Own pounce card can move to an empty solitaire slot but cannot play center; a one-card solitaire pile can play center.",
    expectedTopGroup: "playSolitaireToCenter",
    expectedPreference:
      "Prefer the solitaire center play when no opponent is close to pouncing, because it scores and also frees a slot.",
    watchedMoves: [
      {
        label: "playSolitaireToCenter",
        keys: ["c2c:solitaire:0:0"],
      },
      {
        label: "movePounceToOpenSlot",
        keys: ["c2s:pounce:1"],
      },
    ],
    create: () =>
      scenarioBoard({
        piles: {
          0: [card("hearts", 4, -1)],
          2: [card("clubs", 2, -1)],
        },
        ownPounce: [
          card("diamonds", 7, PLAYER_INDEX),
          card("clubs", 9, PLAYER_INDEX),
        ],
        ownStacks: [
          [card("hearts", 5, PLAYER_INDEX)],
          [],
          [card("spades", 13, PLAYER_INDEX)],
          [card("diamonds", 12, PLAYER_INDEX)],
        ],
        opponentPounce: [
          card("spades", 11, 1),
          card("hearts", 10, 1),
          card("diamonds", 12, 1),
        ],
      }),
  },
  {
    name: "open_slot_unplayable_pounce_opponent_pressure",
    note:
      "Same pounce-slot tradeoff, but an opponent has one playable pounce card left.",
    expectedPreference:
      "Contextual pressure probe: the solitaire play should stay competitive, but pounce-slot urgency may rise when an opponent is about to end the round.",
    watchedMoves: [
      {
        label: "playSolitaireToCenter",
        keys: ["c2c:solitaire:0:0"],
      },
      {
        label: "movePounceToOpenSlot",
        keys: ["c2s:pounce:1"],
      },
    ],
    create: () =>
      scenarioBoard({
        piles: {
          0: [card("hearts", 4, -1)],
          2: [card("clubs", 2, -1)],
        },
        ownPounce: [
          card("diamonds", 7, PLAYER_INDEX),
          card("clubs", 9, PLAYER_INDEX),
        ],
        ownStacks: [
          [card("hearts", 5, PLAYER_INDEX)],
          [],
          [card("spades", 13, PLAYER_INDEX)],
          [card("diamonds", 12, PLAYER_INDEX)],
        ],
        opponentPounce: [card("diamonds", 1, 1)],
      }),
  },
];

const modelPaths = getModelPaths();
const results: ModelProbeResult[] = modelPaths.map((modelPath) => {
  const policy = new NeuralActionRankingPolicy(readModel(modelPath));
  return {
    model: path.basename(modelPath),
    modelPath,
    scenarios: SCENARIOS.map((scenario) =>
      summarizeScenario(policy, scenario)
    ),
  };
});
const output: ProbeOutput = {
  models: results,
  fixedStyles: summarizeFixedStyles(),
};

console.log(
  JSON.stringify(readBooleanEnv("PROBE_SUMMARY", false) ? summarizeOutput(output) : output, null, 2)
);

function summarizeScenario(
  policy: NeuralActionRankingPolicy,
  scenario: ScenarioProbe
) {
  const setup = scenario.create();
  const candidates = enumerateCandidates(setup.board, setup.hands);
  const ranked = policy.rankCandidates(candidates);
  const watchedMoves = scenario.watchedMoves.map((group) =>
    describeGroup(ranked, group)
  );
  const topWatchedGroup = watchedMoves
    .filter((item) => item.best)
    .sort((a, b) => (a.best?.rank ?? Infinity) - (b.best?.rank ?? Infinity))[0];

  return {
    name: scenario.name,
    note: scenario.note,
    expectedPreference: scenario.expectedPreference,
    expectedTopGroup: scenario.expectedTopGroup ?? null,
    topWatchedGroup: topWatchedGroup?.label ?? null,
    matchesExpectedTop:
      scenario.expectedTopGroup == null
        ? null
        : topWatchedGroup?.label === scenario.expectedTopGroup,
    scoreBefore: getCurrentPointsFromCards(setup.board.players[PLAYER_INDEX]),
    pointDifferentialBefore: getPointDifferential(setup.board, PLAYER_INDEX),
    candidateCount: candidates.length,
    topCandidates: ranked
      .slice(0, 10)
      .map((prediction) => describePrediction(prediction, ranked)),
    watchedMoves,
  };
}

function describeGroup(
  ranked: readonly ActionRankingPrediction[],
  group: WatchedMoveGroup
) {
  const predictions = group.keys
    .map((key) => describeKey(ranked, key))
    .filter((prediction): prediction is ReturnType<typeof describePrediction> =>
      prediction != null
    )
    .sort((a, b) => a.rank - b.rank);

  return {
    label: group.label,
    best: predictions[0] ?? null,
    candidates: predictions,
    missingKeys: group.keys.filter(
      (key) => !ranked.some((item) => item.candidate.key === key)
    ),
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
    endsRound: candidate.endsRound,
    features: Object.fromEntries(
      FEATURE_NAMES.map((featureName) => [
        featureName,
        getFeature(candidate, featureName),
      ])
    ),
  };
}

function enumerateCandidates(
  board: BoardState,
  hands: readonly CursorState[] | undefined
): ActionRankingCandidate[] {
  return enumerateActionRankingCandidates(board, PLAYER_INDEX, {
    includeWait: true,
    includePremove: true,
    hands: hands ?? [{}, {}],
  });
}

function scenarioBoard(config: {
  piles?: Partial<Record<number, CardState[]>>;
  ownPounce: CardState[];
  ownStacks: [CardState[], CardState[], CardState[], CardState[]];
  opponentPounce?: CardState[];
  opponentStacks?: [CardState[], CardState[], CardState[], CardState[]];
  opponentHands?: CursorState[];
}): ScenarioBoard {
  const board = createBoard(2);
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.ticksSinceMove = 0;
  board.ticksSinceNonWaitMove = 0;
  board.piles = Array.from({ length: CENTER_COUNT }, (_, index) =>
    (config.piles?.[index] ?? []).slice()
  );
  board.pileLocs = Array.from({ length: CENTER_COUNT }, (_, index) => [
    index / Math.max(1, CENTER_COUNT - 1),
    0.5,
    0,
  ]);

  board.players.forEach((player) => {
    player.deck = [];
    player.flippedDeck = [];
    player.pounceDeck = [];
    player.stacks = [[], [], [], []];
    player.currentPoints = 0;
  });

  board.players[PLAYER_INDEX].pounceDeck = config.ownPounce.slice();
  board.players[PLAYER_INDEX].stacks = cloneStacks(config.ownStacks);
  board.players[1].pounceDeck = (
    config.opponentPounce ?? [
      card("diamonds", 11, 1),
      card("hearts", 10, 1),
      card("spades", 12, 1),
    ]
  ).slice();
  board.players[1].stacks = cloneStacks(
    config.opponentStacks ?? [
      [card("clubs", 12, 1)],
      [card("hearts", 11, 1)],
      [card("spades", 10, 1)],
      [card("diamonds", 13, 1)],
    ]
  );

  return {
    board,
    hands: [
      {},
      ...(config.opponentHands && config.opponentHands.length > 0
        ? config.opponentHands
        : [{}]),
    ],
  };
}

function cloneStacks(
  stacks: [CardState[], CardState[], CardState[], CardState[]]
): [CardState[], CardState[], CardState[], CardState[]] {
  return stacks.map((stack) => stack.slice()) as [
    CardState[],
    CardState[],
    CardState[],
    CardState[]
  ];
}

function centerKeys(prefix: string, dests: number[]): string[] {
  return dests.map((dest) => `${prefix}:${dest}`);
}

function exceptCenters(excluded: number[]): number[] {
  return Array.from({ length: CENTER_COUNT }, (_, index) => index).filter(
    (index) => !excluded.includes(index)
  );
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

function summarizeFixedStyles() {
  return getBasicAIStyleNames().map((styleName) => ({
    style: styleName,
    scenarios: SCENARIOS.map((scenario) => {
      const setup = scenario.create();
      const move = getBasicAIMoveForStyle(
        setup.board,
        PLAYER_INDEX,
        {},
        styleName
      );
      const key = move ? getActionRankingMoveKey(move) : null;
      const watchedGroup =
        key == null
          ? null
          : scenario.watchedMoves.find((group) => group.keys.includes(key))?.label ??
            null;

      return {
        name: scenario.name,
        move,
        key,
        watchedGroup,
        matchesExpectedTop:
          scenario.expectedTopGroup == null
            ? null
            : watchedGroup === scenario.expectedTopGroup,
      };
    }),
  }));
}

function summarizeOutput(output: ProbeOutput) {
  return {
    models: output.models.map((model) => ({
      model: model.model,
      modelPath: model.modelPath,
      scenarios: model.scenarios.map((scenario) => ({
        name: scenario.name,
        expectedTopGroup: scenario.expectedTopGroup,
        topWatchedGroup: scenario.topWatchedGroup,
        matchesExpectedTop: scenario.matchesExpectedTop,
        topCandidate: scenario.topCandidates[0]
          ? {
              key: scenario.topCandidates[0].key,
              rank: scenario.topCandidates[0].rank,
              score: scenario.topCandidates[0].score,
              probability: scenario.topCandidates[0].probability,
              immediatePointDelta: scenario.topCandidates[0].immediatePointDelta,
              endsRound: scenario.topCandidates[0].endsRound,
            }
          : null,
        watchedMoves: scenario.watchedMoves.map((group) => ({
          label: group.label,
          best: group.best
            ? {
                key: group.best.key,
                rank: group.best.rank,
                score: group.best.score,
                probability: group.best.probability,
                immediatePointDelta: group.best.immediatePointDelta,
                endsRound: group.best.endsRound,
              }
            : null,
        })),
      })),
    })),
    fixedStyles: output.fixedStyles.map((style) => ({
      style: style.style,
      scenarios: style.scenarios.map((scenario) => ({
        name: scenario.name,
        key: scenario.key,
        watchedGroup: scenario.watchedGroup,
        matchesExpectedTop: scenario.matchesExpectedTop,
      })),
    })),
  };
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
