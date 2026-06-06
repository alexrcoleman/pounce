import {
  BoardState,
  CardState,
  CursorState,
  createBoard,
} from "./GameUtils";
import {
  DEFAULT_AI_LEVEL,
  getAISpeedMultiplier,
} from "./AIDifficulty";
import type { FairHandMode } from "./FairHands";
import type { RoundAnalysis, RoundSnapshot } from "./RoundAnalysis";

export type AIPileKnowledge = {
  minTopCard: CardState;
  expiresAt: number;
};

export type AIMode = "fixed" | "trained" | "hybrid";
export type ResolvedAIPlayerMode = "fixed" | "trained";

export type RoomSettings = {
  fairHandMode: FairHandMode;
  /** @deprecated Prefer fairHandMode. Kept for older clients. */
  fairHandRotation: boolean;
  aiMode: AIMode;
  /** User-visible AI level. Fixed presets are 3, 5, and 7. */
  aiSpeed: number;
  simulationMode: boolean;
};

export type RoomState = {
  board: BoardState;
  revision: number;
  /** Effective delay divisor derived from settings.aiSpeed. */
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
    aiSpeed: getAISpeedMultiplier(DEFAULT_AI_LEVEL),
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
      aiMode: "fixed",
      aiSpeed: DEFAULT_AI_LEVEL,
      simulationMode: false,
    },
    timescale: 1,
    roundSnapshots: [],
    lastRoundAnalysis: null,
  };
}

export function normalizeAIMode(mode: unknown): AIMode {
  return mode === "trained" || mode === "hybrid" || mode === "fixed"
    ? mode
    : "fixed";
}

export function getAIPlayerResolvedMode(
  boardState: BoardState,
  playerIndex: number,
  mode: AIMode | undefined
): ResolvedAIPlayerMode {
  const normalizedMode = mode ?? "fixed";
  if (normalizedMode === "trained") {
    return "trained";
  }
  if (normalizedMode === "hybrid" && isFirstAIPlayer(boardState, playerIndex)) {
    return "trained";
  }
  return "fixed";
}

function isFirstAIPlayer(boardState: BoardState, playerIndex: number): boolean {
  const player = boardState.players[playerIndex];
  return (
    player != null &&
    player.socketId == null &&
    boardState.players
      .filter((candidate) => candidate.socketId == null)
      .indexOf(player) === 0
  );
}
