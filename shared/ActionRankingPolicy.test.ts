import assert from "assert";
import {
  getMoveImmediatePointDelta,
} from "./ActionRankingPolicy";
import type { Move } from "./MoveHandler";

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

console.log("Validated action-ranking immediate point deltas.");
