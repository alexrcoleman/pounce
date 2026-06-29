import assert from "node:assert/strict";

import type { BoardState, CardState } from "./GameUtils";
import { createRoomState } from "./RoomState";
import { executeMove } from "./MoveHandler";
import {
  getRoomHandDelta,
  tickRoom,
} from "./RoomLogic";
import deepClone from "./deepClone";

const aceOfHearts: CardState = {
  player: 0,
  suit: "hearts",
  value: 1,
};
const twoOfHearts: CardState = {
  player: 0,
  suit: "hearts",
  value: 2,
};
const otherAceOfHearts: CardState = {
  player: 1,
  suit: "hearts",
  value: 1,
};
const otherTwoOfHearts: CardState = {
  player: 1,
  suit: "hearts",
  value: 2,
};

{
  const board = createOnePlayerBoardWithPounceCard(aceOfHearts);
  const initialTicksSinceMove = board.ticksSinceMove;
  const initialTicksSinceNonWaitMove = board.ticksSinceNonWaitMove;
  const initialPoints = board.players[0].currentPoints;

  const result = executeMove(
    board,
    0,
    { type: "c2c", source: { type: "pounce" }, dest: 0 },
    {}
  );

  assert.deepEqual(result?.cursorMove, aceOfHearts);
  assert.equal(result?.boardChanged, undefined);
  assert.equal(board.ticksSinceMove, initialTicksSinceMove);
  assert.equal(board.ticksSinceNonWaitMove, initialTicksSinceNonWaitMove);
  assert.equal(board.players[0].currentPoints, initialPoints);
  assert.deepEqual(board.players[0].pounceDeck, [aceOfHearts]);
  assert.deepEqual(board.piles[0], []);
}

{
  const room = createRoomState(1);
  room.board = createOnePlayerBoardWithPounceCard(aceOfHearts);
  room.aiBoard = deepClone(room.board);
  room.hands = [{}];
  room.handUpdateVersions = [];
  room.aiCooldowns = [0];
  room.aiSpeed = 1;
  room.timescale = 1;
  room.settings.aiMode = "fixed";
  room.settings.simulationMode = false;

  const result = tickRoom(room, 1000);
  const delta = getRoomHandDelta(room, 0);

  assert.equal(result.hasUpdate, false);
  assert.equal(result.actions.length, 0);
  assert.equal(result.hasHandUpdate, true);
  assert.deepEqual(result.handUpdatePlayerIndices, [0]);
  assert.deepEqual(delta?.hand.location, aceOfHearts);
  assert.equal(delta?.hand.item, null);
  assert.equal(delta?.version, 1);
  assert.deepEqual(room.board.players[0].pounceDeck, [aceOfHearts]);
  assert.deepEqual(room.board.piles[0], []);
  assert.equal(room.board.ticksSinceMove, 0);
  assert.equal(room.board.ticksSinceNonWaitMove, 0);
}

{
  const room = createRoomState(1);
  room.board = createOnePlayerBoardWithPounceCard(twoOfHearts);
  room.board.piles[0] = [aceOfHearts, otherTwoOfHearts];
  room.board.piles[1] = [otherAceOfHearts];
  room.aiBoard = deepClone(room.board);
  room.hands = [
    {
      location: aceOfHearts,
      item: twoOfHearts,
      items: [twoOfHearts],
    },
  ];
  room.handUpdateVersions = [];
  room.aiCooldowns = [0];
  room.aiSpeed = 1;
  room.timescale = 1;
  room.settings.aiMode = "fixed";
  room.settings.simulationMode = false;

  const result = tickRoom(room, 1000);
  const delta = getRoomHandDelta(room, 0);

  assert.equal(result.hasUpdate, false);
  assert.equal(result.actions.length, 0);
  assert.equal(result.hasHandUpdate, false);
  assert.deepEqual(result.handUpdatePlayerIndices, []);
  assert.deepEqual(delta?.hand.location, aceOfHearts);
  assert.deepEqual(delta?.hand.item, twoOfHearts);
  assert.deepEqual(delta?.hand.items, [twoOfHearts]);
  assert.equal(delta?.version, 0);
  assert.deepEqual(room.board.players[0].pounceDeck, [twoOfHearts]);
  assert.deepEqual(room.board.piles[0], [aceOfHearts, otherTwoOfHearts]);
  assert.deepEqual(room.board.piles[1], [otherAceOfHearts]);
  assert.equal(room.aiCooldowns[0], 1650);

  const retargetResult = tickRoom(room, 1650);
  const retargetDelta = getRoomHandDelta(room, 0);

  assert.equal(retargetResult.hasUpdate, false);
  assert.equal(retargetResult.actions.length, 0);
  assert.equal(retargetResult.hasHandUpdate, true);
  assert.deepEqual(retargetResult.handUpdatePlayerIndices, [0]);
  assert.deepEqual(retargetDelta?.hand.location, otherAceOfHearts);
  assert.deepEqual(retargetDelta?.hand.item, twoOfHearts);
  assert.deepEqual(retargetDelta?.hand.items, [twoOfHearts]);
  assert.equal(retargetDelta?.version, 1);
  assert.deepEqual(room.board.players[0].pounceDeck, [twoOfHearts]);
  assert.deepEqual(room.board.piles[0], [aceOfHearts, otherTwoOfHearts]);
  assert.deepEqual(room.board.piles[1], [otherAceOfHearts]);
}

function createOnePlayerBoardWithPounceCard(card: CardState): BoardState {
  const room = createRoomState(1);
  const board = room.board;
  const player = board.players[0];
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.pouncer = undefined;
  board.ticksSinceMove = 0;
  board.ticksSinceNonWaitMove = 0;
  board.piles = board.piles.map(() => []);
  player.socketId = null;
  player.isSpectating = false;
  player.pounceDeck = [card];
  player.deck = [];
  player.flippedDeck = [];
  player.stacks = [[], [], [], []];
  player.currentPoints = 0;
  return board;
}
