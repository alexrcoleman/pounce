import {
  BoardState,
  addPlayer,
  createBoard,
  isGameOver,
  removePlayer,
  resetBoard,
  startGame,
} from "../../shared/GameUtils";
import { executeMove, handleAIMove } from "../../shared/PlayerUtils";

import { Server } from "socket.io";

export const config = {
  api: {
    bodyParser: false,
  },
};

const rooms: Record<string, { board: BoardState; interval: NodeJS.Timer }> = {};
const speed = 5;

function createRoom(io: Server, roomId: string) {
  const board = createBoard(0);
  let aiCooldowns = board.players.map(() => 0);
  const interval = setInterval(() => {
    let hasUpdate = false;
    if (!board.isActive) {
      //no-op
    } else if (isGameOver(board)) {
      const pouncer = board.players.findIndex((p) => p.pounceDeck.length === 0);
      board.isActive = false;
      board.pouncer = pouncer;
      hasUpdate = true;
    } else {
      hasUpdate =
        board.players
          .map((player, index) => {
            if (aiCooldowns[index] > Date.now() || player.socketId != null) {
              return false;
            }
            handleAIMove(board, index);
            aiCooldowns[index] =
              Date.now() + (Math.random() * 2000 + 5000) / speed;
            return true;
          })
          .find(Boolean) != null;
    }
    if (hasUpdate) {
      io.to(roomId).emit("update", { board, time: Date.now() });
    }
  }, 100);
  rooms[roomId] = { board, interval };
  io.to(roomId).emit("update", {
    board,
    time: Date.now(),
  });
}

const socketData: Record<string, { name: string }> = {};

export default function (req: any, res: any) {
  if (!res.socket.server.io) {
    console.log("*First use, starting socket.io");

    const io = new Server(res.socket.server);
    const broadcastUpdate = (roomId: string) =>
      io.to(roomId).emit("update", {
        board: rooms[roomId].board,
        time: Date.now(),
      });
    io.of("/").adapter.on("create-room", (id) => {
      if (id.startsWith("pounce:")) {
        console.log("Set up new board for room: " + id);
        createRoom(io, id);
      }
    });
    io.of("/").adapter.on("leave-room", (id, userId) => {
      if (id.startsWith("pounce:")) {
        console.log(userId + " left " + id);
        const board = rooms[id].board;
        const index = board.players.findIndex((p) => p.socketId === userId);
        removePlayer(board, index);
        broadcastUpdate(id);
      }
    });
    io.of("/").adapter.on("join-room", (id, userId) => {
      if (id.startsWith("pounce:")) {
        console.log(
          userId + " entered " + id + " name=" + socketData[userId].name
        );
        addPlayer(rooms[id].board, userId, socketData[userId].name);
        broadcastUpdate(id);
      }
    });
    io.of("/").adapter.on("delete-room", (id) => {
      if (id.startsWith("pounce:")) {
        console.log("Delete room: " + id);
        const room = rooms[id];
        clearInterval(room.interval);
        delete rooms[id];
      }
    });
    io.on("connection", (socket) => {
      let currentRoom: string | null = null;
      let currentPlayerId: number | null = null;
      socket.on("join_room", async (args) => {
        socketData[socket.id] = socketData[socket.id] ?? {};
        socketData[socket.id].name = String(args.name);
        const roomId = "pounce:" + args.roomId;
        if (currentRoom != null) {
          socket.leave(currentRoom);
        }
        currentRoom = roomId;
        await socket.join(roomId);
        currentPlayerId = rooms[currentRoom].board.players.findIndex(
          (p) => p.socketId === socket.id
        );
        socket.emit("assign", currentPlayerId);
      });
      socket.on("move", (args) => {
        if (currentPlayerId == null || currentRoom == null) {
          return;
        }
        const room = rooms[currentRoom];
        const board = room.board;
        executeMove(board, currentPlayerId, args);
        broadcastUpdate(currentRoom);
      });
      socket.on("add_ai", () => {
        if (currentPlayerId == null || currentRoom == null) {
          return;
        }

        const room = rooms[currentRoom];
        addPlayer(room.board, null);
        broadcastUpdate(currentRoom);
      });
      socket.on("remove_ai", () => {
        if (currentPlayerId == null || currentRoom == null) {
          return;
        }

        const { board } = rooms[currentRoom];
        const aiIndex = board.players.findIndex((p) => p.socketId == null);
        removePlayer(board, aiIndex);
        broadcastUpdate(currentRoom);
      });
      socket.on("start_game", () => {
        if (currentPlayerId == null || currentRoom == null) {
          return;
        }

        const room = rooms[currentRoom];
        startGame(room.board);
        broadcastUpdate(currentRoom);
      });
      socket.on("restart_game", () => {
        if (currentPlayerId == null || currentRoom == null) {
          return;
        }

        const room = rooms[currentRoom];
        resetBoard(room.board);
        broadcastUpdate(currentRoom);
      });
      socket.on("disconnect", () => {
        delete socketData[socket.id];
      });
    });

    res.socket.server.io = io;
  } else {
    console.log("socket.io already running");
  }
  res.end();
}
