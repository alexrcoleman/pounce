import { Server } from "socket.io";
import { createRoomState, RoomState } from "../shared/RoomState";
import {
  completeRoundAnalysis,
  getNextRoomSimulationTickTime,
  getRoomHandDelta,
  getRoomHands,
  getRoomStuckPlayerIndices,
  scheduleAIReactionBoard,
  shouldFastForwardRoomSimulation,
  tickRoom,
  type RoomTickResult,
} from "../shared/RoomLogic";
import type { RoundSnapshot } from "../shared/RoundAnalysis";
import type { RoomToast } from "../shared/RoomToast";
import type {
  BoardUpdate,
  PendingRoomAction,
  RoomAction,
} from "../shared/SocketTypes";

export type ServerRoomState = RoomState & {
  io: Server;
  tickTimeout: ReturnType<typeof setTimeout> | null;
  simulatedNow: number;
  simulationFlushTimeout: ReturnType<typeof setTimeout> | null;
  pendingSimulationHasUpdate: boolean;
  pendingSimulationHasHandUpdate: boolean;
  pendingSimulationRoomToast: RoomToast | null;
};

export const ROOM_DELETE_GRACE_PERIOD_MS = 10 * 60 * 1000;

const rooms: Record<string, ServerRoomState> = {};
const roomDeleteTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const ROUND_ANALYSIS_DEFER_MS = 50;
const SERVER_ROOM_TICK_DELAY_MS = 1;
const SERVER_SIMULATION_TICK_DELAY_MS = 0;
const SERVER_SIMULATION_BROADCAST_DELAY_MS = 16;

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
    tickTimeout: null,
    simulatedNow: Date.now(),
    simulationFlushTimeout: null,
    pendingSimulationHasUpdate: false,
    pendingSimulationHasHandUpdate: false,
    pendingSimulationRoomToast: null,
  };
  rooms[roomId] = room;
  scheduleNextRoomTick(roomId, 0);
  broadcastUpdate(roomId);
}

type ServerRoomTickTiming = {
  now: number;
  delayMs: number;
};

function scheduleNextRoomTick(roomId: string, delayMs: number): void {
  const room = rooms[roomId];
  if (!room) {
    return;
  }

  room.tickTimeout = setTimeout(() => runRoomTick(roomId), delayMs);
}

function runRoomTick(roomId: string): void {
  const room = rooms[roomId];
  if (!room) {
    return;
  }

  room.tickTimeout = null;
  const tickTiming = getServerRoomTickTiming(room);
  room.simulatedNow = tickTiming.now;
  const result = tickRoom(room, tickTiming.now);
  if (room.settings.simulationMode) {
    queueServerSimulationTickResult(roomId, result);
  } else {
    broadcastServerRoomTickResult(roomId, result);
  }

  scheduleNextRoomTick(roomId, tickTiming.delayMs);
}

function getServerRoomTickTiming(room: ServerRoomState): ServerRoomTickTiming {
  if (!shouldFastForwardRoomSimulation(room)) {
    return {
      now: Date.now(),
      delayMs: SERVER_ROOM_TICK_DELAY_MS,
    };
  }

  const nextSimulationTickTime = getNextRoomSimulationTickTime(
    room,
    room.simulatedNow
  );
  if (nextSimulationTickTime == null) {
    return {
      now: Number.isFinite(room.simulatedNow)
        ? room.simulatedNow
        : Date.now(),
      delayMs: SERVER_ROOM_TICK_DELAY_MS,
    };
  }

  return {
    now: nextSimulationTickTime,
    delayMs: SERVER_SIMULATION_TICK_DELAY_MS,
  };
}

function broadcastServerRoomTickResult(
  roomId: string,
  {
    hasUpdate,
    hasHandUpdate,
    handUpdatePlayerIndices,
    actions,
    roomToast,
    roundAnalysisSnapshots,
  }: RoomTickResult
): void {
  if (hasUpdate) {
    markRoomUpdated(roomId);
    broadcastUpdate(roomId);
  } else if (actions.length > 0) {
    broadcastRoomActions(roomId, actions);
  }
  if (hasHandUpdate && hasUpdate) {
    broadcastHands(roomId);
  } else if (handUpdatePlayerIndices.length > 0) {
    broadcastHandDeltas(roomId, handUpdatePlayerIndices);
  }
  if (roomToast) {
    broadcastRoomToast(roomId, roomToast);
  }
  if (roundAnalysisSnapshots) {
    scheduleRoundAnalysis(roomId, roundAnalysisSnapshots);
  }
}

function queueServerSimulationTickResult(
  roomId: string,
  {
    hasUpdate,
    hasHandUpdate,
    handUpdatePlayerIndices,
    actions,
    roomToast,
    roundAnalysisSnapshots,
  }: RoomTickResult
): void {
  const room = rooms[roomId];
  if (!room) {
    return;
  }

  if (hasUpdate) {
    markRoomUpdated(roomId);
    room.pendingSimulationHasUpdate = true;
  } else if (actions.length > 0) {
    broadcastRoomActions(roomId, actions);
  }
  if (hasHandUpdate && hasUpdate) {
    room.pendingSimulationHasHandUpdate = true;
  } else if (handUpdatePlayerIndices.length > 0) {
    broadcastHandDeltas(roomId, handUpdatePlayerIndices);
  }
  if (roomToast) {
    room.pendingSimulationRoomToast = roomToast;
  }
  if (roundAnalysisSnapshots) {
    scheduleRoundAnalysis(roomId, roundAnalysisSnapshots);
  }
  if (hasUpdate || hasHandUpdate || roomToast) {
    scheduleSimulationBroadcastFlush(roomId);
  }
}

function scheduleSimulationBroadcastFlush(roomId: string): void {
  const room = rooms[roomId];
  if (!room || room.simulationFlushTimeout != null) {
    return;
  }

  room.simulationFlushTimeout = setTimeout(
    () => flushServerSimulationBroadcast(roomId),
    SERVER_SIMULATION_BROADCAST_DELAY_MS
  );
}

function flushServerSimulationBroadcast(roomId: string): void {
  const room = rooms[roomId];
  if (!room) {
    return;
  }

  room.simulationFlushTimeout = null;
  const shouldBroadcastUpdate = room.pendingSimulationHasUpdate;
  const shouldBroadcastHands = room.pendingSimulationHasHandUpdate;
  const roomToast = room.pendingSimulationRoomToast;
  room.pendingSimulationHasUpdate = false;
  room.pendingSimulationHasHandUpdate = false;
  room.pendingSimulationRoomToast = null;

  if (shouldBroadcastUpdate) {
    broadcastUpdate(roomId);
  }
  if (shouldBroadcastHands) {
    broadcastHands(roomId);
  }
  if (roomToast) {
    broadcastRoomToast(roomId, roomToast);
  }
}

function clearServerSimulationBroadcast(room: ServerRoomState): void {
  room.pendingSimulationHasUpdate = false;
  room.pendingSimulationHasHandUpdate = false;
  room.pendingSimulationRoomToast = null;
  if (room.simulationFlushTimeout != null) {
    clearTimeout(room.simulationFlushTimeout);
    room.simulationFlushTimeout = null;
  }
}

export function broadcastUpdate(roomId: string) {
  const room = rooms[roomId];
  room.io.to(roomId).emit("update", createRoomUpdate(roomId));
  scheduleAIReactionBoard(room);
}

export function createRoomUpdate(roomId: string): BoardUpdate {
  const room = rooms[roomId];
  return {
    board: room.board,
    settings: room.settings,
    stuckPlayerIndices: getRoomStuckPlayerIndices(room),
    time: Date.now(),
    revision: room.revision,
    roundAnalysis: room.lastRoundAnalysis,
  };
}

export function markRoomUpdated(roomId: string) {
  rooms[roomId].revision += 1;
}

export function broadcastHands(roomId: string) {
  const room = getRoom(roomId);
  room.io.to(roomId).emit("update_hands", {
    hands: getRoomHands(room),
    versions: room.handUpdateVersions,
  });
}

export function broadcastHandDelta(roomId: string, playerIndex: number) {
  const room = getRoom(roomId);
  const delta = getRoomHandDelta(room, playerIndex);
  if (!delta) {
    return;
  }

  room.io.to(roomId).emit("update_hand_delta", delta);
}

export function broadcastHandDeltas(
  roomId: string,
  playerIndices: readonly number[]
) {
  playerIndices.forEach((playerIndex) =>
    broadcastHandDelta(roomId, playerIndex)
  );
}

export function broadcastRoomToast(roomId: string, roomToast: RoomToast) {
  getRoom(roomId).io.to(roomId).emit("room_toast", roomToast);
}

export function broadcastRoomAction(
  roomId: string,
  action: PendingRoomAction | RoomAction
) {
  const room = getRoom(roomId);
  room.io.to(roomId).emit("room_action", {
    ...action,
    revision: room.revision,
  });
  scheduleAIReactionBoard(room);
}

export function broadcastRoomActions(
  roomId: string,
  actions: readonly (PendingRoomAction | RoomAction)[]
) {
  actions.forEach((action) => {
    markRoomUpdated(roomId);
    broadcastRoomAction(roomId, action);
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
    if (room.tickTimeout != null) {
      clearTimeout(room.tickTimeout);
    }
    clearServerSimulationBroadcast(room);
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
