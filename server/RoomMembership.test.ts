import assert from "node:assert/strict";

import { isRoundStartPending } from "../shared/GameUtils";
import { createRoomState } from "../shared/RoomState";
import {
  dealRoomHands,
  setPlayerReadyForRound,
  startRoomGame,
} from "../shared/RoomLogic";
import {
  joinRoomPlayer,
  leaveRoomPlayer,
  markRoomPlayerDisconnected,
} from "./RoomMembership";

{
  const room = createRoomState(0);
  const joined = joinRoomPlayer(room, "socket-1", "Alex", "session-1");
  const originalPlayer = room.board.players[joined.playerIndex];
  originalPlayer.totalPoints = 42;
  originalPlayer.isReadyForRound = true;
  room.hands[joined.playerIndex] = {
    location: { type: "solitaire_slot", player: 0, pileIndex: 0 },
  };

  assert.equal(joined.didAdd, true);
  assert.equal(
    markRoomPlayerDisconnected(room, "socket-1", 1234),
    true
  );
  assert.equal(originalPlayer.disconnected, true);
  assert.equal(originalPlayer.disconnectedAt, 1234);
  assert.equal(originalPlayer.isReadyForRound, false);
  assert.deepEqual(room.hands[joined.playerIndex], {});

  const rejoined = joinRoomPlayer(
    room,
    "socket-2",
    "Alex again",
    "session-1"
  );
  assert.equal(rejoined.didAdd, false);
  assert.equal(rejoined.playerIndex, joined.playerIndex);
  assert.equal(rejoined.previousSocketId, "socket-1");
  assert.equal(room.board.players.length, 1);
  assert.equal(room.board.players[0], originalPlayer);
  assert.equal(originalPlayer.socketId, "socket-2");
  assert.equal(originalPlayer.name, "Alex again");
  assert.equal(originalPlayer.totalPoints, 42);
  assert.equal(originalPlayer.disconnected, false);
  assert.equal(originalPlayer.disconnectedAt, undefined);

  const differentPlayer = joinRoomPlayer(
    room,
    "socket-3",
    "Blair",
    "session-2"
  );
  assert.equal(differentPlayer.didAdd, true);
  assert.equal(room.board.players.length, 2);
}

{
  const room = createRoomState(0);
  joinRoomPlayer(room, "socket-1", "Alex", "session-1");
  joinRoomPlayer(room, "socket-2", "Blair", "session-2");
  markRoomPlayerDisconnected(room, "socket-2");

  const result = leaveRoomPlayer(room, "socket-1");
  assert.deepEqual(result, { changed: true, removed: true });
  assert.equal(room.board.players.length, 1);
  assert.equal(room.board.players[0].name, "Blair");
  assert.equal(room.board.players[0].disconnected, true);
}

{
  const room = createRoomState(0);
  joinRoomPlayer(room, "socket-1", "Alex", "session-1");
  room.board.isActive = true;

  const result = leaveRoomPlayer(room, "socket-1", 5678);
  assert.deepEqual(result, { changed: true, removed: false });
  assert.equal(room.board.players.length, 1);
  assert.equal(room.board.players[0].hasLeftRoom, true);
  assert.equal(room.board.players[0].disconnected, true);
  assert.equal(room.board.players[0].disconnectedAt, 5678);
}

{
  const room = createRoomState(0);
  joinRoomPlayer(room, "socket-1", "Alex", "session-1");
  joinRoomPlayer(room, "socket-2", "Blair", "session-2");
  joinRoomPlayer(room, "socket-3", "Casey", "session-3");
  assert.equal(dealRoomHands(room), true);
  setPlayerReadyForRound(room, 0, true);
  setPlayerReadyForRound(room, 1, true);
  assert.equal(
    setPlayerReadyForRound(room, 2, true, 1000).didStart,
    true
  );
  assert.equal(isRoundStartPending(room.board, 1100), true);

  assert.equal(
    markRoomPlayerDisconnected(room, "socket-3", 1100),
    true
  );
  assert.equal(room.board.isActive, false);
  assert.equal(room.board.isDealt, true);
  assert.equal(room.board.roundStartsAt, undefined);
  assert.equal(
    room.board.players.every(
      (player) => player.isReadyForRound === false
    ),
    true
  );
}

{
  const room = createRoomState(0);
  joinRoomPlayer(room, "socket-1", "Alex", "session-1");
  joinRoomPlayer(room, "socket-2", "Blair", "session-2");
  assert.equal(dealRoomHands(room), true);
  setPlayerReadyForRound(room, 0, true);
  assert.equal(
    setPlayerReadyForRound(room, 1, true, 1000).didStart,
    true
  );

  assert.deepEqual(leaveRoomPlayer(room, "socket-2", 1100), {
    changed: true,
    removed: false,
  });
  assert.equal(room.board.isActive, false);
  assert.equal(room.board.isDealt, true);
  assert.equal(room.board.players.length, 2);
  assert.equal(room.board.players[1].hasLeftRoom, true);

  startRoomGame(room, 1200, { countdownMs: 0 });
  assert.equal(room.board.players.length, 1);
  assert.equal(room.board.players[0].name, "Alex");
  assert.equal(room.board.isActive, true);
}

{
  const room = createRoomState(0);
  joinRoomPlayer(room, "socket-1", "Alex", "session-1");
  joinRoomPlayer(room, "socket-2", "Blair", "session-2");
  room.board.pouncer = 0;

  assert.deepEqual(leaveRoomPlayer(room, "socket-2"), {
    changed: true,
    removed: false,
  });
  assert.equal(room.board.pouncer, 0);
  assert.equal(room.board.players.length, 2);
  assert.equal(room.board.players[1].hasLeftRoom, true);
}
