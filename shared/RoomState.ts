import {
  BoardState,
  CardState,
  CursorState,
  createBoard,
} from "./GameUtils";
import type { FairHandMode } from "./FairHands";
import type { RoundAnalysis, RoundSnapshot } from "./RoundAnalysis";

export type AIPileKnowledge = {
  minTopCard: CardState;
  expiresAt: number;
};

export type RoomSettings = {
  fairHandMode: FairHandMode;
  /** @deprecated Prefer fairHandMode. Kept for older clients. */
  fairHandRotation: boolean;
  aiSpeed: number;
  simulationMode: boolean;
};

export type RoomState = {
  board: BoardState;
  revision: number;
  aiSpeed: number;
  timescale: number;
  aiCooldowns: number[];
  hands: CursorState[];
  handUpdateVersions: number[];
  /**
   * What the AI currently sees the board as, which gives it reaction delay.
   */
  aiBoard: BoardState;
  /**
   * Per-AI lower bounds for center piles the AI has recently targeted.
   * This blocks stale delayed-board retries without making the pile fully live.
   */
  aiPileKnowledge: (AIPileKnowledge | null)[][];
  queuedHands: CardState[][][];
  stuckPlayerIndices: number[];
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
    handUpdateVersions: [],
    aiBoard: JSON.parse(JSON.stringify(board)),
    aiPileKnowledge: board.players.map(() =>
      Array(board.piles.length).fill(null)
    ),
    queuedHands: [],
    stuckPlayerIndices: [],
    autoStart: false,
    settings: {
      fairHandMode: "off",
      fairHandRotation: false,
      aiSpeed: 3,
      simulationMode: false,
    },
    timescale: 1,
    roundSnapshots: [],
    lastRoundAnalysis: null,
  };
}
