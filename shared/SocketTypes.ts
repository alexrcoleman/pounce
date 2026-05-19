import { BoardState, CardState, CursorState } from "./GameUtils";
import { Move } from "./MoveHandler";

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
  time: number;
  revision: number;
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
  start_game: () => void;
  add_ai: () => void;
  remove_ai: () => void;
  remove_disconnected_players: () => void;
};
