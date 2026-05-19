import {
  BoardState,
  CardState,
  CursorState,
  createBoard,
} from "./GameUtils";

export type RoomState = {
  board: BoardState;
  revision: number;
  aiSpeed: number;
  timescale: number;
  aiCooldowns: number[];
  hands: CursorState[];
  /**
   * What the AI currently sees the board as, which gives it reaction delay.
   */
  aiBoard: BoardState;
  queuedHands: CardState[][][];
  autoStart: boolean;
};

export function createRoomState(playerCount: number): RoomState {
  const board = createBoard(playerCount);
  return {
    board,
    revision: 0,
    aiSpeed: 3,
    aiCooldowns: [],
    hands: [],
    aiBoard: JSON.parse(JSON.stringify(board)),
    queuedHands: [],
    autoStart: false,
    timescale: 1,
  };
}
