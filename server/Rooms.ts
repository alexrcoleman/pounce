import { Server } from "socket.io";
import { createRoomState, RoomState } from "../shared/RoomState";
import {
  completeRoundAnalysis,
  getRoomHands,
  getRoomStuckPlayerIndices,
  scheduleAIReactionBoard,
  tickRoom,
} from "../shared/RoomLogic";
import type { RoundSnapshot } from "../shared/RoundAnalysis";
import type { RoomToast } from "../shared/RoomToast";

export type ServerRoomState = RoomState & {
  io: Server;
  interval: NodeJS.Timer;
};

export const ROOM_DELETE_GRACE_PERIOD_MS = 10 * 60 * 1000;

const rooms: Record<string, ServerRoomState> = {};
const roomDeleteTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const ROUND_ANALYSIS_DEFER_MS = 50;

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
    const { hasUpdate, hasHandUpdate, roomToast, roundAnalysisSnapshots } =
      tickRoom(currentRoom);
    if (hasUpdate) {
      markRoomUpdated(roomId);
      broadcastUpdate(roomId);
    }
    if (hasHandUpdate) {
      broadcastHands(roomId);
    }
    if (roomToast) {
      broadcastRoomToast(roomId, roomToast);
    }
    if (roundAnalysisSnapshots) {
      scheduleRoundAnalysis(roomId, roundAnalysisSnapshots);
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
    stuckPlayerIndices: getRoomStuckPlayerIndices(room),
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

export function broadcastRoomToast(roomId: string, roomToast: RoomToast) {
  getRoom(roomId).io.to(roomId).emit("room_toast", roomToast);
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

function scheduleRoundAnalysis(
  roomId: string,
  snapshots: RoundSnapshot[]
): void {
  setTimeout(() => {
    const room = getRoom(roomId);
    if (!room || room.board.isActive || room.board.pouncer == null) {
      return;
    }

    try {
      if (completeRoundAnalysis(room, snapshots)) {
        markRoomUpdated(roomId);
        broadcastUpdate(roomId);
      }
    } catch (error) {
      console.warn("Unable to complete round analysis", error);
    }
  }, ROUND_ANALYSIS_DEFER_MS);
}
