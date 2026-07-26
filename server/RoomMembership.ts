import { addPlayer } from "../shared/GameUtils";
import type { RoomState } from "../shared/RoomState";
import {
  cancelRoomStartCountdown,
  clearRoomHand,
  removeRoomPlayer,
} from "../shared/RoomLogic";

export type JoinRoomPlayerResult = {
  didAdd: boolean;
  playerIndex: number;
  previousSocketId: string | null;
};

export type LeaveRoomPlayerResult = {
  changed: boolean;
  removed: boolean;
};

export function joinRoomPlayer(
  room: RoomState,
  socketId: string,
  name: string | undefined,
  playerSessionId: string | undefined
): JoinRoomPlayerResult {
  const playerIndex =
    playerSessionId != null
      ? room.board.players.findIndex(
          (player) => player.playerSessionId === playerSessionId
        )
      : room.board.players.findIndex(
          (player) => player.socketId === socketId
        );

  if (playerIndex < 0) {
    return {
      didAdd: true,
      playerIndex: addPlayer(
        room.board,
        socketId,
        name,
        playerSessionId
      ),
      previousSocketId: null,
    };
  }

  const player = room.board.players[playerIndex];
  const previousSocketId = player.socketId;
  player.socketId = socketId;
  player.playerSessionId = playerSessionId ?? player.playerSessionId;
  player.disconnected = false;
  player.disconnectedAt = undefined;
  player.hasLeftRoom = false;
  player.name = name ?? player.name;
  return { didAdd: false, playerIndex, previousSocketId };
}

export function markRoomPlayerDisconnected(
  room: RoomState | undefined,
  socketId: string,
  now = Date.now()
): boolean {
  if (!room) {
    return false;
  }

  const playerIndex = room.board.players.findIndex(
    (player) => player.socketId === socketId
  );
  if (playerIndex < 0) {
    return false;
  }

  const player = room.board.players[playerIndex];
  if (player.disconnected) {
    return false;
  }

  player.disconnected = true;
  player.disconnectedAt = now;
  player.isReadyForRound = false;
  clearRoomHand(room, playerIndex);
  cancelRoomStartCountdown(room, now);
  return true;
}

export function leaveRoomPlayer(
  room: RoomState | undefined,
  socketId: string,
  now = Date.now()
): LeaveRoomPlayerResult {
  if (!room) {
    return { changed: false, removed: false };
  }

  const playerIndex = room.board.players.findIndex(
    (player) => player.socketId === socketId
  );
  if (playerIndex < 0) {
    return { changed: false, removed: false };
  }

  if (
    !room.board.isActive &&
    !room.board.isDealt &&
    room.board.pouncer == null
  ) {
    return {
      changed: removeRoomPlayer(room, playerIndex),
      removed: true,
    };
  }

  const player = room.board.players[playerIndex];
  const didMarkLeft = player.hasLeftRoom !== true;
  player.hasLeftRoom = true;
  const didDisconnect = markRoomPlayerDisconnected(room, socketId, now);
  return {
    changed: didDisconnect || didMarkLeft,
    removed: false,
  };
}
