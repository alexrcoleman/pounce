import assert from "node:assert/strict";

import {
  AI_DIFFICULTY_PRESETS,
  DEFAULT_AI_LEVEL,
  MAX_AI_LEVEL,
  MIN_AI_LEVEL,
  getAISpeedMultiplier,
  normalizeAILevel,
} from "./AIDifficulty";

assert.deepEqual(
  AI_DIFFICULTY_PRESETS.map(({ key, level }) => [key, level]),
  [
    ["easy", 3],
    ["medium", 5],
    ["hard", 7],
  ]
);

assert.equal(DEFAULT_AI_LEVEL, 5);

assert.equal(getAISpeedMultiplier(3), 2);
assert.equal(getAISpeedMultiplier(5), 3);
assert.equal(getAISpeedMultiplier(7), 4);
assert.equal(getAISpeedMultiplier(9), 5);

assert.equal(normalizeAILevel(Number.NaN), DEFAULT_AI_LEVEL);
assert.equal(normalizeAILevel(-10), MIN_AI_LEVEL);
assert.equal(normalizeAILevel(100), MAX_AI_LEVEL);
assert.equal(normalizeAILevel(4.6), 5);
