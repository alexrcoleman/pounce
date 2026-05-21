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

export const ROOM_DELETE_GRACE_PERIOD_MS = 30 * 1000;

const rooms: Record<string, ServerRoomState> = {};
const roomDeleteTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export function createRoom(io: Server, roomId: string) {
  cancelRoomDelete(roomId);
  if (rooms[roomId]) {
    console.log("Reusing existing board for room: " + roomId);
    broadcastUpdate(roomId);
    broadcastHands(roomId);
    return;
  }

  const room = {
    ...createRoomState(0),
    io,
    interval: undefined as unknown as NodeJS.Timer,
  };
  room.interval = setInterval(() => {
    const currentRoom = rooms[roomId];
    const { hasUpdate, hasHandUpdate } = tickRoom(currentRoom);
    if (hasUpdate) {
      markRoomUpdated(roomId);
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
    settings: room.settings,
    time: Date.now(),
    revision: room.revision,
    roundAnalysis: room.lastRoundAnalysis,
  });
  scheduleAIReactionBoard(room);
}

export function markRoomUpdated(roomId: string) {
  rooms[roomId].revision += 1;
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

export function scheduleRoomDelete(
  roomId: string,
  delay = ROOM_DELETE_GRACE_PERIOD_MS
) {
  if (roomDeleteTimers[roomId]) {
    return;
  }

  console.log("Scheduling room delete: " + roomId);
  roomDeleteTimers[roomId] = setTimeout(() => {
    delete roomDeleteTimers[roomId];
    deleteRoom(roomId);
  }, delay);
}

export function cancelRoomDelete(roomId: string) {
  const timer = roomDeleteTimers[roomId];
  if (!timer) {
    return;
  }

  console.log("Canceling room delete: " + roomId);
  clearTimeout(timer);
  delete roomDeleteTimers[roomId];
}

export function deleteRoom(roomId: string) {
  cancelRoomDelete(roomId);
  console.log("Rooms: ", Object.keys(rooms), " deleting " + roomId);
  const room = getRoom(roomId);
  if (room) {
    clearInterval(room.interval);
    delete rooms[roomId];
  }
}
