import {
  BoardState,
  createBoard,
  isGameOver,
  scoreBoard,
} from "../shared/GameUtils";

import { Server } from "socket.io";
import { executeMove } from "../shared/MoveHandler";
import { getBasicAIMove } from "../shared/ComputerV1";

const rooms: Record<
  string,
  {
    board: BoardState;
    interval: NodeJS.Timer;
    aiSpeed: number;
    aiCooldowns: number[];
  }
> = {};

export function createRoom(io: Server, roomId: string) {
  const board = createBoard(0);
  const interval = setInterval(() => {
    const room = rooms[roomId];
    const aiCooldowns = room.aiCooldowns;
    let hasUpdate = false;
    if (!board.isActive) {
      //no-op
    } else if (isGameOver(board)) {
      scoreBoard(board);
      hasUpdate = true;
    } else {
      hasUpdate =
        board.players
          .map((player, index) => {
            if (aiCooldowns[index] > Date.now() || player.socketId != null) {
              return false;
            }
            const move = getBasicAIMove(board, index);
            executeMove(board, index, move);
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
  rooms[roomId] = { board, interval, aiSpeed: 3, aiCooldowns: [] };
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
