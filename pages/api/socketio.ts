import {
  CardState,
  addPlayer,
  removePlayer,
  resetBoard,
  rotateDecks,
  startGame,
} from "../../shared/GameUtils";
import {
  broadcastHands,
  broadcastUpdate,
  createRoom,
  deleteRoom,
  getRoom,
} from "../../server/Rooms";

import { Server } from "socket.io";
import { executeMove } from "../../shared/MoveHandler";

export const config = {
  api: {
    bodyParser: false,
  },
};

const socketData: Record<
  string,
  {
    name?: string;
    currentRoom?: string;
  }
> = {};

export default function (req: any, res: any) {
  if (!res.socket.server.io) {
    console.log("*First use, starting socket.io");

    const io = new Server(res.socket.server);
    io.of("/").adapter.on("create-room", (id) => {
      if (id.startsWith("pounce:")) {
        console.log("Set up new board for room: " + id);
        createRoom(io, id);
      }
    });
    io.of("/").adapter.on("leave-room", (id, userId) => {
      if (id.startsWith("pounce:")) {
        console.log(userId + " left " + id);
        const board = getRoom(id).board;
        const player = board.players.find((p) => p.socketId === userId);
        if (player) {
          player.disconnected = true;
          broadcastUpdate(id);
        }
      }
    });
    io.of("/").adapter.on("join-room", (id, userId) => {
      if (id.startsWith("pounce:")) {
        const user = socketData[userId];
        user.currentRoom = id;
        const room = getRoom(id);
        const player = room.board.players.find((p) => p.socketId === userId);
        if (!player) {
          addPlayer(room.board, userId, socketData[userId].name);
        } else {
          player.disconnected = false;
          player.name = socketData[userId].name ?? player.name;
        }
        console.log(
          userId + " entered " + id + " name=" + socketData[userId].name
        );
        broadcastUpdate(id);
        broadcastHands(id);
      }
    });
    io.of("/").adapter.on("delete-room", (id) => {
      if (id.startsWith("pounce:")) {
        console.log("Delete room: " + id);
        deleteRoom(id);
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
        const roomId = "pounce:" + args.roomId;
        if (user.currentRoom != null) {
          await socket.leave(user.currentRoom);
        }
        await socket.join(roomId);
      });
      socket.on("move", (args) => {
        if (user.currentRoom == null) {
          return;
        }
        const pid = getRoom(user.currentRoom).board.players.findIndex(
          (p) => p.socketId === socket.id
        );
        if (pid < 0) {
          return;
        }
        const room = getRoom(user.currentRoom);
        const board = room.board;
        executeMove(board, pid, args);
        broadcastUpdate(user.currentRoom);
      });
      socket.on("add_ai", () => {
        if (user.currentRoom == null) {
          return;
        }

        const room = getRoom(user.currentRoom);
        addPlayer(room.board, null);
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
          broadcastUpdate(user.currentRoom);
        }
      });
      socket.on("start_game", () => {
        if (user.currentRoom == null) {
          return;
        }
        const room = getRoom(user.currentRoom);
        // Remove any disconnected players
        removePlayer(
          room.board,
          ...room.board.players
            .map((p, i) => ({ p, i }))
            .filter((pair) => pair.p.disconnected)
            .map((pair) => pair.i)
        );
        room.aiCooldowns = room.board.players.map(
          () => Date.now() + 2000 + Math.random()
        );
        room.aiBoard = JSON.parse(JSON.stringify(room.board)); // todo: refactor
        startGame(room);
        broadcastUpdate(user.currentRoom);
      });
      socket.on("rotate_decks", () => {
        if (user.currentRoom == null) {
          return;
        }

        const room = getRoom(user.currentRoom);
        rotateDecks(room.board);
        broadcastUpdate(user.currentRoom);
      });
      socket.on("restart_game", () => {
        if (user.currentRoom == null) {
          return;
        }

        const room = getRoom(user.currentRoom);
        resetBoard(room.board);
        room.board.players.forEach((p) => {
          p.scores = [];
          p.totalPoints = 0;
        });
        broadcastUpdate(user.currentRoom);
        broadcastHands(user.currentRoom);
      });
      socket.on("set_ai_level", (args) => {
        if (user.currentRoom == null) {
          return;
        }
        const isSimulationMode = args.speed === 1000;
        const room = getRoom(user.currentRoom);
        if (isSimulationMode) {
          room.autoStart = true;
          room.timescale = 100;
          room.board.players.forEach((p) => {
            if (p.socketId != null) {
              // Mark any humans as spectating
              p.isSpectating = true;
            }
          });
        } else {
          room.timescale = 1;
          room.autoStart = false;
          const speed = Math.max(
            1,
            Math.min(500, typeof args.speed === "number" ? args.speed : 3)
          );
          room.aiSpeed = speed;
        }
      });
      socket.on("disconnect", () => {
        delete socketData[socket.id];
      });
      socket.on("update_hand", ({ item, location }) => {
        if (user.currentRoom == null) {
          return;
        }
        const room = getRoom(user.currentRoom);
        const player = room.board.players.findIndex(
          (p) => p.socketId === socket.id
        );
        const hands = room.hands;
        hands[player] = hands[player] ?? {};
        if (location !== undefined) {
          hands[player].location = location;
        }
        if (item !== undefined) {
          hands[player].item = item;
        }
        broadcastHands(user.currentRoom);
      });
    });

    res.socket.server.io = io;
  } else {
    console.log("socket.io already running");
  }
  res.end();
}
