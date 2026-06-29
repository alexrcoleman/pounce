import assert from "node:assert/strict";

import {
  completeRoundStartCountdown,
  dealRoomHands,
  getReactionDelay,
  startRoomGame,
} from "./RoomLogic";
import { createRoomState } from "./RoomState";

{
  const room = createRoomState(2);
  const now = 1000;
  const countdownMs = 3000;
  const randomJitter = 0.5;

  assert.equal(dealRoomHands(room), true);

  withStubbedRandom(randomJitter, () => {
    startRoomGame(room, now, { countdownMs });
    const startsAt = now + countdownMs;
    const expectedOpeningCooldown =
      startsAt + getReactionDelay(room) / 4 + randomJitter;

    assert.equal(room.board.roundStartsAt, startsAt);
    assert.deepEqual(
      room.aiCooldowns,
      room.board.players.map(() => expectedOpeningCooldown)
    );
    assert.equal(completeRoundStartCountdown(room, startsAt - 1), false);

    assert.equal(completeRoundStartCountdown(room, startsAt), true);
    assert.equal(room.board.roundStartsAt, undefined);
    assert.deepEqual(
      room.aiCooldowns,
      room.board.players.map(() => expectedOpeningCooldown)
    );
  });
}

function withStubbedRandom(value: number, fn: () => void): void {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    fn();
  } finally {
    Math.random = originalRandom;
  }
}
