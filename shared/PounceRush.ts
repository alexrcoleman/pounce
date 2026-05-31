import deepClone from "./deepClone";
import {
  BoardState,
  CardState,
  Suits,
  Values,
  createBoard,
} from "./GameUtils";
import { Move, executeMove } from "./MoveHandler";

export type PounceRushPuzzleKind =
  | "pounce_center"
  | "solitaire_center"
  | "waste_center"
  | "free_slot"
  | "uncover_center"
  | "combo";

export type PounceRushObjective = "Unload a pounce card";

export type PounceRushPuzzle = {
  board: BoardState;
  difficulty: "Warmup" | "Sharp" | "Combo";
  difficultyScore: number;
  id: string;
  kind: PounceRushPuzzleKind;
  objective: PounceRushObjective;
  puzzleNumber: number;
  reportCode: string;
  seed: string;
  sequence: Move[];
  templateId: string;
};

export type CreatePounceRushPuzzleOptions = {
  playerName: string;
  playerSessionId: string;
  puzzleNumber: number;
  seed?: string;
  socketId: string;
};

export type PounceRushPuzzleSummary = {
  difficulty: PounceRushPuzzle["difficulty"];
  difficultyScore: number;
  id: string;
  kind: PounceRushPuzzleKind;
  objective: PounceRushObjective;
  puzzleNumber: number;
  reportCode: string;
  seed: string;
  sequenceLength: number;
  templateId: string;
};

export type PounceRushMoveRejection = {
  detail?: string;
  title: string;
};

type PuzzleTemplate = {
  build: (context: PuzzleBuildContext) => PuzzleSetup;
  difficulty: PounceRushPuzzle["difficulty"];
  difficultyScore: number;
  id: string;
  kind: PounceRushPuzzleKind;
  minPuzzleNumber?: number;
  objective: PounceRushObjective;
  tags: PuzzleTemplateTag[];
};

type PuzzleTemplateTag =
  | "center"
  | "daily-hard"
  | "deck"
  | "direct"
  | "free-slot"
  | "mixed-source"
  | "pounce"
  | "solitaire"
  | "stack-shift"
  | "uncover"
  | "waste";

type PuzzleBuildContext = {
  rng: () => number;
};

type PuzzleSetup = {
  deckCard: CardState;
  flippedDeck: CardState[];
  piles: CardState[][];
  pounceDeck: CardState[];
  sequence: Move[];
  stacks: [CardState[], CardState[], CardState[], CardState[]];
};

const PLAYER_INDEX = 0;
const DEFAULT_POUNCE_RUSH_SEED = "rush";
const DAILY_PUZZLE_MIN_DIFFICULTY_SCORE = 8;
const MAX_PUZZLE_GENERATION_ATTEMPTS = 24;
const CENTER_PILE_LOCS: [number, number, number][] = [
  [0.13, 0.16, 0.02],
  [0.66, 0.18, 0.31],
  [0.21, 0.64, 0.68],
  [0.73, 0.62, 0.47],
  [0.4, 0.12, 0.78],
  [0.46, 0.76, 0.18],
  [0.08, 0.43, 0.61],
  [0.88, 0.38, 0.91],
];
const SUITS: Suits[] = ["hearts", "spades", "diamonds", "clubs"];

const POUNCE_RUSH_TEMPLATES: PuzzleTemplate[] = [
  {
    id: "pounce-center-scan",
    kind: "pounce_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
    difficultyScore: 1,
    tags: ["pounce", "center", "direct"],
    build: () => ({
      deckCard: card("hearts", 13),
      flippedDeck: [card("clubs", 12)],
      pounceDeck: [card("diamonds", 9), card("hearts", 4)],
      stacks: singleStacks(
        card("clubs", 13),
        card("hearts", 10),
        card("spades", 8),
        card("diamonds", 6)
      ),
      piles: [
        suitedPile("hearts", 3),
        suitedPile("spades", 5),
        suitedPile("diamonds", 3),
        suitedPile("clubs", 3),
      ],
      sequence: [{ type: "c2c", source: { type: "pounce" }, dest: 0 }],
    }),
  },
  {
    id: "solitaire-center-scan",
    kind: "solitaire_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
    difficultyScore: 3,
    tags: ["solitaire", "center"],
    build: () => ({
      deckCard: card("spades", 13),
      flippedDeck: [card("diamonds", 4)],
      pounceDeck: [card("clubs", 5), card("spades", 7)],
      stacks: singleStacks(
        card("diamonds", 9),
        card("clubs", 12),
        card("spades", 6),
        card("hearts", 10)
      ),
      piles: [
        suitedPile("hearts", 3),
        suitedPile("spades", 5),
        suitedPile("diamonds", 2),
        suitedPile("clubs", 4),
      ],
      sequence: [
        { type: "c2c", source: { type: "solitaire", index: 2 }, dest: 1 },
        { type: "c2c", source: { type: "pounce" }, dest: 1 },
      ],
    }),
  },
  {
    id: "pounce-center-generated",
    kind: "pounce_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
    difficultyScore: 2,
    tags: ["pounce", "center", "direct"],
    build: ({ rng }) => {
      const targetValue = pickValue(rng, [3, 4, 5, 7, 8, 9, 10, 11]);
      return {
        deckCard: card("spades", 13),
        flippedDeck: [card("diamonds", 2)],
        pounceDeck: [card("diamonds", 12), card("hearts", targetValue)],
        stacks: singleStacks(
          card("clubs", 13),
          card("diamonds", 10),
          card("spades", 8),
          card("clubs", 6)
        ),
        piles: [
          suitedPile("hearts", previousValue(targetValue)),
          suitedPile("spades", 5),
          suitedPile("diamonds", 3),
          suitedPile("clubs", 3),
        ],
        sequence: [{ type: "c2c", source: { type: "pounce" }, dest: 0 }],
      };
    },
  },
  {
    id: "solitaire-center-generated",
    kind: "solitaire_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
    difficultyScore: 3,
    tags: ["solitaire", "center"],
    build: ({ rng }) => {
      const targetValue = pickValue(rng, [3, 4, 5, 7, 8, 9, 10]);
      return {
        deckCard: card("clubs", 13),
        flippedDeck: [card("diamonds", 2)],
        pounceDeck: [card("clubs", 6), card("hearts", nextValue(targetValue))],
        stacks: singleStacks(
          card("diamonds", 13),
          card("clubs", 12),
          card("hearts", targetValue),
          card("spades", 13)
        ),
        piles: [
          suitedPile("hearts", previousValue(targetValue)),
          suitedPile("spades", 5),
          suitedPile("diamonds", 3),
          suitedPile("clubs", 3),
        ],
        sequence: [
          { type: "c2c", source: { type: "solitaire", index: 2 }, dest: 0 },
          { type: "c2c", source: { type: "pounce" }, dest: 0 },
        ],
      };
    },
  },
  {
    id: "waste-ace-center",
    kind: "waste_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
    difficultyScore: 2,
    tags: ["waste", "center"],
    build: () => ({
      deckCard: card("clubs", 13),
      flippedDeck: [card("diamonds", 1)],
      pounceDeck: [card("spades", 12), card("diamonds", 2)],
      stacks: singleStacks(
        card("spades", 10),
        card("diamonds", 12),
        card("hearts", 8),
        card("diamonds", 5)
      ),
      piles: [
        suitedPile("hearts", 4),
        suitedPile("spades", 6),
        suitedPile("clubs", 8),
        [],
      ],
      sequence: [
        { type: "c2c", source: { type: "deck" }, dest: 3 },
        { type: "c2c", source: { type: "pounce" }, dest: 3 },
      ],
    }),
  },
  {
    id: "waste-center-generated",
    kind: "waste_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
    difficultyScore: 3,
    tags: ["waste", "center"],
    build: ({ rng }) => {
      const targetValue = pickValue(rng, [3, 4, 5, 7, 8, 9, 10, 11]);
      return {
        deckCard: card("clubs", 13),
        flippedDeck: [card("hearts", targetValue)],
        pounceDeck: [card("spades", 12), card("hearts", nextValue(targetValue))],
        stacks: singleStacks(
          card("spades", 13),
          card("diamonds", 11),
          card("clubs", 8),
          card("diamonds", 6)
        ),
        piles: [
          suitedPile("hearts", previousValue(targetValue)),
          suitedPile("spades", 5),
          suitedPile("diamonds", 3),
          suitedPile("clubs", 3),
        ],
        sequence: [
          { type: "c2c", source: { type: "deck" }, dest: 0 },
          { type: "c2c", source: { type: "pounce" }, dest: 0 },
        ],
      };
    },
  },
  {
    id: "free-slot-pounce",
    kind: "free_slot",
    objective: "Unload a pounce card",
    difficulty: "Sharp",
    difficultyScore: 4,
    tags: ["free-slot", "pounce", "stack-shift"],
    build: () => ({
      deckCard: card("clubs", 13),
      flippedDeck: [card("hearts", 8)],
      pounceDeck: [card("clubs", 9), card("hearts", 12)],
      stacks: singleStacks(
        card("clubs", 7),
        card("diamonds", 8),
        card("diamonds", 13),
        card("spades", 10)
      ),
      piles: [
        suitedPile("hearts", 4),
        suitedPile("spades", 5),
        suitedPile("diamonds", 6),
        suitedPile("clubs", 4),
      ],
      sequence: [
        { type: "s2s", source: 0, dest: 1, count: 1 },
        { type: "c2s", source: "pounce", dest: 0 },
      ],
    }),
  },
  {
    id: "free-slot-pounce-generated",
    kind: "free_slot",
    objective: "Unload a pounce card",
    difficulty: "Sharp",
    difficultyScore: 4,
    tags: ["free-slot", "pounce", "stack-shift"],
    build: ({ rng }) => {
      const movingValue = pickValue(rng, [3, 4, 5, 6, 7, 8, 9, 10]);
      return {
        deckCard: card("clubs", 13),
        flippedDeck: [card("hearts", 12)],
        pounceDeck: [card("diamonds", 12), card("clubs", 10)],
        stacks: singleStacks(
          card("clubs", movingValue),
          card("diamonds", nextValue(movingValue)),
          card("diamonds", 13),
          card("spades", 9)
        ),
        piles: [
          suitedPile("hearts", 4),
          suitedPile("spades", 5),
          suitedPile("diamonds", 3),
          suitedPile("clubs", 3),
        ],
        sequence: [
          { type: "s2s", source: 0, dest: 1, count: 1 },
          { type: "c2s", source: "pounce", dest: 0 },
        ],
      };
    },
  },
  {
    id: "deck-connector-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Sharp",
    difficultyScore: 5,
    tags: ["deck", "solitaire", "pounce", "mixed-source"],
    build: () => ({
      deckCard: card("diamonds", 13),
      flippedDeck: [card("hearts", 6)],
      pounceDeck: [card("diamonds", 12), card("clubs", 5)],
      stacks: singleStacks(
        card("spades", 7),
        card("spades", 10),
        card("spades", 12),
        card("spades", 13)
      ),
      piles: [
        suitedPile("hearts", 4),
        suitedPile("spades", 5),
        suitedPile("diamonds", 3),
        suitedPile("clubs", 3),
      ],
      sequence: [
        { type: "c2s", source: "deck", dest: 0 },
        { type: "c2s", source: "pounce", dest: 0 },
      ],
    }),
  },
  {
    id: "uncover-connector-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 6,
    minPuzzleNumber: 8,
    tags: ["uncover", "stack-shift", "solitaire", "center", "pounce"],
    build: () => ({
      deckCard: card("clubs", 13),
      flippedDeck: [card("hearts", 8)],
      pounceDeck: [card("clubs", 11), card("hearts", 7)],
      stacks: [
        [card("hearts", 6), card("clubs", 5)],
        [card("diamonds", 6)],
        [card("spades", 12)],
        [card("spades", 13)],
      ],
      piles: [
        suitedPile("hearts", 5),
        suitedPile("spades", 4),
        suitedPile("diamonds", 3),
        suitedPile("clubs", 3),
      ],
      sequence: [
        { type: "s2s", source: 0, dest: 1, count: 1 },
        { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 0 },
        { type: "c2c", source: { type: "pounce" }, dest: 0 },
      ],
    }),
  },
  {
    id: "tall-free-slot-pounce",
    kind: "free_slot",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 5,
    minPuzzleNumber: 6,
    tags: ["free-slot", "pounce", "stack-shift"],
    build: () => ({
      deckCard: card("clubs", 13),
      flippedDeck: [card("hearts", 8)],
      pounceDeck: [card("hearts", 11), card("clubs", 10)],
      stacks: [
        [card("hearts", 6), card("clubs", 5)],
        [card("spades", 7)],
        [card("spades", 12)],
        [card("spades", 13)],
      ],
      piles: [
        suitedPile("hearts", 4),
        suitedPile("spades", 5),
        suitedPile("diamonds", 3),
        suitedPile("clubs", 3),
      ],
      sequence: [
        { type: "s2s", source: 0, dest: 1, count: 2 },
        { type: "c2s", source: "pounce", dest: 0 },
      ],
    }),
  },
  {
    id: "uncover-center",
    kind: "uncover_center",
    objective: "Unload a pounce card",
    difficulty: "Sharp",
    difficultyScore: 6,
    minPuzzleNumber: 8,
    tags: ["uncover", "center", "stack-shift", "pounce"],
    build: () => ({
      deckCard: card("hearts", 13),
      flippedDeck: [card("hearts", 12)],
      pounceDeck: [card("clubs", 11), card("hearts", 7)],
      stacks: [
        [card("hearts", 6), card("clubs", 5)],
        [card("diamonds", 6)],
        [card("spades", 12)],
        [card("diamonds", 9)],
      ],
      piles: [
        suitedPile("hearts", 5),
        suitedPile("spades", 4),
        suitedPile("diamonds", 3),
        suitedPile("clubs", 2),
      ],
      sequence: [
        { type: "s2s", source: 0, dest: 1, count: 1 },
        { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 0 },
        { type: "c2c", source: { type: "pounce" }, dest: 0 },
      ],
    }),
  },
  {
    id: "advance-center-for-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 3,
    minPuzzleNumber: 4,
    tags: ["solitaire", "center", "pounce"],
    build: () => ({
      deckCard: card("diamonds", 13),
      flippedDeck: [card("clubs", 12)],
      pounceDeck: [card("clubs", 9), card("hearts", 7)],
      stacks: singleStacks(
        card("clubs", 13),
        card("diamonds", 9),
        card("hearts", 6),
        card("spades", 12)
      ),
      piles: [
        suitedPile("hearts", 5),
        suitedPile("spades", 4),
        suitedPile("diamonds", 6),
        suitedPile("clubs", 2),
      ],
      sequence: [
        { type: "c2c", source: { type: "solitaire", index: 2 }, dest: 0 },
        { type: "c2c", source: { type: "pounce" }, dest: 0 },
      ],
    }),
  },
  {
    id: "solitaire-waste-center-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 7,
    minPuzzleNumber: 10,
    tags: ["solitaire", "waste", "center", "mixed-source", "pounce"],
    build: ({ rng }) => {
      const targetValue = pickValue(rng, [4, 5, 6, 7, 8, 9]);
      const wasteValue = nextValue(targetValue);
      const pounceValue = nextValue(wasteValue);
      return {
        deckCard: card("clubs", 13),
        flippedDeck: [card("hearts", wasteValue)],
        pounceDeck: [card("clubs", 11), card("hearts", pounceValue)],
        stacks: [
          [card("diamonds", 13)],
          [card("clubs", 12)],
          [card("spades", nextValue(targetValue)), card("hearts", targetValue)],
          [card("spades", 11)],
        ],
        piles: [
          suitedPile("hearts", previousValue(targetValue)),
          suitedPile("spades", 5),
          suitedPile("diamonds", 3),
          suitedPile("clubs", 3),
        ],
        sequence: [
          { type: "c2c", source: { type: "solitaire", index: 2 }, dest: 0 },
          { type: "c2c", source: { type: "deck" }, dest: 0 },
          { type: "c2c", source: { type: "pounce" }, dest: 0 },
        ],
      };
    },
  },
  {
    id: "deck-shift-open-slot-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 8,
    minPuzzleNumber: 14,
    tags: [
      "deck",
      "solitaire",
      "stack-shift",
      "free-slot",
      "mixed-source",
      "pounce",
    ],
    build: ({ rng }) => {
      const movingValue = pickValue(rng, [3, 4, 5, 6, 7, 8, 9, 10]);
      const deckValue = nextValue(movingValue);
      const baseValue = nextValue(deckValue);
      return {
        deckCard: card("diamonds", 2),
        flippedDeck: [card("hearts", deckValue)],
        pounceDeck: [card("diamonds", 11), card("clubs", 13)],
        stacks: [
          [card("clubs", movingValue)],
          [card("spades", baseValue)],
          [card("spades", 13), card("diamonds", 12)],
          [card("hearts", 13), card("clubs", 12)],
        ],
        piles: [
          suitedPile("hearts", 2),
          suitedPile("spades", 4),
          suitedPile("diamonds", 5),
          suitedPile("clubs", 3),
        ],
        sequence: [
          { type: "c2s", source: "deck", dest: 1 },
          { type: "s2s", source: 0, dest: 1, count: 1 },
          { type: "c2s", source: "pounce", dest: 0 },
        ],
      };
    },
  },
  {
    id: "double-solitaire-waste-center-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 8,
    minPuzzleNumber: 14,
    tags: [
      "daily-hard",
      "solitaire",
      "waste",
      "center",
      "mixed-source",
      "pounce",
    ],
    build: ({ rng }) => {
      const firstValue = pickValue(rng, [3, 4, 5, 6, 7, 8, 9, 10]);
      const secondValue = nextValue(firstValue);
      const wasteValue = nextValue(secondValue);
      const pounceValue = nextValue(wasteValue);
      return {
        deckCard: card("diamonds", 13),
        flippedDeck: [card("clubs", wasteValue)],
        pounceDeck: [card("diamonds", 11), card("clubs", pounceValue)],
        stacks: [
          [card("hearts", nextValue(firstValue)), card("clubs", firstValue)],
          [card("clubs", secondValue)],
          [card("spades", 13), card("diamonds", 12)],
          [card("hearts", 10), card("spades", 9)],
        ],
        piles: [
          suitedPile("clubs", previousValue(firstValue)),
          suitedPile("hearts", 4),
          suitedPile("diamonds", 3),
          suitedPile("spades", 5),
        ],
        sequence: [
          { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 0 },
          { type: "c2c", source: { type: "solitaire", index: 1 }, dest: 0 },
          { type: "c2c", source: { type: "deck" }, dest: 0 },
          { type: "c2c", source: { type: "pounce" }, dest: 0 },
        ],
      };
    },
  },
  {
    id: "uncover-center-chain-pounce",
    kind: "uncover_center",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 7,
    minPuzzleNumber: 10,
    tags: ["uncover", "solitaire", "center", "pounce"],
    build: ({ rng }) => {
      const topValue = pickValue(rng, [3, 4, 5, 6, 7, 8, 9, 10]);
      const uncoveredValue = nextValue(topValue);
      const pounceValue = nextValue(uncoveredValue);
      return {
        deckCard: card("diamonds", 13),
        flippedDeck: [card("diamonds", 2)],
        pounceDeck: [card("spades", 11), card("hearts", pounceValue)],
        stacks: [
          [card("hearts", uncoveredValue), card("clubs", topValue)],
          [card("spades", 13), card("diamonds", 12)],
          [card("spades", 10), card("hearts", 9)],
          [card("clubs", 8), card("diamonds", 7)],
        ],
        piles: [
          suitedPile("clubs", previousValue(topValue)),
          suitedPile("hearts", topValue),
          suitedPile("diamonds", 3),
          suitedPile("spades", 5),
        ],
        sequence: [
          { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 0 },
          { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 1 },
          { type: "c2c", source: { type: "pounce" }, dest: 1 },
        ],
      };
    },
  },
  {
    id: "uncover-free-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    difficultyScore: 7,
    minPuzzleNumber: 12,
    tags: ["uncover", "free-slot", "center", "pounce"],
    build: () => ({
      deckCard: card("spades", 13),
      flippedDeck: [card("hearts", 12)],
      pounceDeck: [card("diamonds", 11), card("clubs", 12)],
      stacks: [
        [card("hearts", 6), card("clubs", 5)],
        [card("diamonds", 6)],
        [card("spades", 11)],
        [card("hearts", 9)],
      ],
      piles: [
        suitedPile("hearts", 5),
        suitedPile("spades", 4),
        suitedPile("diamonds", 3),
        suitedPile("clubs", 4),
      ],
      sequence: [
        { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 3 },
        { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 0 },
        { type: "c2s", source: "pounce", dest: 0 },
      ],
    }),
  },
];

export function getPounceRushTemplateCount(): number {
  return POUNCE_RUSH_TEMPLATES.length;
}

export function createPounceRushRunSeed(now = Date.now()): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `rush-${now.toString(36)}-${randomPart}`;
}

export function getPounceRushDailyKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createPounceRushDailySeed(
  dateKey = getPounceRushDailyKey()
): string {
  return `daily-${dateKey}`;
}

export function getPounceRushPuzzleSummary(
  puzzle: PounceRushPuzzle
): PounceRushPuzzleSummary {
  return {
    difficulty: puzzle.difficulty,
    difficultyScore: puzzle.difficultyScore,
    id: puzzle.id,
    kind: puzzle.kind,
    objective: puzzle.objective,
    puzzleNumber: puzzle.puzzleNumber,
    reportCode: puzzle.reportCode,
    seed: puzzle.seed,
    sequenceLength: puzzle.sequence.length,
    templateId: puzzle.templateId,
  };
}

export function getPounceRushMoveRejection(
  board: BoardState,
  puzzle: PounceRushPuzzle,
  stepIndex: number,
  move: Move
): PounceRushMoveRejection {
  if (move.type === "cycle" || move.type === "flip_deck") {
    return {
      title: "Stock is locked",
      detail: "Rush puzzles only use the visible waste card.",
    };
  }

  if (move.type === "move_field_stack") {
    return {
      title: "Nice try",
      detail: "This puzzle has a cleaner card play.",
    };
  }

  const expectedMove = puzzle.sequence[stepIndex];
  const subparMove = getCodifiedSubparMoveMessage(
    board,
    move,
    expectedMove
  );
  if (subparMove) {
    return subparMove;
  }

  if (isLegalPounceRushMove(board, move)) {
    return {
      title: "Nice try",
      detail: "There is a better move to unload a pounce card.",
    };
  }

  return {
    title: "Blocked",
  };
}

export function createPounceRushPuzzle({
  playerName,
  playerSessionId,
  puzzleNumber,
  seed,
  socketId,
}: CreatePounceRushPuzzleOptions): PounceRushPuzzle {
  const normalizedSeed = normalizePounceRushSeed(seed);
  const template = getSeededTemplate(normalizedSeed, puzzleNumber);
  let lastError: unknown = null;

  for (
    let attempt = 0;
    attempt < MAX_PUZZLE_GENERATION_ATTEMPTS;
    attempt++
  ) {
    const puzzleRng = createSeededRng(
      `${normalizedSeed}:puzzle:${puzzleNumber}:attempt:${attempt}`
    );
    const hiddenPlayerCount = getHiddenCenterOwnerCount(
      puzzleNumber,
      puzzleRng
    );
    const centerOwners = Array.from(
      { length: hiddenPlayerCount },
      (_, index) => index + 1
    );
    const setup = addCenterPileDecoys(
      assignCenterPileOwners(
        createGeneratedPuzzleSetup(template, puzzleRng, puzzleNumber),
        centerOwners
      ),
      getCenterPileTargetCount(puzzleNumber),
      centerOwners
    );
    const board = createPounceRushBoard({
      hiddenPlayerCount,
      playerName,
      playerSessionId,
      setup,
      socketId,
    });

    try {
      assertUniqueCards(board, template.id);
      assertSolitaireStacksAreValid(board, template.id);
      assertSolutionClearsPounce(board, setup.sequence, template.id);
      assertSequenceIsLegal(board, setup.sequence, template.id);
      assertNoUnexpectedLegalMoves(board, setup.sequence, template.id);

      return {
        board,
        difficulty: template.difficulty,
        difficultyScore: template.difficultyScore,
        id: `${template.id}:${puzzleNumber}`,
        kind: template.kind,
        objective: template.objective,
        puzzleNumber,
        reportCode: `${normalizedSeed}#${puzzleNumber + 1}`,
        seed: normalizedSeed,
        sequence: setup.sequence,
        templateId: template.id,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Pounce Rush puzzle ${template.id} could not be generated`);
}

export function isExpectedPounceRushMove(
  actual: Move,
  expected: Move | undefined
): boolean {
  if (!expected || actual.type !== expected.type) {
    return false;
  }

  switch (expected.type) {
    case "c2c":
      return (
        actual.type === "c2c" &&
        actual.dest === expected.dest &&
        centerSourcesMatch(actual.source, expected.source)
      );
    case "c2s":
      return (
        actual.type === "c2s" &&
        actual.source === expected.source &&
        actual.dest === expected.dest
      );
    case "s2s":
      return (
        actual.type === "s2s" &&
        actual.source === expected.source &&
        actual.dest === expected.dest &&
        actual.count === expected.count
      );
    case "cycle":
    case "flip_deck":
      return true;
    case "move_field_stack":
      return (
        actual.type === "move_field_stack" && actual.index === expected.index
      );
  }
}

export function isAcceptedPounceRushMove(
  board: BoardState,
  actual: Move,
  expected: Move | undefined
): boolean {
  if (isExpectedPounceRushMove(actual, expected)) {
    return true;
  }

  return isEquivalentPounceToSolitaireClear(board, actual, expected);
}

function isEquivalentPounceToSolitaireClear(
  board: BoardState,
  actual: Move,
  expected: Move | undefined
): boolean {
  if (
    expected?.type !== "c2s" ||
    expected.source !== "pounce" ||
    actual.type !== "c2s" ||
    actual.source !== "pounce" ||
    !isEmptySolitaireStack(board, expected.dest)
  ) {
    return false;
  }

  const boardCopy = deepClone(board);
  const startingPounceCount =
    boardCopy.players[PLAYER_INDEX]?.pounceDeck.length ?? 0;
  const result = executeMove(boardCopy, PLAYER_INDEX, actual);
  return (
    result != null &&
    boardCopy.players[PLAYER_INDEX].pounceDeck.length ===
      startingPounceCount - 1
  );
}

function centerSourcesMatch(
  actual: Extract<Move, { type: "c2c" }>["source"],
  expected: Extract<Move, { type: "c2c" }>["source"]
): boolean {
  if (actual.type !== expected.type) {
    return false;
  }

  if (actual.type !== "solitaire" || expected.type !== "solitaire") {
    return true;
  }

  return actual.index === expected.index;
}

function getSeededTemplate(
  seed: string,
  puzzleNumber: number
): PuzzleTemplate {
  const templates = getTemplatePool(seed, puzzleNumber);
  const templateCount = templates.length;
  const cycle = Math.floor(puzzleNumber / templateCount);
  const cycleIndex = puzzleNumber % templateCount;
  const order = shuffle(
    Array.from({ length: templateCount }, (_, index) => index),
    createSeededRng(`${seed}:template-cycle:${cycle}`)
  );
  return templates[order[cycleIndex]];
}

function getTemplatePool(seed: string, puzzleNumber: number): PuzzleTemplate[] {
  if (isDailyPuzzleSeed(seed)) {
    return getDailyPuzzleTemplatePool();
  }

  const [minDifficultyScore, maxDifficultyScore] =
    getTargetDifficultyRange(puzzleNumber);
  const eligibleTemplates = POUNCE_RUSH_TEMPLATES.filter(
    (template) => puzzleNumber >= (template.minPuzzleNumber ?? 0)
  );
  const rangedTemplates = eligibleTemplates.filter(
    (template) =>
      template.difficultyScore >= minDifficultyScore &&
      template.difficultyScore <= maxDifficultyScore
  );

  return rangedTemplates.length > 0 ? rangedTemplates : eligibleTemplates;
}

function isDailyPuzzleSeed(seed: string): boolean {
  return seed.startsWith("daily-") && !seed.startsWith("daily-rush-");
}

function getDailyPuzzleTemplatePool(): PuzzleTemplate[] {
  const hardDailyTemplates = POUNCE_RUSH_TEMPLATES.filter(
    (template) =>
      template.difficultyScore >= DAILY_PUZZLE_MIN_DIFFICULTY_SCORE &&
      template.tags.includes("daily-hard")
  );

  if (hardDailyTemplates.length > 0) {
    return hardDailyTemplates;
  }

  return POUNCE_RUSH_TEMPLATES.filter(
    (template) =>
      template.difficultyScore >= DAILY_PUZZLE_MIN_DIFFICULTY_SCORE
  );
}

function getTargetDifficultyRange(puzzleNumber: number): [number, number] {
  if (puzzleNumber < 4) {
    return [1, 3];
  }
  if (puzzleNumber < 10) {
    return [3, 6];
  }
  if (puzzleNumber < 18) {
    return [4, 8];
  }
  if (puzzleNumber < 24) {
    return [5, 8];
  }
  return [6, 10];
}

function normalizePounceRushSeed(seed: string | undefined): string {
  const normalized = seed?.trim();
  return normalized || DEFAULT_POUNCE_RUSH_SEED;
}

function createGeneratedPuzzleSetup(
  template: PuzzleTemplate,
  rng: () => number,
  puzzleNumber: number
): PuzzleSetup {
  const setup = addSolitaireStackDepth(
    template.build({ rng }),
    rng,
    puzzleNumber
  );
  return transformPuzzleSetup(setup, {
    pileMap: createIndexPermutation(rng, 4),
    stackMap: createIndexPermutation(rng, 4),
    suitMap: createSeededSuitMap(rng),
  });
}

function getHiddenCenterOwnerCount(
  puzzleNumber: number,
  rng: () => number
): number {
  return puzzleNumber >= 6 || rng() >= 0.42 ? 2 : 1;
}

function getCenterPileTargetCount(puzzleNumber: number): number {
  if (puzzleNumber >= 18) {
    return 8;
  }
  if (puzzleNumber >= 10) {
    return 6;
  }
  return 4;
}

function addCenterPileDecoys(
  setup: PuzzleSetup,
  targetCount: number,
  centerOwners: number[]
): PuzzleSetup {
  if (setup.piles.length >= targetCount) {
    return setup;
  }

  const piles = setup.piles.map((pile) =>
    pile.map((cardState) => ({
      ...cardState,
    }))
  );
  const usedSuitByOwner = new Map<number, Set<Suits>>();
  piles.forEach((pile) => {
    const topCard = getTopCard(pile);
    if (!topCard) {
      return;
    }
    const usedSuits = usedSuitByOwner.get(topCard.player) ?? new Set<Suits>();
    usedSuits.add(topCard.suit);
    usedSuitByOwner.set(topCard.player, usedSuits);
  });

  for (const owner of centerOwners) {
    const usedSuits = usedSuitByOwner.get(owner) ?? new Set<Suits>();
    for (const suit of SUITS) {
      if (piles.length >= targetCount) {
        break;
      }
      if (usedSuits.has(suit)) {
        continue;
      }
      piles.push(
        suitedPile(suit, 13).map((cardState) => ({
          ...cardState,
          player: owner,
        }))
      );
      usedSuits.add(suit);
    }
    usedSuitByOwner.set(owner, usedSuits);
  }

  return {
    ...setup,
    piles,
  };
}

function addSolitaireStackDepth(
  setup: PuzzleSetup,
  rng: () => number,
  puzzleNumber: number
): PuzzleSetup {
  const safeStackIndices = getSafeStackDepthIndices(setup.sequence);
  const targetExtraCards = puzzleNumber >= 18 ? 4 : puzzleNumber >= 8 ? 2 : 0;
  if (targetExtraCards === 0 || safeStackIndices.length === 0) {
    return setup;
  }

  const usedCards = getSetupCardKeys(setup);
  const stacks = setup.stacks.map((stack) =>
    stack.map((cardState) => ({ ...cardState }))
  ) as [CardState[], CardState[], CardState[], CardState[]];
  let addedCards = 0;
  const shuffledIndices = shuffle(safeStackIndices, rng);

  for (const stackIndex of shuffledIndices) {
    if (addedCards >= targetExtraCards) {
      break;
    }
    const desiredDepth = puzzleNumber >= 18 && rng() < 0.62 ? 3 : 2;
    while (
      addedCards < targetExtraCards &&
      stacks[stackIndex].length < desiredDepth
    ) {
      const addedCard = prependSolitaireDepthCard(
        stacks[stackIndex],
        usedCards
      );
      if (!addedCard) {
        break;
      }
      addedCards += 1;
    }
  }

  return {
    ...setup,
    stacks,
  };
}

function getSafeStackDepthIndices(sequence: Move[]): number[] {
  const unsafe = new Set<number>();
  sequence.forEach((move) => {
    if (move.type === "s2s") {
      unsafe.add(move.source);
    } else if (move.type === "c2c" && move.source.type === "solitaire") {
      unsafe.add(move.source.index);
    }
  });
  return [0, 1, 2, 3].filter((index) => !unsafe.has(index));
}

function prependSolitaireDepthCard(
  stack: CardState[],
  usedCards: Set<string>
): CardState | null {
  const bottomCard = stack[0];
  if (!bottomCard || bottomCard.value >= 13) {
    return null;
  }

  const nextValueForDepth = nextValue(bottomCard.value);
  const candidateSuit = SUITS.find(
    (suit) =>
      isBlackSuit(suit) !== isBlackSuit(bottomCard.suit) &&
      !usedCards.has(getCardKey(card(suit, nextValueForDepth)))
  );
  if (!candidateSuit) {
    return null;
  }

  const nextCard = card(candidateSuit, nextValueForDepth);
  stack.unshift(nextCard);
  usedCards.add(getCardKey(nextCard));
  return nextCard;
}

function getSetupCardKeys(setup: PuzzleSetup): Set<string> {
  const cards = [
    setup.deckCard,
    ...setup.flippedDeck,
    ...setup.pounceDeck,
    ...setup.stacks.flat(),
    ...setup.piles.flat(),
  ];
  return new Set(cards.map(getCardKey));
}

function createPounceRushBoard({
  hiddenPlayerCount,
  playerName,
  playerSessionId,
  setup,
  socketId,
}: {
  hiddenPlayerCount: number;
  playerName: string;
  playerSessionId: string;
  setup: PuzzleSetup;
  socketId: string;
}): BoardState {
  const board = createBoard(1 + hiddenPlayerCount);
  const player = board.players[PLAYER_INDEX];

  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.pouncer = undefined;
  board.roundStartsAt = undefined;
  board.ticksSinceMove = 0;
  board.piles = setup.piles;
  board.pileLocs = CENTER_PILE_LOCS.slice(0, setup.piles.length).map(
    ([x, y, rotation]) => [x, y, rotation]
  );

  player.name = playerName || "Player";
  player.socketId = socketId;
  player.playerSessionId = playerSessionId;
  player.isReadyForRound = false;
  player.isSpectating = false;
  player.isWaitingForDeal = false;
  player.disconnected = false;
  player.currentPoints = 0;
  player.deck = [setup.deckCard];
  player.flippedDeck = setup.flippedDeck;
  player.pounceDeck = setup.pounceDeck;
  player.scores = [];
  player.stacks = setup.stacks;
  player.totalPoints = 0;

  for (let playerIndex = 1; playerIndex < board.players.length; playerIndex++) {
    const hiddenPlayer = board.players[playerIndex];
    hiddenPlayer.name = `Puzzle deck ${playerIndex}`;
    hiddenPlayer.socketId = null;
    hiddenPlayer.playerSessionId = null;
    hiddenPlayer.isSpectating = true;
    hiddenPlayer.isWaitingForDeal = false;
    hiddenPlayer.deck = [];
    hiddenPlayer.flippedDeck = [];
    hiddenPlayer.pounceDeck = [];
    hiddenPlayer.stacks = [[], [], [], []];
    hiddenPlayer.currentPoints = 0;
    hiddenPlayer.scores = [];
    hiddenPlayer.totalPoints = 0;
  }

  return board;
}

function createSeededSuitMap(
  rng: () => number
): Record<Suits, Suits> {
  const sourceRed: Suits[] = ["hearts", "diamonds"];
  const sourceBlack: Suits[] = ["spades", "clubs"];
  const targetRed = shuffle<Suits>(["hearts", "diamonds"], rng);
  const targetBlack = shuffle<Suits>(["spades", "clubs"], rng);
  const swapColorGroups = rng() < 0.5;
  const redTargets = swapColorGroups ? targetBlack : targetRed;
  const blackTargets = swapColorGroups ? targetRed : targetBlack;

  return {
    hearts: redTargets[sourceRed.indexOf("hearts")],
    diamonds: redTargets[sourceRed.indexOf("diamonds")],
    spades: blackTargets[sourceBlack.indexOf("spades")],
    clubs: blackTargets[sourceBlack.indexOf("clubs")],
  };
}

function transformPuzzleSetup(
  setup: PuzzleSetup,
  transforms: {
    pileMap: number[];
    stackMap: number[];
    suitMap: Record<Suits, Suits>;
  }
): PuzzleSetup {
  const piles: CardState[][] = [];
  const stacks: CardState[][] = [];
  setup.piles.forEach((pile, pileIndex) => {
    piles[transforms.pileMap[pileIndex]] = pile.map((cardState) =>
      transformCard(cardState, transforms.suitMap)
    );
  });
  setup.stacks.forEach((stack, stackIndex) => {
    stacks[transforms.stackMap[stackIndex]] = stack.map((cardState) =>
      transformCard(cardState, transforms.suitMap)
    );
  });

  return {
    deckCard: transformCard(setup.deckCard, transforms.suitMap),
    flippedDeck: setup.flippedDeck.map((cardState) =>
      transformCard(cardState, transforms.suitMap)
    ),
    piles,
    pounceDeck: setup.pounceDeck.map((cardState) =>
      transformCard(cardState, transforms.suitMap)
    ),
    sequence: setup.sequence.map((move) => transformMove(move, transforms)),
    stacks: stacks as [CardState[], CardState[], CardState[], CardState[]],
  };
}

function transformMove(
  move: Move,
  transforms: {
    pileMap: number[];
    stackMap: number[];
  }
): Move {
  switch (move.type) {
    case "c2c":
      return {
        ...move,
        dest: transforms.pileMap[move.dest],
        source:
          move.source.type === "solitaire"
            ? {
                type: "solitaire",
                index: transforms.stackMap[move.source.index],
              }
            : move.source,
      };
    case "c2s":
      return {
        ...move,
        dest: transforms.stackMap[move.dest],
      };
    case "s2s":
      return {
        ...move,
        dest: transforms.stackMap[move.dest],
        source: transforms.stackMap[move.source],
      };
    case "cycle":
    case "flip_deck":
    case "move_field_stack":
      return deepClone(move);
  }
}

function assignCenterPileOwners(
  setup: PuzzleSetup,
  centerOwners: number[]
): PuzzleSetup {
  return {
    ...setup,
    piles: setup.piles.map((pile, pileIndex) =>
      pile.map((cardState) => ({
        ...cardState,
        player: centerOwners[pileIndex % centerOwners.length],
      }))
    ),
  };
}

function transformCard(
  cardState: CardState,
  suitMap: Record<Suits, Suits>
): CardState {
  return {
    ...cardState,
    suit: suitMap[cardState.suit],
  };
}

function assertSequenceIsLegal(
  board: BoardState,
  sequence: Move[],
  templateId: string
): void {
  const boardCopy = deepClone(board);
  sequence.forEach((move, index) => {
    const result = executeMove(boardCopy, PLAYER_INDEX, move);
    if (result == null) {
      throw new Error(
        `Pounce Rush puzzle ${templateId} has an illegal solution move at ${index}`
      );
    }
  });
}

function assertSolutionClearsPounce(
  board: BoardState,
  sequence: Move[],
  templateId: string
): void {
  const finalMove = sequence[sequence.length - 1];
  if (!isPounceClearingMove(finalMove)) {
    throw new Error(
      `Pounce Rush puzzle ${templateId} does not end by clearing pounce`
    );
  }

  const boardCopy = deepClone(board);
  const startingPounceCount = boardCopy.players[PLAYER_INDEX].pounceDeck.length;
  sequence.forEach((move) => {
    const result = executeMove(boardCopy, PLAYER_INDEX, move);
    if (result == null) {
      throw new Error(
        `Pounce Rush puzzle ${templateId} has an illegal pounce-clearing sequence`
      );
    }
  });

  if (boardCopy.players[PLAYER_INDEX].pounceDeck.length >= startingPounceCount) {
    throw new Error(
      `Pounce Rush puzzle ${templateId} did not clear a pounce card`
    );
  }
}

function assertSolitaireStacksAreValid(
  board: BoardState,
  templateId: string
): void {
  board.players[PLAYER_INDEX].stacks.forEach((stack, stackIndex) => {
    for (let index = 1; index < stack.length; index++) {
      if (!canStackOnSolitaire(stack[index], stack[index - 1])) {
        throw new Error(
          `Pounce Rush puzzle ${templateId} has invalid solitaire stack ${stackIndex}`
        );
      }
    }
  });
}

function assertNoUnexpectedLegalMoves(
  board: BoardState,
  sequence: Move[],
  templateId: string
): void {
  const boardCopy = deepClone(board);
  const puzzle: PounceRushPuzzle = {
    board: boardCopy,
    difficulty: "Warmup",
    difficultyScore: 1,
    id: templateId,
    kind: "combo",
    objective: getTemplateObjective(templateId),
    puzzleNumber: 0,
    reportCode: templateId,
    seed: DEFAULT_POUNCE_RUSH_SEED,
    sequence,
    templateId,
  };

  sequence.forEach((expectedMove, stepIndex) => {
    getLegalPounceRushMoves(boardCopy).forEach((move) => {
      if (isAcceptedPounceRushMove(boardCopy, move, expectedMove)) {
        return;
      }
      if (
        getCodifiedSubparMoveMessage(
          boardCopy,
          move,
          expectedMove
        )
      ) {
        return;
      }

      throw new Error(
        `Pounce Rush puzzle ${templateId} has an unclassified legal move at step ${stepIndex}: ${getMoveKey(
          move
        )}`
      );
    });

    const result = executeMove(boardCopy, PLAYER_INDEX, expectedMove);
    if (result == null) {
      throw new Error(
        `Pounce Rush puzzle ${templateId} became illegal at solution step ${stepIndex}`
      );
    }
  });
}

function getTemplateObjective(templateId: string): PounceRushObjective {
  return (
    POUNCE_RUSH_TEMPLATES.find((template) => template.id === templateId)
      ?.objective ?? "Unload a pounce card"
  );
}

function getCodifiedSubparMoveMessage(
  board: BoardState,
  move: Move,
  expectedMove: Move | undefined
): PounceRushMoveRejection | null {
  if (!expectedMove || !isLegalPounceRushMove(board, move)) {
    return null;
  }

  if (
    expectedMove.type === "c2c" &&
    expectedMove.source.type === "solitaire" &&
    move.type === "s2s" &&
    move.source === expectedMove.source.index
  ) {
    return {
      title: "Nice try",
      detail: "That card can play straight to the center.",
    };
  }

  if (
    expectedMove.type === "c2c" &&
    expectedMove.source.type === "solitaire" &&
    move.type === "s2s"
  ) {
    return {
      title: "Center first",
      detail: "The center play is available now.",
    };
  }

  if (
    expectedMove.type === "c2c" &&
    expectedMove.source.type === "deck" &&
    move.type !== "c2c"
  ) {
    return {
      title: "Waste first",
      detail: "The waste card connects your pounce card.",
    };
  }

  if (
    expectedMove.type === "c2s" &&
    expectedMove.source === "deck" &&
    !isExpectedPounceRushMove(move, expectedMove)
  ) {
    return {
      title: "Waste first",
      detail: "The waste card sets up the pounce clear.",
    };
  }

  if (
    expectedMove.type === "c2s" &&
    expectedMove.source === "pounce" &&
    !isAcceptedPounceRushMove(board, move, expectedMove)
  ) {
    return {
      title: "Use the pounce card",
      detail: isEmptySolitaireStack(board, expectedMove.dest)
        ? "The open slot is for unloading pounce."
        : "The pounce card is connected now.",
    };
  }

  if (
    expectedMove.type === "c2c" &&
    expectedMove.source.type === "pounce" &&
    ((move.type === "c2s" && move.source === "pounce") ||
      move.type !== "c2c")
  ) {
    return {
      title: "Center first",
      detail: "The pounce card has a stronger center play.",
    };
  }

  return null;
}

function isPounceClearingMove(move: Move | undefined): boolean {
  return (
    (move?.type === "c2c" && move.source.type === "pounce") ||
    (move?.type === "c2s" && move.source === "pounce")
  );
}

function isEmptySolitaireStack(board: BoardState, stackIndex: number): boolean {
  return board.players[PLAYER_INDEX]?.stacks[stackIndex]?.length === 0;
}

function getLegalPounceRushMoves(board: BoardState): Move[] {
  return getCandidatePounceRushMoves(board).filter((move) =>
    isLegalPounceRushMove(board, move)
  );
}

function getCandidatePounceRushMoves(board: BoardState): Move[] {
  const player = board.players[PLAYER_INDEX];
  if (!player) {
    return [];
  }

  const moves: Move[] = [];
  const centerSources: Extract<Move, { type: "c2c" }>["source"][] = [
    { type: "pounce" },
    { type: "deck" },
    ...player.stacks.map((_, sourceIndex) => ({
      type: "solitaire" as const,
      index: sourceIndex,
    })),
  ];
  centerSources.forEach((source) => {
    const sourceCard = getCenterSourceCard(board, source);
    if (!sourceCard) {
      return;
    }
    getReachableCenterPileIndices(board, sourceCard).forEach((dest) => {
      moves.push({ type: "c2c", source, dest });
    });
  });

  player.stacks.forEach((_, dest) => {
    moves.push({ type: "c2s", source: "pounce", dest });
    moves.push({ type: "c2s", source: "deck", dest });
  });

  player.stacks.forEach((sourceStack, source) => {
    player.stacks.forEach((_, dest) => {
      if (source === dest) {
        return;
      }
      for (let count = 1; count <= sourceStack.length; count++) {
        moves.push({ type: "s2s", source, dest, count });
      }
    });
  });

  return dedupeMoves(moves);
}

function getCenterSourceCard(
  board: BoardState,
  source: Extract<Move, { type: "c2c" }>["source"]
): CardState | undefined {
  const player = board.players[PLAYER_INDEX];
  if (!player) {
    return undefined;
  }
  if (source.type === "pounce") {
    return getTopCard(player.pounceDeck);
  }
  if (source.type === "deck") {
    return getTopCard(player.flippedDeck);
  }
  return getTopCard(player.stacks[source.index]);
}

function getReachableCenterPileIndices(
  board: BoardState,
  cardState: CardState
): number[] {
  return board.piles
    .map((pile, pileIndex) => ({ pile, pileIndex }))
    .filter(({ pile }) => {
      const topCard = getTopCard(pile);
      if (!topCard) {
        return cardState.value === 1;
      }
      return (
        cardState.value > 1 &&
        topCard.suit === cardState.suit &&
        topCard.value === cardState.value - 1
      );
    })
    .map(({ pileIndex }) => pileIndex);
}

function getTopCard(cards: CardState[]): CardState | undefined {
  return cards[cards.length - 1];
}

function isLegalPounceRushMove(board: BoardState, move: Move): boolean {
  if (
    move.type === "cycle" ||
    move.type === "flip_deck" ||
    move.type === "move_field_stack"
  ) {
    return false;
  }

  return executeMove(deepClone(board), PLAYER_INDEX, move) != null;
}

function dedupeMoves(moves: Move[]): Move[] {
  const seen = new Set<string>();
  return moves.filter((move) => {
    const key = getMoveKey(move);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getMoveKey(move: Move): string {
  switch (move.type) {
    case "c2c":
      return `c2c:${getCenterSourceKey(move.source)}:${move.dest}`;
    case "c2s":
      return `c2s:${move.source}:${move.dest}`;
    case "s2s":
      return `s2s:${move.source}:${move.dest}:${move.count}`;
    case "cycle":
    case "flip_deck":
      return move.type;
    case "move_field_stack":
      return `move_field_stack:${move.index}`;
  }
}

function getCenterSourceKey(
  source: Extract<Move, { type: "c2c" }>["source"]
): string {
  return source.type === "solitaire"
    ? `solitaire:${source.index}`
    : source.type;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const item = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = item;
  }
  return result;
}

function createIndexPermutation(rng: () => number, length: number): number[] {
  const shuffled = shuffle(
    Array.from({ length }, (_, index) => index),
    rng
  );
  const map: number[] = [];
  shuffled.forEach((originalIndex, nextIndex) => {
    map[originalIndex] = nextIndex;
  });
  return map;
}

function createSeededRng(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assertUniqueCards(board: BoardState, templateId: string): void {
  const seen = new Set<string>();
  const cards = board.players.flatMap((player) => [
    ...player.deck,
    ...player.flippedDeck,
    ...player.pounceDeck,
    ...player.stacks.flat(),
  ]);
  cards.push(...board.piles.flat());

  cards.forEach((cardState) => {
    const key = getCardKey(cardState);
    if (seen.has(key)) {
      throw new Error(`Pounce Rush puzzle ${templateId} duplicates ${key}`);
    }
    seen.add(key);
  });
}

function getCardKey(cardState: CardState): string {
  return `${cardState.player}:${cardState.suit}:${cardState.value}`;
}

function canStackOnSolitaire(cardState: CardState, lowerCard: CardState): boolean {
  return (
    lowerCard.value === cardState.value + 1 &&
    isBlackSuit(lowerCard.suit) !== isBlackSuit(cardState.suit)
  );
}

function isBlackSuit(suit: Suits): boolean {
  return suit === "clubs" || suit === "spades";
}

function card(suit: Suits, value: Values): CardState {
  return {
    player: PLAYER_INDEX,
    suit,
    value,
  };
}

function pickValue(rng: () => number, values: number[]): Values {
  return values[Math.floor(rng() * values.length)] as Values;
}

function previousValue(value: Values): Values {
  return (value - 1) as Values;
}

function nextValue(value: Values): Values {
  return (value + 1) as Values;
}

function suitedPile(suit: Suits, topValue: Values): CardState[] {
  const cards: CardState[] = [];
  for (let value = 1; value <= topValue; value++) {
    cards.push(card(suit, value as Values));
  }
  return cards;
}

function singleStacks(
  first: CardState,
  second: CardState,
  third: CardState,
  fourth: CardState
): [CardState[], CardState[], CardState[], CardState[]] {
  return [[first], [second], [third], [fourth]];
}
