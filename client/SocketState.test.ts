import assert from "node:assert/strict";

import type { BoardState, CardState } from "../shared/GameUtils";
import { createRoomState } from "../shared/RoomState";
import { executeMove } from "../shared/MoveHandler";
import type { Move } from "../shared/MoveHandler";
import type { RoomAction } from "../shared/SocketTypes";
import deepClone from "../shared/deepClone";
import SocketState from "./SocketState";

const cycleMove: Move = { type: "cycle" };

{
  const { board, settings } = createTestRoomBoard();
  const state = createConnectedState(board, settings);
  const action = state.createOptimisticMove(cycleMove);

  assertDeckState(state.board, 3, 3);

  const acceptedBoard = deepClone(board);
  assert.ok(executeMove(acceptedBoard, 0, cycleMove, undefined, 1000));

  state.onUpdate({
    board: acceptedBoard,
    settings,
    stuckPlayerIndices: [],
    time: 1000,
    revision: 1,
    roundAnalysis: null,
  });

  assertDeckState(state.board, 3, 3);

  state.onMoveAck({
    actionId: action.actionId,
    ok: true,
    revision: 1,
  });

  assertDeckState(state.board, 3, 3);

  state.onRoomAction({
    type: "move",
    actionId: action.actionId,
    playerIndex: 0,
    move: cycleMove,
    time: 1000,
    revision: 1,
  });

  assertDeckState(state.board, 3, 3);
}

{
  const { board, settings } = createTestRoomBoard();
  const state = createConnectedState(board, settings);
  const action = state.createOptimisticMove(cycleMove);

  assertDeckState(state.board, 3, 3);

  state.onRoomAction({
    type: "move",
    actionId: action.actionId,
    playerIndex: 0,
    move: cycleMove,
    time: 1000,
    revision: 1,
  } satisfies RoomAction);

  assertDeckState(state.board, 3, 3);
}

function createConnectedState(
  board: BoardState,
  settings: ReturnType<typeof createRoomState>["settings"]
): SocketState {
  const state = new SocketState();
  state.setPlayerSessionId("session");
  state.onConnect("socket");
  state.onUpdate({
    board: deepClone(board),
    settings,
    stuckPlayerIndices: [],
    time: 0,
    revision: 0,
    roundAnalysis: null,
  });
  return state;
}

function createTestRoomBoard(): ReturnType<typeof createRoomState> {
  const room = createRoomState(1);
  const player = room.board.players[0];
  room.board.isActive = true;
  room.board.isDealt = true;
  room.board.isPaused = false;
  room.board.roundStartsAt = undefined;
  player.socketId = "socket";
  player.playerSessionId = "session";
  player.isSpectating = false;
  player.deck = createDeck(6);
  player.flippedDeck = [];
  player.pounceDeck = createDeck(1, 7);
  player.stacks = [[], [], [], []];
  return room;
}

function createDeck(count: number, startValue = 1): CardState[] {
  return Array.from({ length: count }, (_, index) => ({
    player: 0,
    suit: "hearts",
    value: (startValue + index) as CardState["value"],
  }));
}

function assertDeckState(
  board: BoardState | null,
  deckLength: number,
  flippedDeckLength: number
): void {
  assert.ok(board);
  assert.equal(board.players[0].deck.length, deckLength);
  assert.equal(board.players[0].flippedDeck.length, flippedDeckLength);
}
