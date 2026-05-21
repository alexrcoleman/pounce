import {
  BoardState,
  CardState,
  CursorState,
  createBoard,
} from "./GameUtils";
import type { RoundAnalysis, RoundSnapshot } from "./RoundAnalysis";

export type RoomSettings = {
  fairHandRotation: boolean;
};

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
  settings: RoomSettings;
  roundSnapshots: RoundSnapshot[];
  lastRoundAnalysis: RoundAnalysis | null;
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
    settings: {
      fairHandRotation: false,
    },
    timescale: 1,
    roundSnapshots: [],
    lastRoundAnalysis: null,
  };
}
