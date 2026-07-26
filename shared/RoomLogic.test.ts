import assert from "node:assert/strict";

import {
  completeRoundStartCountdown,
  dealRoomHands,
  getReactionDelay,
  removeDisconnectedPlayers,
  setPlayerReadyForRound,
  startRoomGame,
  tickRoom,
} from "./RoomLogic";
import { createRoomState } from "./RoomState";
import { getStuckVoteStatus } from "./StuckPlayers";

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

{
  const room = createHumanRoom(3);
  const disconnectedPlayer = room.board.players[2];
  disconnectedPlayer.disconnected = true;
  disconnectedPlayer.disconnectedAt = 100;

  assert.equal(dealRoomHands(room), true);
  assert.equal(room.board.players.length, 3);
  assert.equal(room.board.players[2], disconnectedPlayer);
  assert.equal(disconnectedPlayer.pounceDeck.length, 13);

  startRoomGame(room, 1000, { countdownMs: 0 });
  assert.equal(room.board.isActive, true);
  assert.equal(room.board.players.length, 3);
  assert.equal(room.board.players[2], disconnectedPlayer);
  assert.equal(getStuckVoteStatus(room.board, []).total, 2);
}

{
  const room = createHumanRoom(3);
  assert.equal(dealRoomHands(room), true);
  room.board.players[2].disconnected = true;
  room.board.players[2].disconnectedAt = 100;

  assert.deepEqual(setPlayerReadyForRound(room, 0, true), {
    didChange: true,
    didStart: false,
  });
  assert.deepEqual(setPlayerReadyForRound(room, 1, true), {
    didChange: true,
    didStart: false,
  });
  assert.equal(room.board.isActive, false);
  assert.equal(room.board.players.length, 3);

  assert.equal(removeDisconnectedPlayers(room), true);
  assert.equal(room.board.players.length, 2);
  assert.equal(room.board.isDealt, false);
  assert.equal(dealRoomHands(room), true);
  assert.equal(
    setPlayerReadyForRound(room, 0, true).didStart,
    false
  );
  assert.equal(
    setPlayerReadyForRound(room, 1, true, 2000).didStart,
    true
  );
}

{
  const room = createHumanRoom(1);
  const disconnectedPlayer = room.board.players[0];
  disconnectedPlayer.disconnected = true;
  disconnectedPlayer.disconnectedAt = 0;

  tickRoom(room, 60 * 60 * 1000);
  assert.equal(room.board.players.length, 1);
  assert.equal(room.board.players[0], disconnectedPlayer);
}

function createHumanRoom(playerCount: number) {
  const room = createRoomState(playerCount);
  room.board.players.forEach((player, index) => {
    player.socketId = `socket-${index}`;
    player.playerSessionId = `session-${index}`;
    player.name = `Player ${index + 1}`;
  });
  return room;
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
