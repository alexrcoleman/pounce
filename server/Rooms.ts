import {
  BoardState,
  CardState,
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
    io: Server;
    board: BoardState;
    interval: NodeJS.Timer;
    aiSpeed: number;
    aiCooldowns: number[];
    hands: {
      location?: CardState | null;
      item?: CardState | null;
    }[]; // todo: put this in the board?
    /**
     * What the AI currently sees the board as (to give reaction delay)
     */
    aiBoard: BoardState;
  }
> = {};

export function createRoom(io: Server, roomId: string) {
  const board = createBoard(0);
  const interval = setInterval(() => {
    const room = rooms[roomId];
    const aiCooldowns = room.aiCooldowns;
    let hasUpdate = false,
      hasHandUpdate = false;
    if (!board.isActive) {
      //no-op
    } else if (isGameOver(board)) {
      scoreBoard(board);
      hasUpdate = true;
    } else {
      board.players.map((player, index) => {
        if (aiCooldowns[index] > Date.now() || player.socketId != null) {
          return false;
        }
        hasUpdate = true;
        room.hands[index] = room.hands[index] ?? {};
        const move = getBasicAIMove(room.aiBoard, index);
        const moveResult = executeMove(board, index, move, room.hands[index]);

        let cooldownDist = {
          mean: 2500 / room.aiSpeed,
          deviation: 500 / room.aiSpeed,
        };
        if (moveResult?.cursorMove) {
          room.hands[index].location = moveResult.cursorMove;
          hasHandUpdate = true;
          cooldownDist = {
            mean: Math.min(500, 1500 / room.aiSpeed),
            deviation: Math.min(100, 300 / room.aiSpeed),
          };
        }
        // todo: normal distribution
        const delay =
          (Math.random() - 0.5) * 2 * cooldownDist.deviation +
          cooldownDist.mean;
        aiCooldowns[index] = Date.now() + delay;
      });
    }
    if (hasUpdate) {
      broadcastUpdate(roomId);
    }
    if (hasHandUpdate) {
      broadcastHands(roomId);
    }
  }, 100);
  rooms[roomId] = {
    io,
    board,
    interval,
    aiSpeed: 3,
    aiCooldowns: [],
    hands: [],
    aiBoard: JSON.parse(JSON.stringify(board)),
  };
  broadcastUpdate(roomId);
}

export function broadcastUpdate(roomId: string) {
  const room = rooms[roomId];
  room.io.to(roomId).emit("update", {
    board: room.board,
    time: Date.now(),
  });
  const reactionDelay = 1800 / room.aiSpeed;
  setTimeout(() => {
    room.aiBoard = JSON.parse(JSON.stringify(room.board));
  }, reactionDelay);
}

export function broadcastHands(roomId: string) {
  const room = getRoom(roomId);
  room.io.to(roomId).emit("update_hands", {
    hands: room.board.players.map((_, index) => room.hands[index] ?? {}),
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
