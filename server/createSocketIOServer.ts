import {
  addPlayer,
  type BoardState,
  isGameOver,
  type PlayerState,
  removePlayer,
  rotateDecks,
} from "../shared/GameUtils";
import {
  broadcastHands,
  broadcastRoomToast,
  broadcastUpdate,
  createRoom,
  getRoom,
  markRoomUpdated,
  scheduleRoomDelete,
} from "../server/Rooms";
import {
  clearRoomHand,
  dealRemainingRoomPlayers,
  dealRoomHands,
  getRoomHandUpdateVersion,
  PLAYER_CENTER_CURSOR_RESET_DELAY_MS,
  recordRoundSnapshot,
  releaseRoomHandAfterCenterPlay,
  removeDisconnectedPlayers,
  resetRoomHandAfterDeckAdvance,
  resetRoomHandAfterCenterPlay,
  resetRoom,
  setRoomFairHandRotation,
  setRoomAILevel,
  setRoomPaused,
  setPlayerReadyForRound,
  startRoomGame,
  updateRoomHand,
} from "../shared/RoomLogic";

import { createServer, IncomingMessage, ServerResponse } from "http";
import { timingSafeEqual } from "crypto";
import { Server } from "socket.io";
import { executeMove, type Move } from "../shared/MoveHandler";
import {
  getServerDrainDescription,
  getServerDrainStage,
  getServerDrainTitle,
} from "../shared/ServerDrainNotice";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  type ServerNotice,
} from "../shared/SocketTypes";
import { createDeckRotationToast } from "../shared/RoomToast";

const socketData: Record<
  string,
  {
    name?: string;
    currentRoom?: string;
    playerSessionId?: string;
  }
> = {};

const DEFAULT_SOCKET_PORT = 3001;
const DEFAULT_DRAIN_WINDOW_MS = 5 * 60 * 1000;
const DRAIN_ENDPOINT_PATH = "/api/admin/drain";
const DRAIN_SECRET_ENV_VAR = "GAME_SERVER_DRAIN_SECRET";
const DRAIN_WINDOW_ENV_VAR = "GAME_SERVER_DRAIN_WINDOW_MS";

let drainingUntil = 0;
let drainStarted = false;
let drainRestartNoticeTimer: ReturnType<typeof setTimeout> | undefined;

export default function createSocketIOServer() {
  let io: Server<ClientToServerEvents, ServerToClientEvents>;
  const httpServer = createServer((req, res) => {
    if (isDrainEndpointRequest(req)) {
      handleDrainRequest(req, res, () => startDrain(io));
    }
  });
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.WEB_APP_ORIGIN
        ? process.env.WEB_APP_ORIGIN.split(",").map((origin) => origin.trim())
        : ["http://localhost:3000", "http://localhost:3010"],
      methods: ["GET", "POST"],
    },
  });
  const port = Number(process.env.PORT ?? DEFAULT_SOCKET_PORT);
  httpServer.listen(Number.isFinite(port) ? port : DEFAULT_SOCKET_PORT);
  io.of("/").adapter.on("create-room", (id) => {
    if (id.startsWith("pounce:")) {
      console.log("Set up new board for room: " + id);
      createRoom(io, id);
    }
  });
  io.of("/").adapter.on("leave-room", (id, userId) => {
    if (id.startsWith("pounce:")) {
      console.log(userId + " left " + id);
      if (markPlayerDisconnected(id, userId)) {
        markRoomUpdated(id);
        broadcastUpdate(id);
        broadcastHands(id);
      }
      const user = socketData[userId];
      if (user?.currentRoom === id) {
        user.currentRoom = undefined;
      }
    }
  });
  io.of("/").adapter.on("join-room", (id, userId) => {
    if (id.startsWith("pounce:")) {
      const user = socketData[userId];
      if (!user) {
        return;
      }
      user.currentRoom = id;
      const room = getRoom(id);
      const player =
        user.playerSessionId != null
          ? room.board.players.find(
              (p) => p.playerSessionId === user.playerSessionId
            )
          : room.board.players.find((p) => p.socketId === userId);
      if (!player) {
        addPlayer(room.board, userId, user.name, user.playerSessionId);
      } else {
        const previousSocketId = player.socketId;
        player.socketId = userId;
        player.playerSessionId = user.playerSessionId ?? player.playerSessionId;
        player.disconnected = false;
        player.disconnectedAt = undefined;
        player.name = user.name ?? player.name;
        if (previousSocketId && previousSocketId !== userId) {
          if (socketData[previousSocketId]) {
            socketData[previousSocketId].currentRoom = undefined;
          }
          io.of("/").sockets.get(previousSocketId)?.leave(id);
        }
      }
      console.log(
        userId + " entered " + id + " name=" + user.name
      );
      markRoomUpdated(id);
      broadcastUpdate(id);
      broadcastHands(id);
    }
  });
  io.of("/").adapter.on("delete-room", (id) => {
    if (id.startsWith("pounce:")) {
      console.log("Socket.IO room emptied: " + id);
      scheduleRoomDelete(id);
    }
  });
  io.on("connection", (socket) => {
    socketData[socket.id] = {};
    const user = socketData[socket.id];
    socket.on("join_room", async (args, ack) => {
      console.log("join_room " + socket.id, args);
      if (args.roomId == null) {
        if (user.currentRoom != null) {
          console.log("Removing " + socket.id + " from " + user.currentRoom);
          await socket.leave(user.currentRoom);
        }
        user.currentRoom = undefined;
        ack?.({ ok: true });
        return;
      }
      user.name = String(args.name);
      user.playerSessionId =
        typeof args.playerSessionId === "string" && args.playerSessionId
          ? args.playerSessionId
          : socket.id;
      const roomId = "pounce:" + args.roomId;
      if (user.currentRoom != null) {
        await socket.leave(user.currentRoom);
      }
      await socket.join(roomId);
      if (isDrainActive()) {
        socket.emit("server_notice", createDrainNotice());
      }
      ack?.({ ok: true });
    });
    socket.on("move", (args, ack) => {
      if (user.currentRoom == null) {
        ack?.({
          actionId: args.actionId,
          ok: false,
          revision: 0,
          reason: "Not in a room",
        });
        return;
      }
      const pid = getRoom(user.currentRoom).board.players.findIndex(
        (p) => p.socketId === socket.id
      );
      if (pid < 0) {
        ack?.({
          actionId: args.actionId,
          ok: false,
          revision: getRoom(user.currentRoom).revision,
          reason: "No player in room",
        });
        return;
      }
      const room = getRoom(user.currentRoom);
      const board = room.board;
      const blockedReason = getBlockedMoveReason(board, board.players[pid]);
      if (blockedReason) {
        ack?.({
          actionId: args.actionId,
          ok: false,
          revision: room.revision,
          reason: blockedReason,
        });
        return;
      }
      const result = executeMove(board, pid, args.payload);
      if (result == null) {
        ack?.({
          actionId: args.actionId,
          ok: false,
          revision: room.revision,
          reason: "That move is no longer available.",
        });
        return;
      }
      recordRoundSnapshot(room, "move", Date.now(), pid, args.payload);
      const didReleaseHand = releaseRoomHandAfterCenterPlay(
        room,
        pid,
        args.payload,
        result.clearCursorLocation
      );
      const didResetHand =
        didReleaseHand || resetRoomHandAfterDeckAdvance(room, pid, args.payload);
      const handUpdateVersion = didReleaseHand
        ? getRoomHandUpdateVersion(room, pid)
        : null;
      markRoomUpdated(user.currentRoom);
      ack?.({ actionId: args.actionId, ok: true, revision: room.revision });
      broadcastUpdate(user.currentRoom);
      if (didResetHand) {
        broadcastHands(user.currentRoom);
      }
      if (handUpdateVersion != null) {
        schedulePlayerCenterCursorReset(
          user.currentRoom,
          pid,
          args.payload,
          handUpdateVersion
        );
      }
    });
    socket.on("add_ai", () => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      addPlayer(room.board, null);
      markRoomUpdated(user.currentRoom);
      broadcastUpdate(user.currentRoom);
    });
    socket.on("remove_ai", () => {
      if (user.currentRoom == null) {
        return;
      }

      const { board } = getRoom(user.currentRoom);
      const aiIndex = board.players.findIndex((p) => p.socketId == null);
      if (aiIndex >= 0) {
        removePlayer(board, aiIndex);
        markRoomUpdated(user.currentRoom);
        broadcastUpdate(user.currentRoom);
      }
    });
    socket.on("set_ai_count", (args) => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      if (!isHost(room.board, socket.id) || room.board.isActive) {
        return;
      }

      const targetCount = normalizeAICount(args.count);
      if (targetCount == null) {
        return;
      }
      const currentCount = getAICount(room.board);
      if (targetCount === currentCount) {
        return;
      }

      if (targetCount > currentCount) {
        for (let i = currentCount; i < targetCount; i++) {
          addPlayer(room.board, null);
        }
      } else {
        for (let i = currentCount; i > targetCount; i--) {
          const aiIndex = room.board.players.findIndex(
            (p) => p.socketId == null
          );
          if (aiIndex < 0) {
            break;
          }
          removePlayer(room.board, aiIndex);
        }
      }
      markRoomUpdated(user.currentRoom);
      broadcastUpdate(user.currentRoom);
    });
    socket.on("remove_disconnected_players", () => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      if (!isHost(room.board, socket.id)) {
        return;
      }

      if (removeDisconnectedPlayers(room)) {
        markRoomUpdated(user.currentRoom);
        broadcastUpdate(user.currentRoom);
        broadcastHands(user.currentRoom);
      }
    });
    socket.on("set_fair_hand_rotation", (args) => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      if (!isHost(room.board, socket.id)) {
        return;
      }

      if (setRoomFairHandRotation(room, args.enabled)) {
        markRoomUpdated(user.currentRoom);
        broadcastUpdate(user.currentRoom);
      }
    });
    socket.on("start_game", () => {
      if (user.currentRoom == null) {
        return;
      }
      const room = getRoom(user.currentRoom);
      startRoomGame(room);
      markRoomUpdated(user.currentRoom);
      broadcastUpdate(user.currentRoom);
      broadcastHands(user.currentRoom);
    });
    socket.on("set_round_ready", (args) => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      const playerIndex = room.board.players.findIndex(
        (p) => p.socketId === socket.id
      );
      const { didChange, didStart } = setPlayerReadyForRound(
        room,
        playerIndex,
        args.ready
      );
      if (!didChange) {
        return;
      }

      markRoomUpdated(user.currentRoom);
      broadcastUpdate(user.currentRoom);
      if (didStart) {
        broadcastHands(user.currentRoom);
      }
    });
    socket.on("deal_hands", () => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      if (!isHost(room.board, socket.id)) {
        return;
      }

      if (dealRoomHands(room)) {
        markRoomUpdated(user.currentRoom);
        broadcastUpdate(user.currentRoom);
        broadcastHands(user.currentRoom);
      }
    });
    socket.on("deal_remaining_players", () => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      if (!isHost(room.board, socket.id)) {
        return;
      }

      if (dealRemainingRoomPlayers(room)) {
        markRoomUpdated(user.currentRoom);
        broadcastUpdate(user.currentRoom);
        broadcastHands(user.currentRoom);
      }
    });
    socket.on("set_paused", (args) => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      if (!isHost(room.board, socket.id)) {
        return;
      }

      if (setRoomPaused(room, args.paused)) {
        markRoomUpdated(user.currentRoom);
        broadcastUpdate(user.currentRoom);
        broadcastHands(user.currentRoom);
      }
    });
    socket.on("rotate_decks", () => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      rotateDecks(room.board);
      recordRoundSnapshot(room, "manual_rotate", Date.now());
      markRoomUpdated(user.currentRoom);
      broadcastUpdate(user.currentRoom);
      broadcastRoomToast(
        user.currentRoom,
        createDeckRotationToast("manual")
      );
    });
    socket.on("restart_game", () => {
      if (user.currentRoom == null) {
        return;
      }

      const room = getRoom(user.currentRoom);
      resetRoom(room);
      markRoomUpdated(user.currentRoom);
      broadcastUpdate(user.currentRoom);
      broadcastHands(user.currentRoom);
    });
    socket.on("set_ai_level", (args) => {
      if (user.currentRoom == null) {
        return;
      }
      const room = getRoom(user.currentRoom);
      setRoomAILevel(room, typeof args.speed === "number" ? args.speed : 3);
      markRoomUpdated(user.currentRoom);
      broadcastUpdate(user.currentRoom);
    });
    socket.on("disconnecting", () => {
      Array.from(socket.rooms)
        .filter((roomId) => roomId.startsWith("pounce:"))
        .forEach((roomId) => {
          if (markPlayerDisconnected(roomId, socket.id)) {
            markRoomUpdated(roomId);
            broadcastUpdate(roomId);
            broadcastHands(roomId);
          }
        });
    });
    socket.on("disconnect", () => {
      delete socketData[socket.id];
    });
    socket.on("room_ping", (_args, ack) => {
      ack?.({ serverTime: Date.now() });
    });
    socket.on("update_hand", ({ item, items, location }) => {
      if (user.currentRoom == null) {
        return;
      }
      const room = getRoom(user.currentRoom);
      const player = room.board.players.findIndex(
        (p) => p.socketId === socket.id
      );
      updateRoomHand(room, player, { item, items, location });
      broadcastHands(user.currentRoom);
    });
  });
}

function isDrainEndpointRequest(req: IncomingMessage): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.pathname === DRAIN_ENDPOINT_PATH;
}

function handleDrainRequest(
  req: IncomingMessage,
  res: ServerResponse,
  startDrain: () => ServerNotice
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    respondJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  const expectedSecret = process.env[DRAIN_SECRET_ENV_VAR];
  if (!expectedSecret) {
    respondJson(res, 503, {
      ok: false,
      error: `${DRAIN_SECRET_ENV_VAR} is not configured`,
    });
    return;
  }

  const providedSecret = getDrainRequestSecret(req);
  if (!providedSecret || !secretsEqual(providedSecret, expectedSecret)) {
    respondJson(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  const notice = startDrain();
  respondJson(res, 200, {
    ok: true,
    type: notice.type,
    stage: notice.stage,
    message: notice.message,
    description: notice.description,
    retryAfterMs: notice.retryAfterMs,
    drainingUntil: notice.drainingUntil,
  });
}

function startDrain(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): ServerNotice {
  const now = Date.now();
  drainStarted = true;
  drainingUntil = Math.max(drainingUntil, now + getDrainWindowMs());
  const notice = createDrainNotice(now);
  io.emit("server_notice", notice);
  scheduleDrainRestartNotice(io);
  console.log(
    "Game server drain started until " +
      new Date(notice.drainingUntil).toISOString()
  );
  return notice;
}

function isDrainActive() {
  return drainStarted;
}

function createDrainNotice(now = Date.now()): ServerNotice {
  const retryAfterMs = Math.max(0, drainingUntil - now);
  const stage = getServerDrainStage(drainingUntil, now);
  return {
    type: "server_draining",
    stage,
    message: getServerDrainTitle(drainingUntil, now),
    description: getServerDrainDescription(stage),
    retryAfterMs,
    drainingUntil,
  };
}

function createDrainRestartingNotice(): ServerNotice {
  const now = Date.now();
  const stage = getServerDrainStage(drainingUntil, now);
  return {
    type: "server_draining",
    stage,
    message: getServerDrainTitle(drainingUntil, now),
    description: getServerDrainDescription(stage),
    retryAfterMs: 0,
    drainingUntil,
  };
}

function scheduleDrainRestartNotice(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  if (drainRestartNoticeTimer) {
    clearTimeout(drainRestartNoticeTimer);
  }

  const delay = Math.max(0, drainingUntil - Date.now());
  drainRestartNoticeTimer = setTimeout(() => {
    drainRestartNoticeTimer = undefined;
    io.emit("server_notice", createDrainRestartingNotice());
  }, delay);
}

function getDrainWindowMs() {
  const configured = Number(process.env[DRAIN_WINDOW_ENV_VAR]);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DRAIN_WINDOW_MS;
}

function getDrainRequestSecret(req: IncomingMessage): string | null {
  const authorization = getFirstHeader(req.headers.authorization);
  const bearerPrefix = "Bearer ";
  if (authorization?.startsWith(bearerPrefix)) {
    return authorization.slice(bearerPrefix.length).trim();
  }

  return getFirstHeader(req.headers["x-pounce-drain-secret"])?.trim() ?? null;
}

function getFirstHeader(
  header: string | string[] | undefined
): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function secretsEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function respondJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>
) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function markPlayerDisconnected(roomId: string, socketId: string): boolean {
  const room = getRoom(roomId);
  if (!room) {
    return false;
  }

  const playerIndex = room.board.players.findIndex(
    (p) => p.socketId === socketId
  );
  if (playerIndex < 0) {
    return false;
  }

  const player = room.board.players[playerIndex];
  if (player.disconnected) {
    return false;
  }

  player.disconnected = true;
  player.disconnectedAt = Date.now();
  player.isReadyForRound = false;
  clearRoomHand(room, playerIndex);
  return true;
}

function schedulePlayerCenterCursorReset(
  roomId: string,
  playerIndex: number,
  move: Move,
  handUpdateVersion: number
): void {
  setTimeout(() => {
    const room = getRoom(roomId);
    if (
      !room ||
      getRoomHandUpdateVersion(room, playerIndex) !== handUpdateVersion
    ) {
      return;
    }

    if (resetRoomHandAfterCenterPlay(room, playerIndex, move)) {
      broadcastHands(roomId);
    }
  }, PLAYER_CENTER_CURSOR_RESET_DELAY_MS);
}

function isHost(
  board: { players: { disconnected?: boolean; socketId: string | null }[] },
  socketId: string
) {
  const playerIndex = board.players.findIndex((p) => p.socketId === socketId);
  if (playerIndex < 0 || board.players[playerIndex].disconnected) {
    return false;
  }

  const hostIndex = board.players.findIndex(
    (p) => !p.disconnected && p.socketId != null
  );
  return hostIndex === playerIndex;
}

function getBlockedMoveReason(
  board: BoardState,
  player: PlayerState | undefined
): string | null {
  if (!board.isActive) {
    return board.pouncer != null
      ? "The round is already over."
      : "The game is not accepting moves right now.";
  }
  if (board.isPaused) {
    return "The game is paused.";
  }
  if (isGameOver(board)) {
    return "The round is already over.";
  }
  if (player?.isSpectating) {
    return "Spectating players cannot move.";
  }

  return null;
}

function normalizeAICount(count: unknown): number | null {
  const numericCount = typeof count === "number" ? count : Number(count);
  if (!Number.isFinite(numericCount)) {
    return null;
  }
  return Math.max(0, Math.min(5, Math.trunc(numericCount)));
}

function getAICount(board: { players: { socketId: string | null }[] }): number {
  return board.players.filter((p) => p.socketId == null).length;
}
