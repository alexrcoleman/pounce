import {
  BoardState,
  CardState,
  CursorLocation,
  CursorState,
} from "./GameUtils";
import { Move } from "./MoveHandler";
import type { ServerDrainStage } from "./ServerDrainNotice";
import type { RoomSettings } from "./RoomState";
import type { RoundAnalysis } from "./RoundAnalysis";
import type { RoomToast } from "./RoomToast";
import type { PlayerReaction, ReactionId } from "./Reactions";

export type ActionEnvelope<T> = {
  actionId: string;
  baseRevision: number;
  payload: T;
};

export type ActionAck =
  | { actionId: string; ok: true; revision: number }
  | { actionId: string; ok: false; revision: number; reason?: string };

export type RoomMoveAction = {
  type: "move";
  actionId: string;
  playerIndex: number;
  move: Move;
  time: number;
  revision: number;
};

export type RoomAction = RoomMoveAction;
export type PendingRoomAction = Omit<RoomAction, "revision">;

export type BoardUpdate = {
  board: BoardState;
  settings: RoomSettings;
  stuckPlayerIndices: number[];
  time: number;
  revision: number;
  roundAnalysis?: RoundAnalysis | null;
};

export type RoomPingAck = {
  serverTime: number;
};

export type ServerNotice = {
  type: "server_draining";
  stage: ServerDrainStage;
  message: string;
  description: string;
  retryAfterMs: number;
  drainingUntil: number;
};

export type StuckUpdate = {
  playerIndex: number;
  playerName: string;
  isStuck: boolean;
  stuckCount: number;
  stuckTotal: number;
  rotated: boolean;
};

export type JoinRoomAck =
  | { ok: true }
  | {
      ok: false;
      code: "server_draining";
      stage: ServerDrainStage;
      message: string;
      description: string;
      retryAfterMs: number;
      drainingUntil: number;
    };

export type ServerToClientEvents = {
  alert: (args: { message: string }) => void;
  room_toast: (args: RoomToast) => void;
  player_reaction: (args: PlayerReaction) => void;
  server_notice: (args: ServerNotice) => void;
  stuck_update: (args: StuckUpdate) => void;
  room_action: (args: RoomAction) => void;
  update_hands: (args: { hands: CursorState[] }) => void;
  update: (args: BoardUpdate) => void;
};
export type ClientToServerEvents = {
  join_room: (
    args: {
      roomId: string | null;
      name: string;
      playerSessionId: string;
    },
    ack?: (args: JoinRoomAck) => void
  ) => void;
  set_ai_level: (args: { speed: number }) => void;
  restart_game: () => void;
  update_hand: (args: {
    item?: CardState | null;
    items?: CardState[] | null;
    location?: CursorLocation | null;
  }) => void;
  move: (args: ActionEnvelope<Move>, ack?: (args: ActionAck) => void) => void;
  rotate_decks: () => void;
  set_stuck: (args: { stuck: boolean }) => void;
  deal_hands: () => void;
  deal_remaining_players: () => void;
  start_game: () => void;
  set_round_ready: (args: { ready: boolean }) => void;
  set_paused: (args: { paused: boolean }) => void;
  add_ai: () => void;
  remove_ai: () => void;
  set_ai_count: (args: { count: number }) => void;
  set_fair_hand_rotation: (args: { enabled: boolean }) => void;
  send_reaction: (args: { reactionId: ReactionId }) => void;
  remove_disconnected_players: () => void;
  room_ping: (
    args: { clientTime: number },
    ack?: (args: RoomPingAck) => void
  ) => void;
};
