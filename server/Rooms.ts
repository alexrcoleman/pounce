import {
  BoardState,
  CardState,
  CursorState,
  createBoard,
  isGameOver,
  rotateDecks,
  scoreBoard,
  startGame,
} from "../shared/GameUtils";

import { Server } from "socket.io";
import { executeMove, getDistance } from "../shared/MoveHandler";
import { getBasicAIMove } from "../shared/ComputerV1";
import deepClone from "../shared/deepClone";
import { peek } from "../shared/CardUtils";
import { getApproximateCardLocation } from "../shared/CardLocations";

export type RoomState = {
  io: Server;
  board: BoardState;
  interval: NodeJS.Timer;
  aiSpeed: number;
  timescale: number;
  aiCooldowns: number[];
  hands: CursorState[]; // todo: put this in the board?
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
        const hand = (room.hands[index] = room.hands[index] ?? {});
        const visibleBoard = getVisibleBoard(room, index);
        const move = getBasicAIMove(visibleBoard, index, hand);

        const moveResult = move ? executeMove(board, index, move, hand) : null;

        let cooldownDist = {
          mean: 3500 / room.aiSpeed,
          deviation: 750 / room.aiSpeed,
        };
        if (moveResult?.cursorMove) {
          const hand = room.hands[index];
          const currentPos = hand.location
            ? getApproximateCardLocation(board, hand.location)
            : null;
          hand.location = moveResult.cursorMove;
          hand.item = moveResult.cursorMoveItem ?? hand.item;
          hasHandUpdate = true;

          let cost = 1500;
          if (currentPos) {
            const targetPos = getApproximateCardLocation(
              board,
              moveResult.cursorMove
            );
            const distance = getDistance(targetPos, currentPos);
            cost = 750 + distance * 3;
          }
          cooldownDist = {
            mean: cost / room.aiSpeed,
            deviation: cost / 5 / room.aiSpeed,
          };
        } else if (moveResult?.clearCursor) {
          hasHandUpdate = true;
          room.hands[index].item = undefined;
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

function getVisibleBoard(room: RoomState, playerIndex: number) {
  const visibleBoard = deepClone(room.aiBoard);
  const realBoard = room.board;
  // Allow seeing their own hand instantly
  const player = realBoard.players[playerIndex];
  visibleBoard.players[playerIndex] = player;

  const pounceCard = peek(player.pounceDeck);
  // Allow seeing any piles they played on instantly
  const nonEmptyPileCount = realBoard.piles.filter((p) => p.length > 1).length;
  realBoard.piles.forEach((p, i) => {
    const topCard = peek(p);
    const canPounceCardPlay =
      pounceCard &&
      topCard &&
      pounceCard.suit === topCard.suit &&
      topCard.value < pounceCard.value &&
      topCard.value >= pounceCard.value - 3;
    if (
      peek(p)?.player === playerIndex ||
      p.length <= 1 ||
      nonEmptyPileCount < 4 ||
      canPounceCardPlay
    ) {
      visibleBoard.piles[i] = p;
    }
  });

  // TODO: Pick a few piles they might be interested in to show immediately (TBD how to decide this, perhaps
  // just their pounce pile and any Aces)

  // Additionally (perhaps related to the above), show any piles they attempted to play on recently

  return visibleBoard;
}

export function broadcastUpdate(roomId: string) {
  const room = rooms[roomId];
  room.io.to(roomId).emit("update", {
    board: room.board,
    time: Date.now(),
  });
  const reactionDelay = (2500 / room.aiSpeed + 100) / room.timescale;
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
