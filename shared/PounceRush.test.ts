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
const puzzlesPerSeed = getPounceRushTemplateCount() * 36;
const observedTemplateIds = new Set<string>();
let deckConnectorCount = 0;
let solitaireConnectorCount = 0;
let tallStackMoveCount = 0;

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
    assert.equal(puzzle.board.players[0].deck.length, 1);
    assert.equal(puzzle.board.players[0].flippedDeck.length, 1);
    assertUniqueCards(getAllCards(puzzle.board));

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
