import assert from "node:assert/strict";

import type { CardState } from "./GameUtils";
import type { Move } from "./MoveHandler";
import deepClone from "./deepClone";
import { executeMove } from "./MoveHandler";
import {
  createPounceRushDailySeed,
  createPounceRushPuzzle,
  getPounceRushTemplateCount,
  getPounceRushTemplateOptions,
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
const templateOptions = getPounceRushTemplateOptions();
const observedTemplateIds = new Set<string>();
const valueVarietyTemplateIds = [
  "pounce-center-scan",
  "solitaire-center-scan",
  "waste-center-pounce",
  "free-slot-pounce",
  "deck-connector-pounce",
  "tall-free-slot-pounce",
  "uncover-center",
  "waste-solitaire-center-pounce",
  "waste-double-solitaire-center-pounce",
  "waste-center-uncover-pounce",
  "waste-center-uncover-free-pounce",
  "uncover-free-pounce",
];
const firstMoveValuesByTemplate = new Map<string, Set<number>>(
  valueVarietyTemplateIds.map((templateId) => [templateId, new Set<number>()])
);
let deckConnectorCount = 0;
let deckShiftConnectorCount = 0;
let deckRevealCenterCount = 0;
let centerRunCount = 0;
let uncoverCenterChainCount = 0;
let uncoverTwoCenterCount = 0;
let deepStackCount = 0;
let extraCenterPileCount = 0;
let solitaireConnectorCount = 0;
let stackShuttleCount = 0;
let shuttleBackFreeSlotCount = 0;
let tallStackMoveCount = 0;
let wasteFirstCenterCount = 0;
let wasteFirstDoubleCenterCount = 0;
let wasteUncoverCenterCount = 0;
let wasteUncoverFreeSlotCount = 0;
const observedSequenceValues = new Set<number>();
const deckStackRevealDestDepths = new Set<number>();
const deckStackRevealWasteValues = new Set<number>();
const freeSlotPounceValues = new Set<number>();
const tallFreeSlotDestDepths = new Set<number>();
const uncoverTwoCenterValues = new Set<number>();
const wasteDoubleNonEmptyPileCounts = new Set<number>();
let shuttleUncoverFreeSlotCount = 0;

const firstRushPuzzle = createPounceRushPuzzle({
  playerName: "Player",
  playerSessionId: "session",
  puzzleNumber: 0,
  seed: "difficulty-ramp",
  socketId: "socket",
});
assert.equal(firstRushPuzzle.difficulty, "Warmup");
assert.ok(firstRushPuzzle.difficultyScore <= 3);

const dailyPuzzle = createPounceRushPuzzle({
  playerName: "Player",
  playerSessionId: "session",
  puzzleNumber: 0,
  seed: createPounceRushDailySeed("2026-05-31"),
  socketId: "socket",
});
assert.equal(dailyPuzzle.difficulty, "Combo");
assert.ok(dailyPuzzle.difficultyScore >= 8);
assert.ok(dailyPuzzle.sequence.length >= 4);
assertDifficultyRange("difficulty-ramp", 0, 1, 3);
assertDifficultyRange("difficulty-ramp", 5, 3, 6);
assertDifficultyRange("difficulty-ramp", 12, 4, 8);
assertDifficultyRange("difficulty-ramp", 20, 5, 8);
assertDifficultyRange("difficulty-ramp", 28, 6, 10);
assert.equal(templateOptions.length, getPounceRushTemplateCount());
assert.equal(
  new Set(templateOptions.map((option) => option.id)).size,
  templateOptions.length
);
assert.equal(getTemplateOption("pounce-center-scan")?.difficultyScore, 1);
assert.equal(getTemplateOption("solitaire-center-scan")?.difficultyScore, 3);
assert.equal(getTemplateOption("free-slot-pounce")?.difficultyScore, 4);
[
  "advance-center-for-pounce",
  "free-slot-pounce-generated",
  "pounce-center-generated",
  "solitaire-center-generated",
  "uncover-connector-pounce",
  "waste-center-generated",
].forEach((templateId) => {
  assert.equal(
    getTemplateOption(templateId),
    undefined,
    `${templateId} should be folded into its non-generated archetype`
  );
});

for (const option of templateOptions) {
  const puzzle = createPounceRushPuzzle({
    playerName: "Player",
    playerSessionId: "session",
    puzzleNumber: 0,
    seed: "template-picker",
    socketId: "socket",
    templateId: option.id,
  });
  assert.equal(puzzle.templateId, option.id);
  assert.equal(puzzle.kind, option.kind);
  assert.equal(puzzle.difficultyScore, option.difficultyScore);
  assertPounceClearingSequence(puzzle.sequence);
}

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
    assert.ok(Number.isInteger(puzzle.difficultyScore));
    assert.ok(puzzle.difficultyScore >= 1);
    assert.ok(puzzle.difficultyScore <= 10);
    assert.equal(puzzle.objective, "Unload a pounce card");
    assert.equal(puzzle.board.players[0].deck.length, 1);
    assert.equal(puzzle.board.players[0].flippedDeck.length, 1);
    assert.equal(puzzle.board.pileLocs.length, puzzle.board.piles.length);
    assertUniqueCards(getAllCards(puzzle.board));
    assertValidSolitaireStacks(puzzle.board.players[0].stacks);
    assertPounceClearingSequence(puzzle.sequence);
    const sequenceSourceCards = recordSequenceValues(
      puzzle.board,
      puzzle.sequence,
      observedSequenceValues
    );
    const firstMoveValueSet = firstMoveValuesByTemplate.get(puzzle.templateId);
    const firstSourceCard = sequenceSourceCards[0];
    if (firstMoveValueSet && firstSourceCard) {
      firstMoveValueSet.add(firstSourceCard.value);
    }

    if (hasDeckConnectorLine(puzzle.sequence)) {
      deckConnectorCount += 1;
    }
    if (puzzle.templateId === "deck-connector-pounce") {
      assertNoDeckConnectorSolitaireSideMoves(puzzle);
    }
    if (hasDeckShiftConnectorLine(puzzle.sequence)) {
      deckShiftConnectorCount += 1;
    }
    if (hasDeckRevealCenterLine(puzzle.sequence)) {
      deckRevealCenterCount += 1;
    }
    if (hasCenterRunLine(puzzle.sequence)) {
      centerRunCount += 1;
    }
    if (hasUncoverCenterChainLine(puzzle.sequence)) {
      uncoverCenterChainCount += 1;
    }
    if (hasUncoverTwoCenterLine(puzzle.sequence)) {
      uncoverTwoCenterCount += 1;
    }
    if (hasSolitaireConnectorLine(puzzle.sequence)) {
      solitaireConnectorCount += 1;
    }
    if (hasStackShuttleLine(puzzle.sequence)) {
      stackShuttleCount += 1;
    }
    if (hasShuttleBackFreeSlotLine(puzzle.sequence)) {
      shuttleBackFreeSlotCount += 1;
    }
    if (puzzle.templateId === "shuttle-uncover-free-pounce") {
      shuttleUncoverFreeSlotCount += 1;
    }
    if (
      puzzle.templateId === "shuttle-back-free-pounce" ||
      puzzle.templateId === "shuttle-uncover-free-pounce" ||
      puzzle.templateId === "uncover-two-center-pounce"
    ) {
      assert.notEqual(
        puzzle.board.players[0].flippedDeck.at(-1)?.value,
        1,
        `${puzzle.templateId} should not show a playable-looking waste ace`
      );
    }
    if (puzzle.templateId === "free-slot-pounce") {
      const pounceMoveIndex = puzzle.sequence.findIndex(
        (move) => move.type === "c2s" && move.source === "pounce"
      );
      const pounceCard = sequenceSourceCards[pounceMoveIndex];
      if (pounceCard) {
        freeSlotPounceValues.add(pounceCard.value);
      }
    }
    if (puzzle.templateId === "tall-free-slot-pounce") {
      const firstMove = puzzle.sequence[0];
      if (firstMove?.type === "s2s") {
        tallFreeSlotDestDepths.add(
          puzzle.board.players[0].stacks[firstMove.dest].length
        );
      }
    }
    if (puzzle.templateId === "deck-stack-reveal-center-pounce") {
      const firstMove = puzzle.sequence[0];
      if (firstMove?.type === "c2s" && firstMove.source === "deck") {
        deckStackRevealDestDepths.add(
          puzzle.board.players[0].stacks[firstMove.dest].length
        );
        const wasteCard = sequenceSourceCards[0];
        if (wasteCard) {
          deckStackRevealWasteValues.add(wasteCard.value);
        }
      }
    }
    if (puzzle.templateId === "uncover-two-center-pounce") {
      puzzle.sequence.forEach((move, index) => {
        if (move.type === "c2c" && move.source.type === "solitaire") {
          const sourceCard = sequenceSourceCards[index];
          if (sourceCard) {
            uncoverTwoCenterValues.add(sourceCard.value);
          }
        }
      });
    }
    if (puzzle.templateId === "waste-double-solitaire-center-pounce") {
      wasteDoubleNonEmptyPileCounts.add(
        puzzle.board.piles.filter((pile) => pile.length > 0).length
      );
    }
    if (hasWasteFirstCenterLine(puzzle.sequence)) {
      wasteFirstCenterCount += 1;
    }
    if (hasWasteFirstDoubleCenterLine(puzzle.sequence)) {
      wasteFirstDoubleCenterCount += 1;
    }
    if (hasWasteUncoverCenterLine(puzzle.sequence)) {
      wasteUncoverCenterCount += 1;
    }
    if (hasWasteUncoverFreeSlotLine(puzzle.sequence)) {
      wasteUncoverFreeSlotCount += 1;
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
assert.ok(
  deckRevealCenterCount > 0,
  "expected deck-to-solitaire reveal-center pounce puzzles"
);
assert.ok(centerRunCount > 0, "expected strung-together center-run puzzles");
assert.ok(
  uncoverCenterChainCount > 0,
  "expected uncover-center chain pounce puzzles"
);
assert.ok(
  uncoverTwoCenterCount > 0,
  "expected two-center uncover pounce puzzles"
);
assert.ok(
  solitaireConnectorCount > 0,
  "expected solitaire-to-solitaire pounce puzzles"
);
assert.ok(
  stackShuttleCount > 0,
  "expected growing stack-shuttle pounce puzzles"
);
assert.ok(
  shuttleBackFreeSlotCount > 0,
  "expected shuttle-back free-slot puzzles"
);
assert.ok(
  shuttleUncoverFreeSlotCount > 0,
  "expected simpler shuttle uncover free-slot puzzles"
);
assert.ok(
  wasteFirstCenterCount > 0,
  "expected waste-first center pounce puzzles"
);
assert.ok(
  wasteFirstDoubleCenterCount > 0,
  "expected waste-first double-solitaire center pounce puzzles"
);
assert.ok(
  wasteUncoverCenterCount > 0,
  "expected waste-first uncover-center pounce puzzles"
);
assert.ok(
  wasteUncoverFreeSlotCount > 0,
  "expected waste-first uncover-center free-slot pounce puzzles"
);
assert.ok(tallStackMoveCount > 0, "expected taller moving-stack puzzles");
assert.ok(deepStackCount > 0, "expected deeper solitaire stacks");
assert.ok(extraCenterPileCount > 0, "expected later puzzles with extra piles");
assert.ok(
  observedSequenceValues.size >= 10,
  "expected broader sequence card values"
);
assert.ok(
  deckStackRevealWasteValues.size > 1,
  "expected deck stack reveal waste values to vary"
);
assert.ok(
  deckStackRevealDestDepths.size > 1,
  "expected deck stack reveal destination stack depth to vary"
);
assert.ok(
  uncoverTwoCenterValues.size > 2,
  "expected uncover-two-center card values to vary"
);
assert.ok(
  freeSlotPounceValues.size > 1,
  "expected free-slot pounce card values to vary"
);
assert.ok(
  tallFreeSlotDestDepths.size > 1,
  "expected tall free-slot destination depths to vary"
);
assert.ok(
  Math.min(...Array.from(wasteDoubleNonEmptyPileCounts)) > 1,
  "expected waste-double center puzzles to show multiple center piles"
);
valueVarietyTemplateIds.forEach((templateId) => {
  assert.ok(
    (firstMoveValuesByTemplate.get(templateId)?.size ?? 0) > 1,
    `expected ${templateId} first move values to vary`
  );
});
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

function assertDifficultyRange(
  seed: string,
  puzzleNumber: number,
  minScore: number,
  maxScore: number
): void {
  const puzzle = createPounceRushPuzzle({
    playerName: "Player",
    playerSessionId: "session",
    puzzleNumber,
    seed,
    socketId: "socket",
  });

  assert.ok(
    puzzle.difficultyScore >= minScore &&
      puzzle.difficultyScore <= maxScore,
    `${puzzle.reportCode} expected D${minScore}-D${maxScore}, saw D${puzzle.difficultyScore}`
  );
}

function getTemplateOption(templateId: string) {
  return templateOptions.find((option) => option.id === templateId);
}

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

function hasDeckRevealCenterLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const shiftMove = sequence[index + 1];
    const centerMove = sequence[index + 2];
    const finalMove = sequence[index + 3];
    return (
      move.type === "c2s" &&
      move.source === "deck" &&
      shiftMove?.type === "s2s" &&
      centerMove?.type === "c2c" &&
      centerMove.source.type === "solitaire" &&
      finalMove?.type === "c2c" &&
      finalMove.source.type === "pounce"
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

function hasUncoverTwoCenterLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const firstCenterMove = sequence[index + 1];
    const secondCenterMove = sequence[index + 2];
    const finalMove = sequence[index + 3];
    return (
      move.type === "s2s" &&
      firstCenterMove?.type === "c2c" &&
      firstCenterMove.source.type === "solitaire" &&
      secondCenterMove?.type === "c2c" &&
      secondCenterMove.source.type === "solitaire" &&
      secondCenterMove.source.index === firstCenterMove.source.index &&
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

function hasStackShuttleLine(sequence: Move[]): boolean {
  const finalMove = sequence[sequence.length - 1];
  const stackMoves = sequence.filter(
    (move): move is Extract<Move, { type: "s2s" }> => move.type === "s2s"
  );
  return (
    finalMove?.type === "c2s" &&
    finalMove.source === "pounce" &&
    stackMoves.length >= 3 &&
    stackMoves.every(
      (move, index) => index === 0 || move.count > stackMoves[index - 1].count
    )
  );
}

function hasShuttleBackFreeSlotLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const centerMove = sequence[index + 1];
    const returnMove = sequence[index + 2];
    const finalMove = sequence[index + 3];
    return (
      move.type === "s2s" &&
      centerMove?.type === "c2c" &&
      centerMove.source.type === "solitaire" &&
      centerMove.source.index === move.source &&
      returnMove?.type === "s2s" &&
      returnMove.source === move.dest &&
      returnMove.dest === move.source &&
      returnMove.count === move.count + 1 &&
      finalMove?.type === "c2s" &&
      finalMove.source === "pounce" &&
      finalMove.dest === move.dest
    );
  });
}

function hasWasteFirstCenterLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const centerMove = sequence[index + 1];
    const finalMove = sequence[index + 2];
    return (
      move.type === "c2c" &&
      move.source.type === "deck" &&
      centerMove?.type === "c2c" &&
      centerMove.source.type === "solitaire" &&
      finalMove?.type === "c2c" &&
      finalMove.source.type === "pounce"
    );
  });
}

function hasWasteFirstDoubleCenterLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const firstCenterMove = sequence[index + 1];
    const secondCenterMove = sequence[index + 2];
    const finalMove = sequence[index + 3];
    return (
      move.type === "c2c" &&
      move.source.type === "deck" &&
      firstCenterMove?.type === "c2c" &&
      firstCenterMove.source.type === "solitaire" &&
      secondCenterMove?.type === "c2c" &&
      secondCenterMove.source.type === "solitaire" &&
      finalMove?.type === "c2c" &&
      finalMove.source.type === "pounce"
    );
  });
}

function hasWasteUncoverCenterLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const shiftMove = sequence[index + 1];
    const centerMove = sequence[index + 2];
    const finalMove = sequence[index + 3];
    return (
      move.type === "c2c" &&
      move.source.type === "deck" &&
      shiftMove?.type === "s2s" &&
      centerMove?.type === "c2c" &&
      centerMove.source.type === "solitaire" &&
      finalMove?.type === "c2c" &&
      finalMove.source.type === "pounce"
    );
  });
}

function hasWasteUncoverFreeSlotLine(sequence: Move[]): boolean {
  return sequence.some((move, index) => {
    const shiftMove = sequence[index + 1];
    const centerMove = sequence[index + 2];
    const finalMove = sequence[index + 3];
    return (
      move.type === "c2c" &&
      move.source.type === "deck" &&
      shiftMove?.type === "s2s" &&
      centerMove?.type === "c2c" &&
      centerMove.source.type === "solitaire" &&
      finalMove?.type === "c2s" &&
      finalMove.source === "pounce"
    );
  });
}

function recordSequenceValues(
  board: ReturnType<typeof createPounceRushPuzzle>["board"],
  sequence: Move[],
  values: Set<number>
): (CardState | null)[] {
  const boardCopy = deepClone(board);
  const sourceCards: (CardState | null)[] = [];
  sequence.forEach((move) => {
    const sourceCard = getMoveSourceCard(boardCopy, move);
    sourceCards.push(sourceCard);
    if (sourceCard) {
      values.add(sourceCard.value);
    }
    assert.notEqual(executeMove(boardCopy, 0, move), null);
  });
  return sourceCards;
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
    case "wait":
      return null;
    case "premove":
      if (move.source.type === "pounce") {
        return player.pounceDeck[player.pounceDeck.length - 1] ?? null;
      }
      if (move.source.type === "deck") {
        return player.flippedDeck[player.flippedDeck.length - 1] ?? null;
      }
      return player.stacks[move.source.index]?.[
        player.stacks[move.source.index].length - 1
      ] ?? null;
  }
}

function assertPounceTuckAlternateAccepted(): void {
  for (const seed of ["qa-seed", "difficulty-ramp", "connector-coverage"]) {
    for (let puzzleNumber = 0; puzzleNumber < puzzlesPerSeed; puzzleNumber++) {
      const puzzle = createPounceRushPuzzle({
        playerName: "Player",
        playerSessionId: "session",
        puzzleNumber,
        seed,
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
          for (let dest = 0; dest < 4; dest++) {
            if (dest === expectedMove.dest) {
              continue;
            }
            const alternateMove: Move = {
              type: "c2s",
              source: "pounce",
              dest,
            };
            if (executeMove(deepClone(boardCopy), 0, alternateMove) == null) {
              continue;
            }
            assert.equal(
              isAcceptedPounceRushMove(boardCopy, alternateMove, expectedMove),
              true
            );
            return;
          }
        }

        assert.notEqual(executeMove(boardCopy, 0, expectedMove), null);
      }
    }
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

function assertNoDeckConnectorSolitaireSideMoves(
  puzzle: ReturnType<typeof createPounceRushPuzzle>
): void {
  assert.equal(
    countLegalSolitaireToSolitaireMoves(puzzle.board),
    0,
    `${puzzle.reportCode} should not start with solitaire side moves`
  );

  const afterConnector = deepClone(puzzle.board);
  assert.notEqual(executeMove(afterConnector, 0, puzzle.sequence[0]), null);
  assert.equal(
    countLegalSolitaireToSolitaireMoves(afterConnector),
    0,
    `${puzzle.reportCode} should not expose solitaire side moves after connector`
  );
}

function countLegalSolitaireToSolitaireMoves(
  board: ReturnType<typeof createPounceRushPuzzle>["board"]
): number {
  const player = board.players[0];
  let count = 0;

  player.stacks.forEach((sourceStack, source) => {
    for (let movingCount = 1; movingCount <= sourceStack.length; movingCount++) {
      player.stacks.forEach((_destStack, dest) => {
        if (source === dest) {
          return;
        }
        const boardCopy = deepClone(board);
        const move: Move = {
          type: "s2s",
          source,
          dest,
          count: movingCount,
        };
        if (executeMove(boardCopy, 0, move) != null) {
          count += 1;
        }
      });
    }
  });

  return count;
}
