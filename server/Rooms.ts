import {
  BoardState,
  CardState,
  createBoard,
  isGameOver,
  rotateDecks,
  scoreBoard,
  startGame,
} from "../shared/GameUtils";

import { Server } from "socket.io";
import { executeMove } from "../shared/MoveHandler";
import { getBasicAIMove } from "../shared/ComputerV1";
import shuffle from "../shared/shuffle";
import { cardEquals } from "../shared/CardUtils";

type RoomState = {
  io: Server;
  board: BoardState;
  interval: NodeJS.Timer;
  aiSpeed: number;
  timescale: number;
  aiCooldowns: number[];
  hands: {
    location?: CardState | null;
    item?: CardState | null;
  }[]; // todo: put this in the board?
  /**
   * What the AI currently sees the board as (to give reaction delay)
   */
  aiBoard: BoardState;
  queuedHands: CardState[][][];
  autoStart: boolean;
};
const rooms: Record<string, RoomState> = {};

export function createRoom(io: Server, roomId: string) {
  const board = createBoard(0);
  const interval = setInterval(() => {
    const room = rooms[roomId];
    const aiCooldowns = room.aiCooldowns;
    let hasUpdate = false,
      hasHandUpdate = false;
    if (board.ticksSinceMove >= 100) {
      console.log("Auto-flipping decks");
      // Auto flip decks
      rotateDecks(board);
    }
    if (!board.isActive) {
      //no-op
    } else if (isGameOver(board)) {
      scoreBoard(board);
      hasUpdate = true;
      if (room.autoStart) {
        startGame(room);
      }
    } else {
      const shuffledPlayers = board.players
        .slice()
        .map((p, i) => [p, i] as const);
      shuffledPlayers.sort((a, b) => aiCooldowns[a[1]] - aiCooldowns[b[1]]);
      shuffledPlayers.map(([player, index]) => {
        if (aiCooldowns[index] > Date.now() || player.socketId != null) {
          return false;
        }
        hasUpdate = true;
        room.hands[index] = room.hands[index] ?? {};
        const move = getBasicAIMove(room.aiBoard, index);

        const moveResult = move
          ? executeMove(board, index, move, room.hands[index])
          : null;

        let cooldownDist = {
          mean: 2500 / room.aiSpeed,
          deviation: 500 / room.aiSpeed,
        };
        if (moveResult?.cursorMove) {
          const hand = room.hands[index];
          // TODO: Set the cooldown based on how far the move is
          const currentPos = hand.location
            ? getApproximateCardLocation(room, hand.location)
            : null;
          hand.location = moveResult.cursorMove;
          hand.item = moveResult.cursorMoveItem;
          hasHandUpdate = true;

          let cost = 1500;
          if (currentPos) {
            const targetPos = getApproximateCardLocation(
              room,
              moveResult.cursorMove
            );
            const dx = targetPos[0] - currentPos[0];
            const dy = targetPos[1] - currentPos[1];
            const distance = Math.sqrt(dx * dx + dy * dy);
            cost = 750 + distance * 3;
          }
          cooldownDist = {
            mean: cost / room.aiSpeed,
            deviation: cost / 5 / room.aiSpeed,
          };
        } else {
          if (room.hands[index].item != null) {
            hasHandUpdate = true;
            room.hands[index].item = undefined;
          }
        }
        // todo: normal distribution
        const delay = move
          ? (Math.random() - 0.5) * 2 * cooldownDist.deviation +
            cooldownDist.mean
          : 200 / room.aiSpeed;
        aiCooldowns[index] = Date.now() + delay / room.timescale;
      });
    }
    if (hasUpdate) {
      broadcastUpdate(roomId);
    }
    if (hasHandUpdate) {
      broadcastHands(roomId);
    }
  }, 1);
  rooms[roomId] = {
    io,
    board,
    interval,
    aiSpeed: 3,
    aiCooldowns: [],
    hands: [],
    aiBoard: JSON.parse(JSON.stringify(board)),
    queuedHands: [],
    autoStart: false,
    timescale: 1,
  };
  broadcastUpdate(roomId);
}

function getApproximateCardLocation(
  room: RoomState,
  card: CardState
): [number, number] {
  const CARD_WIDTH = 70;
  const pile = room.board.piles.findIndex((p) =>
    p.some((c) => cardEquals(c, card))
  );
  if (pile >= 0) {
    const [x, y] = room.board.pileLocs[pile];
    return [x + 550, y + 50];
  }
  const playerIdx = card.player;
  const player = room.board.players[playerIdx];
  const px = 10;
  // const py = 50 + playerIdx * PLAYER_HEIGHT;
  const py = 50; // for fairness, put all players in the same row
  const stackIdx = player.stacks.findIndex((s) =>
    s.some((c) => cardEquals(c, card))
  );
  if (stackIdx >= 0) {
    return [
      px + (stackIdx + 1) * CARD_WIDTH,
      py + 10 * (player.stacks[stackIdx].length - 1),
    ];
  }
  if (player.pounceDeck.some((c) => cardEquals(c, card))) {
    return [px, py + 50];
  }
  if (player.deck.some((c) => cardEquals(c, card))) {
    return [px + CARD_WIDTH * 6, py + 50];
  }
  // must be in flipped deck
  return [px + CARD_WIDTH * 5, py + 50];
}

export function broadcastUpdate(roomId: string) {
  const room = rooms[roomId];
  room.io.to(roomId).emit("update", {
    board: room.board,
    time: Date.now(),
  });
  const reactionDelay = 1800 / room.aiSpeed / room.timescale;
  const visibleBoard = JSON.parse(JSON.stringify(room.board));
  setTimeout(() => {
    room.aiBoard = visibleBoard;
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
