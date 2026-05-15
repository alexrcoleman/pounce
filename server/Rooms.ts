import { Server } from "socket.io";
import { createRoomState, RoomState } from "../shared/RoomState";
import {
  getRoomHands,
  scheduleAIReactionBoard,
  tickRoom,
} from "../shared/RoomLogic";

export type ServerRoomState = RoomState & {
  io: Server;
  interval: NodeJS.Timer;
};

const rooms: Record<string, ServerRoomState> = {};

export function createRoom(io: Server, roomId: string) {
  const room = {
    ...createRoomState(0),
    io,
    interval: undefined as unknown as NodeJS.Timer,
  };
  room.interval = setInterval(() => {
    const currentRoom = rooms[roomId];
    const { hasUpdate, hasHandUpdate } = tickRoom(currentRoom);
    if (hasUpdate) {
      broadcastUpdate(roomId);
    }
    if (hasHandUpdate) {
      broadcastHands(roomId);
    }
  }, 1);
  rooms[roomId] = room;
  broadcastUpdate(roomId);
}

export function broadcastUpdate(roomId: string) {
  const room = rooms[roomId];
  room.io.to(roomId).emit("update", {
    board: room.board,
    time: Date.now(),
  });
  scheduleAIReactionBoard(room);
}

export function broadcastHands(roomId: string) {
  const room = getRoom(roomId);
  room.io.to(roomId).emit("update_hands", {
    hands: getRoomHands(room),
  });
}

export function getRoom(roomId: string) {
  return rooms[roomId];
}

export function deleteRoom(roomId: string) {
  console.log("RoomS: ", Object.keys(rooms), " deleting " + roomId);
  const room = getRoom(roomId);
  if (room) {
    clearInterval(room.interval);
    delete rooms[roomId];
  }
}
