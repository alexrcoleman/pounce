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
  id: string;
  kind: PounceRushPuzzleKind;
  objective: PounceRushObjective;
};

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
const MAX_PUZZLE_GENERATION_ATTEMPTS = 24;
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
    id: "pounce-center-generated",
    kind: "pounce_center",
    objective: "Unload a pounce card",
    difficulty: "Warmup",
    build: ({ rng }) => {
      const targetValue = pickValue(rng, [4, 5, 7, 8, 9, 10]);
      return {
        deckCard: card("spades", 13),
        flippedDeck: [card("clubs", 12)],
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
    objective: "Make a center play",
    difficulty: "Warmup",
    build: ({ rng }) => {
      const targetValue = pickValue(rng, [4, 5, 7, 8, 9, 10]);
      return {
        deckCard: card("spades", 13),
        flippedDeck: [card("diamonds", 12)],
        pounceDeck: [card("clubs", 6), card("hearts", 13)],
        stacks: singleStacks(
          card("diamonds", 13),
          card("clubs", 12),
          card("hearts", targetValue),
          card("spades", 11)
        ),
        piles: [
          suitedPile("hearts", previousValue(targetValue)),
          suitedPile("spades", 5),
          suitedPile("diamonds", 3),
          suitedPile("clubs", 3),
        ],
        sequence: [
          { type: "c2c", source: { type: "solitaire", index: 2 }, dest: 0 },
        ],
      };
    },
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
    id: "waste-center-generated",
    kind: "waste_center",
    objective: "Make a center play",
    difficulty: "Warmup",
    build: ({ rng }) => {
      const targetValue = pickValue(rng, [4, 5, 7, 8, 9, 10]);
      return {
        deckCard: card("clubs", 13),
        flippedDeck: [card("hearts", targetValue)],
        pounceDeck: [card("spades", 12), card("clubs", 11)],
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
        sequence: [{ type: "c2c", source: { type: "deck" }, dest: 0 }],
      };
    },
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
    id: "free-slot-pounce-generated",
    kind: "free_slot",
    objective: "Unload a pounce card",
    difficulty: "Sharp",
    build: ({ rng }) => {
      const movingValue = pickValue(rng, [5, 6, 7, 8]);
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
    puzzle,
    stepIndex,
    move,
    expectedMove
  );
  if (subparMove) {
    return subparMove;
  }

  if (isLegalPounceRushMove(board, move)) {
    return {
      title: "Nice try",
      detail:
        puzzle.objective === "Unload a pounce card"
          ? "There is a better move to unload a pounce card."
          : "There is a more direct center play.",
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
    const hiddenPlayerCount = puzzleRng() < 0.42 ? 1 : 2;
    const centerOwners = Array.from(
      { length: hiddenPlayerCount },
      (_, index) => index + 1
    );
    const setup = assignCenterPileOwners(
      createGeneratedPuzzleSetup(template, puzzleRng),
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
      assertSequenceIsLegal(board, setup.sequence, template.id);
      assertNoUnexpectedLegalMoves(board, setup.sequence, template.id);

      return {
        board,
        difficulty: template.difficulty,
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
  const templateCount = POUNCE_RUSH_TEMPLATES.length;
  const cycle = Math.floor(puzzleNumber / templateCount);
  const cycleIndex = puzzleNumber % templateCount;
  const order = shuffle(
    Array.from({ length: templateCount }, (_, index) => index),
    createSeededRng(`${seed}:template-cycle:${cycle}`)
  );
  return POUNCE_RUSH_TEMPLATES[order[cycleIndex]];
}

function normalizePounceRushSeed(seed: string | undefined): string {
  const normalized = seed?.trim();
  return normalized || DEFAULT_POUNCE_RUSH_SEED;
}

function createGeneratedPuzzleSetup(
  template: PuzzleTemplate,
  rng: () => number
): PuzzleSetup {
  return transformPuzzleSetup(template.build({ rng }), {
    pileMap: createIndexPermutation(rng, 4),
    stackMap: createIndexPermutation(rng, 4),
    suitMap: createSeededSuitMap(rng),
  });
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

function assertNoUnexpectedLegalMoves(
  board: BoardState,
  sequence: Move[],
  templateId: string
): void {
  const boardCopy = deepClone(board);
  const puzzle: PounceRushPuzzle = {
    board: boardCopy,
    difficulty: "Warmup",
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
      if (isExpectedPounceRushMove(move, expectedMove)) {
        return;
      }
      if (
        getCodifiedSubparMoveMessage(
          boardCopy,
          puzzle,
          stepIndex,
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
      ?.objective ?? "Make a center play"
  );
}

function getCodifiedSubparMoveMessage(
  board: BoardState,
  puzzle: Pick<PounceRushPuzzle, "objective">,
  _stepIndex: number,
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
    expectedMove.type === "c2s" &&
    expectedMove.source === "pounce" &&
    isEmptySolitaireStack(board, expectedMove.dest) &&
    move.type !== "c2c" &&
    !isExpectedPounceRushMove(move, expectedMove)
  ) {
    return {
      title: "Use the pounce card",
      detail: "The open slot is for unloading pounce.",
    };
  }

  if (
    expectedMove.type === "c2c" &&
    expectedMove.source.type === "pounce" &&
    ((move.type === "c2s" && move.source === "pounce") ||
      (isMoveToAnyEmptySolitaireStack(board, move) && move.type !== "c2c"))
  ) {
    return {
      title: "Center first",
      detail: "The pounce card has a stronger center play.",
    };
  }

  if (
    puzzle.objective === "Unload a pounce card" &&
    move.type === "c2c" &&
    !isExpectedPounceRushMove(move, expectedMove)
  ) {
    return {
      title: "Nice try",
      detail: "There is a better move to unload a pounce card.",
    };
  }

  return null;
}

function isMoveToAnyEmptySolitaireStack(
  board: BoardState,
  move: Move
): boolean {
  return (
    (move.type === "c2s" || move.type === "s2s") &&
    isEmptySolitaireStack(board, move.dest)
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
