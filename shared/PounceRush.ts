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

export type PounceRushObjective = "Unload a pounce card" | "Make a center play";

export type PounceRushPuzzle = {
  board: BoardState;
  difficulty: "Warmup" | "Sharp" | "Combo";
  id: string;
  kind: PounceRushPuzzleKind;
  objective: PounceRushObjective;
  sequence: Move[];
};

export type CreatePounceRushPuzzleOptions = {
  playerName: string;
  playerSessionId: string;
  puzzleNumber: number;
  socketId: string;
};

type PuzzleTemplate = {
  build: () => PuzzleSetup;
  difficulty: PounceRushPuzzle["difficulty"];
  id: string;
  kind: PounceRushPuzzleKind;
  objective: PounceRushObjective;
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
const CENTER_PILE_LOCS: [number, number, number][] = [
  [0.13, 0.16, 0.02],
  [0.66, 0.18, 0.31],
  [0.21, 0.64, 0.68],
  [0.73, 0.62, 0.47],
];

const POUNCE_RUSH_TEMPLATES: PuzzleTemplate[] = [
  {
    id: "pounce-center-scan",
    kind: "pounce_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
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
    objective: "Make a center play",
    difficulty: "Warmup",
    build: () => ({
      deckCard: card("spades", 13),
      flippedDeck: [card("diamonds", 4)],
      pounceDeck: [card("clubs", 5), card("hearts", 9)],
      stacks: singleStacks(
        card("diamonds", 9),
        card("clubs", 12),
        card("spades", 6),
        card("hearts", 8)
      ),
      piles: [
        suitedPile("hearts", 3),
        suitedPile("spades", 5),
        suitedPile("diamonds", 2),
        suitedPile("clubs", 4),
      ],
      sequence: [
        { type: "c2c", source: { type: "solitaire", index: 2 }, dest: 1 },
      ],
    }),
  },
  {
    id: "waste-ace-center",
    kind: "waste_center",
    objective: "Make a center play",
    difficulty: "Warmup",
    build: () => ({
      deckCard: card("clubs", 13),
      flippedDeck: [card("diamonds", 1)],
      pounceDeck: [card("spades", 12), card("clubs", 10)],
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
      sequence: [{ type: "c2c", source: { type: "deck" }, dest: 3 }],
    }),
  },
  {
    id: "free-slot-pounce",
    kind: "free_slot",
    objective: "Unload a pounce card",
    difficulty: "Sharp",
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
    id: "uncover-center",
    kind: "uncover_center",
    objective: "Make a center play",
    difficulty: "Sharp",
    build: () => ({
      deckCard: card("hearts", 13),
      flippedDeck: [card("hearts", 12)],
      pounceDeck: [card("clubs", 11), card("clubs", 10)],
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
      ],
    }),
  },
  {
    id: "advance-center-for-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
    build: () => ({
      deckCard: card("diamonds", 13),
      flippedDeck: [card("clubs", 3)],
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
    id: "uncover-free-pounce",
    kind: "combo",
    objective: "Unload a pounce card",
    difficulty: "Combo",
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
        { type: "s2s", source: 0, dest: 1, count: 1 },
        { type: "c2c", source: { type: "solitaire", index: 0 }, dest: 0 },
        { type: "c2s", source: "pounce", dest: 0 },
      ],
    }),
  },
];

export function getPounceRushTemplateCount(): number {
  return POUNCE_RUSH_TEMPLATES.length;
}

export function createPounceRushPuzzle({
  playerName,
  playerSessionId,
  puzzleNumber,
  socketId,
}: CreatePounceRushPuzzleOptions): PounceRushPuzzle {
  const template =
    POUNCE_RUSH_TEMPLATES[puzzleNumber % POUNCE_RUSH_TEMPLATES.length];
  const setup = template.build();
  const board = createBoard(1);
  const player = board.players[PLAYER_INDEX];

  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.pouncer = undefined;
  board.roundStartsAt = undefined;
  board.ticksSinceMove = 0;
  board.piles = setup.piles;
  board.pileLocs = CENTER_PILE_LOCS.map(([x, y, rotation]) => [
    x,
    y,
    rotation,
  ]);

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

  assertUniqueCards(board, template.id);
  assertSequenceIsLegal(board, setup.sequence, template.id);

  return {
    board,
    difficulty: template.difficulty,
    id: `${template.id}:${puzzleNumber}`,
    kind: template.kind,
    objective: template.objective,
    sequence: setup.sequence,
  };
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
    const key = `${cardState.player}:${cardState.suit}:${cardState.value}`;
    if (seen.has(key)) {
      throw new Error(`Pounce Rush puzzle ${templateId} duplicates ${key}`);
    }
    seen.add(key);
  });
}

function card(suit: Suits, value: Values): CardState {
  return {
    player: PLAYER_INDEX,
    suit,
    value,
  };
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
