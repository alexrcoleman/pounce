import { BoardState, createBoard, isGameOver } from "../shared/GameUtils";

import { Server } from "socket.io";
import { handleAIMove } from "../shared/PlayerUtils";

const rooms: Record<
  string,
  { board: BoardState; interval: NodeJS.Timer; aiSpeed: number }
> = {};

export function createRoom(io: Server, roomId: string) {
  const board = createBoard(0);
  let aiCooldowns = board.players.map(() => 0);
  const interval = setInterval(() => {
    const room = rooms[roomId];
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
              Date.now() + (Math.random() * 2000 + 5000) / room.aiSpeed;
            return true;
          })
          .find(Boolean) != null;
    }
    if (hasUpdate) {
      io.to(roomId).emit("update", { board, time: Date.now() });
    }
  }, 100);
  rooms[roomId] = { board, interval, aiSpeed: 3 };
  io.to(roomId).emit("update", {
    board,
    time: Date.now(),
  });
}

export function getRoom(roomId: string) {
  return rooms[roomId];
}
export function deleteRoom(roomId: string) {
  const room = getRoom(roomId);
  clearInterval(room.interval);
  delete rooms[roomId];
}
