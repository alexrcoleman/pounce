import assert from "assert";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  enumerateLegalMoves,
  getMoveImmediatePointDelta,
} from "./ActionRankingPolicy";
import { createBoard, type BoardState, type CardState } from "./GameUtils";
import { executeMove, type Move } from "./MoveHandler";

const expectedMovesByType = {
  c2c: [
    [{ type: "c2c", source: { type: "pounce" }, dest: 0 }, 3],
    [{ type: "c2c", source: { type: "deck" }, dest: 0 }, 1],
    [{ type: "c2c", source: { type: "solitaire", index: 0 }, dest: 0 }, 1],
  ],
  c2s: [
    [{ type: "c2s", source: "pounce", dest: 0 }, 2],
    [{ type: "c2s", source: "deck", dest: 0 }, 0],
  ],
  s2s: [[{ type: "s2s", source: 0, dest: 1, count: 1 }, 0]],
  cycle: [[{ type: "cycle" }, 0]],
  flip_deck: [[{ type: "flip_deck" }, 0]],
  wait: [[{ type: "wait" }, 0]],
  premove: [
    [{ type: "premove", source: { type: "pounce" } }, 0],
    [{ type: "premove", source: { type: "deck" } }, 0],
    [{ type: "premove", source: { type: "solitaire", index: 0 } }, 0],
  ],
  move_field_stack: [
    [{ type: "move_field_stack", index: 0, position: [0.25, 0.75] }, 0],
  ],
} satisfies Record<Move["type"], readonly (readonly [Move, number])[]>;

Object.values(expectedMovesByType)
  .flat()
  .forEach(([move, expectedDelta]) => {
    assert.strictEqual(
      getMoveImmediatePointDelta(move),
      expectedDelta,
      `${move.type} should have immediate point delta ${expectedDelta}`
    );
  });

const deckCycleFeatureIndex = ACTION_RANKING_FEATURE_NAMES.indexOf(
  "own.playedDeckCardThisCycle"
);
assert.notStrictEqual(deckCycleFeatureIndex, -1);

{
  const board = createActiveBoard();
  const player = board.players[0];
  player.deck = [card("hearts", 2), card("spades", 3)];
  player.flippedDeck = [card("diamonds", 4)];

  assert(
    enumerateLegalMoves(board, 0).some((move) => move.type === "flip_deck"),
    "flip_deck should be a default neural action when stock cards remain"
  );
  assert(
    !enumerateLegalMoves(board, 0, { includeFlipDeck: false }).some(
      (move) => move.type === "flip_deck"
    ),
    "includeFlipDeck: false should suppress the full-deck flip action"
  );

  player.deck = [];
  assert(
    !enumerateLegalMoves(board, 0).some((move) => move.type === "flip_deck"),
    "flip_deck should not duplicate the cycle reset when only waste remains"
  );
}

{
  const board = createActiveBoard();
  const player = board.players[0];
  player.deck = [card("hearts", 2), card("spades", 3)];
  player.playedDeckCardThisCycle = true;

  const candidates = enumerateActionRankingCandidates(board, 0);
  assert(candidates.length > 0);
  candidates.forEach((candidate) => {
    assert.strictEqual(
      candidate.features.length,
      ACTION_RANKING_FEATURE_NAMES.length,
      `${candidate.key} feature vector should match feature names`
    );
  });
  const cycle = candidates.find((candidate) => candidate.move.type === "cycle");
  assert(cycle);
  assert.strictEqual(cycle.features[deckCycleFeatureIndex], 1);
}

{
  const board = createActiveBoard();
  const player = board.players[0];
  player.flippedDeck = [card("hearts", 1)];

  const playResult = executeMove(board, 0, {
    type: "c2c",
    source: { type: "deck" },
    dest: 0,
  });
  assert(playResult?.boardChanged);
  assert.strictEqual(player.playedDeckCardThisCycle, true);

  player.deck = [];
  player.flippedDeck = [card("spades", 2)];
  const resetResult = executeMove(board, 0, { type: "cycle" });
  assert(resetResult?.boardChanged);
  assert.strictEqual(player.playedDeckCardThisCycle, false);
}

console.log("Validated action-ranking policy helpers.");

function createActiveBoard(): BoardState {
  const board = createBoard(2);
  board.isActive = true;
  board.isDealt = true;
  board.roundStartsAt = undefined;
  board.players.forEach((player, playerIndex) => {
    player.pounceDeck = [card("clubs", 13, playerIndex)];
    player.deck = [];
    player.flippedDeck = [];
    player.stacks = [[], [], [], []];
    player.playedDeckCardThisCycle = false;
    player.currentPoints = -26;
  });
  return board;
}

function card(
  suit: CardState["suit"],
  value: CardState["value"],
  player = 0
): CardState {
  return { suit, value, player };
}
