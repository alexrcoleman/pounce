import {
  CardState,
  addPlayer,
  removePlayer,
  resetBoard,
  rotateDecks,
  startGame,
} from "../../shared/GameUtils";
import { createRoom, deleteRoom, getRoom } from "../../server/Rooms";

import { Server } from "socket.io";
import { executeMove } from "../../shared/PlayerUtils";

export const config = {
  api: {
    bodyParser: false,
  },
};

const socketData: Record<
  string,
  { name?: string; currentRoom?: string; handLocation?: CardState | null }
> = {};

export default function (req: any, res: any) {
  if (!res.socket.server.io) {
    console.log("*First use, starting socket.io");

    const io = new Server(res.socket.server);
    const broadcastUpdate = (roomId: string) =>
      io.to(roomId).emit("update", {
        board: getRoom(roomId).board,
        time: Date.now(),
      });
    const broadcastHands = (roomId: string) => {
      const room = getRoom(roomId);
      const hands = room.board.players.map((p, index) => {
        return { location: socketData[p.socketId ?? ""]?.handLocation ?? null };
      });
      io.to(roomId).emit("update_hands", {
        hands,
      });
    };
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
        addPlayer(getRoom(id).board, userId, socketData[userId].name);
        broadcastUpdate(id);
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
        if (getRoom(roomId)?.board?.isActive) {
          socket.emit(
            "alert",
            "Room currently has in progress game, join once the game is over"
          );
          return;
        }
        if (user.currentRoom != null) {
          await socket.leave(user.currentRoom);
        }
        user.currentRoom = roomId;
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
        startGame(room.board);
        room.aiCooldowns = room.board.players.map(() => Date.now() + 1000);
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
        broadcastUpdate(user.currentRoom);
      });
      socket.on("set_ai_speed", (args) => {
        if (user.currentRoom == null) {
          return;
        }
        const speed = Math.max(
          3,
          Math.min(8, typeof args.speed === "number" ? args.speed : 3)
        );
        getRoom(user.currentRoom).aiSpeed = speed;
      });
      socket.on("disconnect", () => {
        delete socketData[socket.id];
      });
      socket.on("update_hand", ({ location }) => {
        if (user.currentRoom == null) {
          return;
        }
        socketData[socket.id].handLocation = location;
        broadcastHands(user.currentRoom);
      });
    });

    res.socket.server.io = io;
  } else {
    console.log("socket.io already running");
  }
  res.end();
}
