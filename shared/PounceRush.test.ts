import assert from "node:assert/strict";

import type { CardState } from "./GameUtils";
import type { Move } from "./MoveHandler";
import {
  createPounceRushDailySeed,
  createPounceRushPuzzle,
  getPounceRushTemplateCount,
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
let solitaireConnectorCount = 0;
let tallStackMoveCount = 0;

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
    assertUniqueCards(getAllCards(puzzle.board));
    assertValidSolitaireStacks(puzzle.board.players[0].stacks);
    assertPounceClearingSequence(puzzle.sequence);

    if (hasDeckConnectorLine(puzzle.sequence)) {
      deckConnectorCount += 1;
    }
    if (hasSolitaireConnectorLine(puzzle.sequence)) {
      solitaireConnectorCount += 1;
    }
    if (puzzle.sequence.some((move) => move.type === "s2s" && move.count > 1)) {
      tallStackMoveCount += 1;
    }
  }
}

assert.equal(observedTemplateIds.size, getPounceRushTemplateCount());
assert.ok(deckConnectorCount > 0, "expected deck-to-solitaire pounce puzzles");
assert.ok(
  solitaireConnectorCount > 0,
  "expected solitaire-to-solitaire pounce puzzles"
);
assert.ok(tallStackMoveCount > 0, "expected taller moving-stack puzzles");

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
