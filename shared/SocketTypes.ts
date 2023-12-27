import { BoardState, CardState, CursorState } from "./GameUtils";
import { Move } from "./MoveHandler";

export type ServerToClientEvents = {
  alert: (args: { message: string }) => void;
  update_hands: (args: { hands: CursorState[] }) => void;
  update: (args: { board: BoardState; time: number }) => void;
};
export type ClientToServerEvents = {
  join_room: (args: { roomId: string; name: string }) => void;
  set_ai_level: (args: { speed: number }) => void;
  restart_game: () => void;
  update_hand: (args: {
    item?: CardState | null;
    location?: CardState;
  }) => void;
  move: (args: Move) => void;
  rotate_decks: () => void;
  start_game: () => void;
  add_ai: () => void;
  remove_ai: () => void;
};
