import assert from "node:assert/strict";

import type { CardState } from "./GameUtils";
import type { Move } from "./MoveHandler";
import deepClone from "./deepClone";
import { executeMove } from "./MoveHandler";
import {
  createPounceRushDailySeed,
  createPounceRushPuzzle,
  getPounceRushTemplateCount,
  isAcceptedPounceRushMove,
} from "./PounceRush";

const seeds = [
  "qa-seed",
  "rush-test",
  "connector-coverage",
  createPounceRushDailySeed("2026-05-31"),
  "",
];
const reportedPuzzles = [
  ["rush-mptd4scm-356y3u", 3],
  ["rush-mptdapm6-5h7eji", 3],
  ["rush-mptdcnd8-rugesw", 9],
] as const;
const puzzlesPerSeed = getPounceRushTemplateCount() * 36;
const observedTemplateIds = new Set<string>();
let deckConnectorCount = 0;
let deckShiftConnectorCount = 0;
let centerRunCount = 0;
let uncoverCenterChainCount = 0;
let deepStackCount = 0;
let extraCenterPileCount = 0;
let solitaireConnectorCount = 0;
let tallStackMoveCount = 0;
const observedSequenceValues = new Set<number>();

const firstRushPuzzle = createPounceRushPuzzle({
  playerName: "Player",
  playerSessionId: "session",
  puzzleNumber: 0,
  seed: "difficulty-ramp",
  socketId: "socket",
});
assert.equal(firstRushPuzzle.difficulty, "Warmup");

const dailyPuzzle = createPounceRushPuzzle({
  playerName: "Player",
  playerSessionId: "session",
  puzzleNumber: 0,
  seed: createPounceRushDailySeed("2026-05-31"),
  socketId: "socket",
});
assert.equal(dailyPuzzle.difficulty, "Combo");

for (const seed of seeds) {
  for (let puzzleNumber = 0; puzzleNumber < puzzlesPerSeed; puzzleNumber++) {
    const puzzle = createPounceRushPuzzle({
      playerName: "Player",
      playerSessionId: "session",
      puzzleNumber,
      seed,
      socketId: "socket",
    });

    observedTemplateIds.add(puzzle.templateId);
    assert.ok(puzzle.sequence.length > 0, "puzzles need a solution sequence");
    assert.equal(puzzle.objective, "Unload a pounce card");
    assert.equal(puzzle.board.players[0].deck.length, 1);
    assert.equal(puzzle.board.players[0].flippedDeck.length, 1);
    assert.equal(puzzle.board.pileLocs.length, puzzle.board.piles.length);
    assertUniqueCards(getAllCards(puzzle.board));
    assertValidSolitaireStacks(puzzle.board.players[0].stacks);
    assertPounceClearingSequence(puzzle.sequence);
    recordSequenceValues(puzzle.board, puzzle.sequence, observedSequenceValues);

    if (hasDeckConnectorLine(puzzle.sequence)) {
      deckConnectorCount += 1;
    }
    if (hasDeckShiftConnectorLine(puzzle.sequence)) {
      deckShiftConnectorCount += 1;
    }
    if (hasCenterRunLine(puzzle.sequence)) {
      centerRunCount += 1;
    }
    if (hasUncoverCenterChainLine(puzzle.sequence)) {
      uncoverCenterChainCount += 1;
    }
    if (hasSolitaireConnectorLine(puzzle.sequence)) {
      solitaireConnectorCount += 1;
    }
    if (puzzle.sequence.some((move) => move.type === "s2s" && move.count > 1)) {
      tallStackMoveCount += 1;
    }
    if (puzzle.board.players[0].stacks.some((stack) => stack.length >= 3)) {
      deepStackCount += 1;
    }
    if (puzzle.board.piles.length > 4) {
      extraCenterPileCount += 1;
    }
  }
}

assert.equal(observedTemplateIds.size, getPounceRushTemplateCount());
assert.ok(deckConnectorCount > 0, "expected deck-to-solitaire pounce puzzles");
assert.ok(
  deckShiftConnectorCount > 0,
  "expected deck-to-solitaire then solitaire-to-solitaire pounce puzzles"
);
assert.ok(centerRunCount > 0, "expected strung-together center-run puzzles");
assert.ok(
  uncoverCenterChainCount > 0,
  "expected uncover-center chain pounce puzzles"
);
assert.ok(
  solitaireConnectorCount > 0,
  "expected solitaire-to-solitaire pounce puzzles"
);
assert.ok(tallStackMoveCount > 0, "expected taller moving-stack puzzles");
assert.ok(deepStackCount > 0, "expected deeper solitaire stacks");
assert.ok(extraCenterPileCount > 0, "expected later puzzles with extra piles");
assert.ok(
  observedSequenceValues.size >= 10,
  "expected broader sequence card values"
);
const sequenceValues = Array.from(observedSequenceValues);
assert.ok(Math.min(...sequenceValues) <= 4);
assert.ok(Math.max(...sequenceValues) >= 12);
assertPounceTuckAlternateAccepted();

for (const [seed, puzzleNumber] of reportedPuzzles) {
  const puzzle = createPounceRushPuzzle({
    playerName: "Player",
    playerSessionId: "session",
    puzzleNumber,
    seed,
    socketId: "socket",
  });

  assert.equal(
    puzzle.objective,
    "Unload a pounce card",
    `${puzzle.reportCode} should not be a pure center-play objective`
  );
  assertValidSolitaireStacks(puzzle.board.players[0].stacks);
  assertPounceClearingSequence(puzzle.sequence);
}

console.log(
  `Validated ${seeds.length * puzzlesPerSeed} Pounce Rush puzzles across ` +
    `${observedTemplateIds.size} templates.`
);

function hasDeckConnectorLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const nextMove = sequence[index + 1];
    return (
      move.type === "c2s" &&
      move.source === "deck" &&
      nextMove?.type === "c2s" &&
      nextMove.source === "pounce"
    );
  });
}

function hasDeckShiftConnectorLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const nextMove = sequence[index + 1];
    const finalMove = sequence[index + 2];
    return (
      move.type === "c2s" &&
      move.source === "deck" &&
      nextMove?.type === "s2s" &&
      finalMove?.type === "c2s" &&
      finalMove.source === "pounce"
    );
  });
}

function hasCenterRunLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const secondMove = sequence[index + 1];
    const thirdMove = sequence[index + 2];
    const finalMove = sequence[index + 3];
    return (
      move.type === "c2c" &&
      move.source.type === "solitaire" &&
      secondMove?.type === "c2c" &&
      secondMove.source.type === "solitaire" &&
      thirdMove?.type === "c2c" &&
      thirdMove.source.type === "deck" &&
      finalMove?.type === "c2c" &&
      finalMove.source.type === "pounce"
    );
  });
}

function hasUncoverCenterChainLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const secondMove = sequence[index + 1];
    const finalMove = sequence[index + 2];
    return (
      move.type === "c2c" &&
      move.source.type === "solitaire" &&
      secondMove?.type === "c2c" &&
      secondMove.source.type === "solitaire" &&
      secondMove.source.index === move.source.index &&
      finalMove?.type === "c2c" &&
      finalMove.source.type === "pounce"
    );
  });
}

function hasSolitaireConnectorLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const nextMove = sequence[index + 1];
    return (
      move.type === "s2s" &&
      nextMove?.type === "c2s" &&
      nextMove.source === "pounce"
    );
  });
}

function recordSequenceValues(
  board: ReturnType<typeof createPounceRushPuzzle>["board"],
  sequence: Move[],
  values: Set<number>
): void {
  const boardCopy = deepClone(board);
  sequence.forEach((move) => {
    const sourceCard = getMoveSourceCard(boardCopy, move);
    if (sourceCard) {
      values.add(sourceCard.value);
    }
    assert.notEqual(executeMove(boardCopy, 0, move), null);
  });
}

function getMoveSourceCard(
  board: ReturnType<typeof createPounceRushPuzzle>["board"],
  move: Move
): CardState | null {
  const player = board.players[0];
  switch (move.type) {
    case "c2c":
      if (move.source.type === "pounce") {
        return player.pounceDeck[player.pounceDeck.length - 1] ?? null;
      }
      if (move.source.type === "deck") {
        return player.flippedDeck[player.flippedDeck.length - 1] ?? null;
      }
      return player.stacks[move.source.index]?.[
        player.stacks[move.source.index].length - 1
      ] ?? null;
    case "c2s":
      return move.source === "pounce"
        ? player.pounceDeck[player.pounceDeck.length - 1] ?? null
        : player.flippedDeck[player.flippedDeck.length - 1] ?? null;
    case "s2s":
      return player.stacks[move.source]?.[
        player.stacks[move.source].length - move.count
      ] ?? null;
    case "cycle":
    case "flip_deck":
    case "move_field_stack":
      return null;
  }
}

function assertPounceTuckAlternateAccepted(): void {
  const puzzle = createPounceRushPuzzle({
    playerName: "Player",
    playerSessionId: "session",
    puzzleNumber: 25,
    seed: "qa-seed",
    socketId: "socket",
  });
  const boardCopy = deepClone(puzzle.board);
  for (let stepIndex = 0; stepIndex < puzzle.sequence.length; stepIndex++) {
    const expectedMove = puzzle.sequence[stepIndex];
    if (
      expectedMove.type === "c2s" &&
      expectedMove.source === "pounce" &&
      boardCopy.players[0].stacks[expectedMove.dest].length === 0
    ) {
      const alternateMove: Move = {
        type: "c2s",
        source: "pounce",
        dest: 0,
      };
      assert.notEqual(executeMove(deepClone(boardCopy), 0, alternateMove), null);
      assert.equal(
        isAcceptedPounceRushMove(boardCopy, alternateMove, expectedMove),
        true
      );
      return;
    }
    assert.notEqual(executeMove(boardCopy, 0, expectedMove), null);
  }

  assert.fail("expected a pounce tuck alternate regression puzzle");
}

function getAllCards(board: ReturnType<typeof createPounceRushPuzzle>["board"]) {
  const cards = board.players.flatMap((player) => [
    ...player.deck,
    ...player.flippedDeck,
    ...player.pounceDeck,
    ...player.stacks.flat(),
  ]);
  cards.push(...board.piles.flat());
  return cards;
}

function assertUniqueCards(cards: CardState[]): void {
  const seen = new Set<string>();
  cards.forEach((card) => {
    const key = `${card.player}:${card.suit}:${card.value}`;
    assert.equal(seen.has(key), false, `duplicate card ${key}`);
    seen.add(key);
  });
}

function assertPounceClearingSequence(sequence: Move[]): void {
  const finalMove = sequence[sequence.length - 1];
  assert.ok(
    (finalMove?.type === "c2c" && finalMove.source.type === "pounce") ||
      (finalMove?.type === "c2s" && finalMove.source === "pounce"),
    "expected solution to end by clearing a pounce card"
  );
}

function assertValidSolitaireStacks(stacks: CardState[][]): void {
  stacks.forEach((stack, stackIndex) => {
    for (let index = 1; index < stack.length; index++) {
      const card = stack[index];
      const lowerCard = stack[index - 1];
      assert.equal(
        lowerCard.value,
        card.value + 1,
        `invalid stack value at ${stackIndex}:${index}`
      );
      assert.notEqual(
        isBlackSuit(lowerCard),
        isBlackSuit(card),
        `invalid stack color at ${stackIndex}:${index}`
      );
    }
  });
}

function isBlackSuit(card: CardState): boolean {
  return card.suit === "clubs" || card.suit === "spades";
}
