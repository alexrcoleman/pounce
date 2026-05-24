import {
  addPlayer,
  removePlayer,
  rotateDecks,
} from "../shared/GameUtils";
import {
  broadcastHands,
  broadcastUpdate,
  createRoom,
  getRoom,
  markRoomUpdated,
  scheduleRoomDelete,
} from "../server/Rooms";
import {
  dealRemainingRoomPlayers,
  dealRoomHands,
  recordRoundSnapshot,
  removeDisconnectedPlayers,
  resetRoomHandAfterCenterPlay,
  resetRoom,
  setRoomFairHandRotation,
  setRoomAILevel,
  setRoomPaused,
  startRoomGame,
  updateRoomHand,
} from "../shared/RoomLogic";

import { Server } from "socket.io";
import { executeMove } from "../shared/MoveHandler";
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/SocketTypes";

const socketData: Record<
  string,
  {
    name?: string;
    currentRoom?: string;
    playerSessionId?: string;
  }
> = {};

const DEFAULT_SOCKET_PORT = 3001;

export default function createSocketIOServer() {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>({
    cors: {
      origin: process.env.WEB_APP_ORIGIN
        ? process.env.WEB_APP_ORIGIN.split(",").map((origin) => origin.trim())
        : ["http://localhost:3000", "http://localhost:3010"],
      methods: ["GET", "POST"],
    },
  });
  const port = Number(process.env.PORT ?? DEFAULT_SOCKET_PORT);
  io.listen(Number.isFinite(port) ? port : DEFAULT_SOCKET_PORT);
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
    socket.on("join_room", async (args) => {
      console.log("join_room " + socket.id, args);
      if (args.roomId == null) {
        if (user.currentRoom != null) {
          console.log("Removing " + socket.id + " from " + user.currentRoom);
          await socket.leave(user.currentRoom);
        }
        user.currentRoom = undefined;
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
      const result = executeMove(board, pid, args.payload);
      if (result == null) {
        ack?.({
          actionId: args.actionId,
          ok: false,
          revision: room.revision,
          reason: "Move rejected",
        });
        return;
      }
      recordRoundSnapshot(room, "move", Date.now(), pid, args.payload);
      const didResetHand = resetRoomHandAfterCenterPlay(
        room,
        pid,
        args.payload
      );
      markRoomUpdated(user.currentRoom);
      ack?.({ actionId: args.actionId, ok: true, revision: room.revision });
      broadcastUpdate(user.currentRoom);
      if (didResetHand) {
        broadcastHands(user.currentRoom);
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
    socket.on("update_hand", ({ item, location }) => {
      if (user.currentRoom == null) {
        return;
      }
      const room = getRoom(user.currentRoom);
      const player = room.board.players.findIndex(
        (p) => p.socketId === socket.id
      );
      updateRoomHand(room, player, { item, location });
      broadcastHands(user.currentRoom);
    });
  });
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
  room.hands[playerIndex] = {};
  return true;
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
