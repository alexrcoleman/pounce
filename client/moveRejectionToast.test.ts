import assert from "node:assert/strict";

import type { BoardState, CardState, PlayerState } from "../shared/GameUtils";
import type { Move } from "../shared/MoveHandler";
import {
  type CardDnDItem,
  getActiveCenterPileIndex,
} from "./CardDnDItem";
import {
  getCenterPileRaceWinner,
  getPlayableCenterPileIndices,
} from "./centerPileRace";
import { describeRejectedMove } from "./moveRejectionToast";

const attemptedCard = card(0, 2);
const move: Move = {
  type: "c2c",
  source: { type: "pounce" },
  dest: 0,
};
const HEART = "\u2665";

{
  const board = createBoard([
    card(0, 1),
    card(1, 2),
  ]);

  assert.deepEqual(
    getPlayableCenterPileIndices([[card(0, 1)], [card(2, 4)]], attemptedCard),
    [0]
  );
  assert.equal(
    describeRejectedMove({
      board,
      confirmedCenterPileRace: true,
      move,
      playerIndex: 0,
      reason: "That move is no longer available.",
    }).message,
    `Maya beat you to that pile with 2${HEART}.`
  );
}

{
  const dragItem: CardDnDItem = {
    source: { type: "pounce" },
    card: attemptedCard,
    initialClientPosition: [0, 0],
    centerPileTarget: {
      handlerId: "center-target-0",
      pileIndex: 0,
    },
  };

  assert.equal(
    getActiveCenterPileIndex(dragItem, ["center-target-0"]),
    0
  );
  assert.equal(
    getActiveCenterPileIndex(dragItem, ["solitaire-target-0"]),
    null
  );
}

{
  const board = createBoard([
    card(0, 1),
    card(1, 2),
    card(2, 3),
  ]);

  assert.equal(
    getCenterPileRaceWinner(board.piles[0], attemptedCard, 0)?.player,
    1
  );
  assert.equal(
    describeRejectedMove({
      board,
      confirmedCenterPileRace: true,
      move,
      playerIndex: 0,
    }).message,
    `Maya beat you to that pile with 2${HEART}. It's already 3${HEART}.`
  );
}

{
  const board = createBoard([
    card(0, 1),
    card(99, 2),
  ]);

  assert.equal(
    describeRejectedMove({
      board,
      move,
      playerIndex: 0,
    }).message,
    `2${HEART} beaten: pile already 2${HEART}.`
  );
}

{
  const board = createBoard([
    card(1, 1),
    card(0, 2),
  ]);

  assert.equal(
    getCenterPileRaceWinner(board.piles[0], attemptedCard, 0),
    null
  );
  assert.equal(
    describeRejectedMove({
      board,
      move,
      playerIndex: 0,
    }).message,
    `2${HEART} beaten: pile already 2${HEART}.`
  );
}

{
  const board = createBoard([
    card(0, 1),
    card(1, 2),
  ]);
  board.players[1].pounceDeck = [];

  assert.equal(
    describeRejectedMove({
      board,
      confirmedCenterPileRace: true,
      move,
      playerIndex: 0,
      reason: "The round is already over.",
    }).message,
    `Maya beat you to that pile with 2${HEART}.`
  );
}

{
  const board = createBoard([
    card(0, 1),
    card(1, 2),
  ]);

  assert.equal(
    describeRejectedMove({
      board,
      move,
      playerIndex: 0,
      reason: "Move acknowledgement timed out",
    }).message,
    "Move rejected: Move acknowledgement timed out"
  );
}

function createBoard(pile: CardState[]): BoardState {
  return {
    isActive: true,
    isDealt: true,
    isPaused: false,
    players: [
      player("You", 0, attemptedCard),
      player("Maya", 1, card(1, 9)),
      player("Rowan", 2, card(2, 9)),
    ],
    piles: [pile],
    pileLocs: [[0.5, 0.5, 0]],
    ticksSinceMove: 0,
    ticksSinceNonWaitMove: 0,
  };
}

function player(
  name: string,
  playerIndex: number,
  pounceCard: CardState
): PlayerState {
  return {
    playerSessionId: `session-${playerIndex}`,
    socketId: `socket-${playerIndex}`,
    name,
    color: "red",
    stacks: [[], [], [], []],
    pounceDeck: [pounceCard],
    deck: [],
    flippedDeck: [],
    totalPoints: 0,
    currentPoints: 0,
    scores: [],
  };
}

function card(player: number, value: CardState["value"]): CardState {
  return {
    player,
    suit: "hearts",
    value,
  };
}
