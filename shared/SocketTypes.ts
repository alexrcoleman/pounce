import { BoardState, CardState, CursorState } from "./GameUtils";
import { Move } from "./MoveHandler";
import type { RoomSettings } from "./RoomState";
import type { RoundAnalysis } from "./RoundAnalysis";

export type ActionEnvelope<T> = {
  actionId: string;
  baseRevision: number;
  payload: T;
};

export type ActionAck =
  | { actionId: string; ok: true; revision: number }
  | { actionId: string; ok: false; revision: number; reason?: string };

export type BoardUpdate = {
  board: BoardState;
  settings: RoomSettings;
  time: number;
  revision: number;
  roundAnalysis?: RoundAnalysis | null;
};

export type ServerToClientEvents = {
  alert: (args: { message: string }) => void;
  update_hands: (args: { hands: CursorState[] }) => void;
  update: (args: BoardUpdate) => void;
};
export type ClientToServerEvents = {
  join_room: (args: {
    roomId: string | null;
    name: string;
    playerSessionId: string;
  }) => void;
  set_ai_level: (args: { speed: number }) => void;
  restart_game: () => void;
  update_hand: (args: {
    item?: CardState | null;
    location?: CardState;
  }) => void;
  move: (args: ActionEnvelope<Move>, ack?: (args: ActionAck) => void) => void;
  rotate_decks: () => void;
  deal_hands: () => void;
  start_game: () => void;
  set_paused: (args: { paused: boolean }) => void;
  add_ai: () => void;
  remove_ai: () => void;
  set_ai_count: (args: { count: number }) => void;
  set_fair_hand_rotation: (args: { enabled: boolean }) => void;
  remove_disconnected_players: () => void;
};
