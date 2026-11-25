import type { CardState, CursorLocation, CursorState } from "../shared/GameUtils";
import type { Move } from "../shared/MoveHandler";
import { isAllowedReactionId, type PlayerReaction, type ReactionId } from "../shared/Reactions";
import type { RoomToast } from "../shared/RoomToast";
import type {
  ActionAck, ActionEnvelope, BoardUpdate, HandUpdateDelta, RoomAction,
} from "../shared/SocketTypes";

export type LanGuestMessage =
  | { kind: "join"; name: string }
  | { kind: "move"; action: ActionEnvelope<Move> }
  | { kind: "hand"; hand: { item?: CardState | null; items?: CardState[] | null; location?: CursorLocation | null } }
  | { kind: "ready"; ready: boolean }
  | { kind: "stuck"; stuck: boolean }
  | { kind: "reaction"; reaction: ReactionId }
  | { kind: "sync" }
  | { kind: "ping" | "pong"; time: number };

export type LanHostMessage =
  | { kind: "board"; update: BoardUpdate }
  | { kind: "action"; action: RoomAction }
  | { kind: "hands"; hands: CursorState[]; versions: number[] }
  | { kind: "hand"; delta: HandUpdateDelta }
  | { kind: "ack"; ack: ActionAck }
  | { kind: "toast"; toast: RoomToast }
  | { kind: "reaction"; reaction: PlayerReaction }
  | { kind: "ping" | "pong"; time: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}

function isSource(value: unknown) {
  return isRecord(value) && (value.type === "pounce" || value.type === "deck" ||
    (value.type === "solitaire" && isIndex(value.index)));
}

function isMove(value: unknown): value is Move {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "cycle":
    case "flip_deck":
    case "wait":
      return true;
    case "s2s":
      return isIndex(value.source) && isIndex(value.dest) &&
        isIndex(value.count) && value.count > 0 && value.count <= 52;
    case "c2s":
      return (value.source === "pounce" || value.source === "deck") && isIndex(value.dest);
    case "c2c":
      return isSource(value.source) && isIndex(value.dest) &&
        (value.position === undefined || isPoint(value.position));
    case "premove":
      return isSource(value.source);
    case "move_field_stack":
      return isIndex(value.index) && isPoint(value.position);
    default:
      return false;
  }
}

function isCard(value: unknown): value is CardState {
  return isRecord(value) && isIndex(value.player) &&
    isIndex(value.value) && value.value > 0 && value.value <= 13 &&
    (value.suit === "hearts" || value.suit === "diamonds" ||
      value.suit === "clubs" || value.suit === "spades");
}

function isCursorLocation(value: unknown): value is CursorLocation {
  return isCard(value) || (isRecord(value) && (
    (value.type === "solitaire_slot" && isIndex(value.player) && isIndex(value.pileIndex)) ||
    (value.type === "field_slot" && isPoint(value.position))
  ));
}

export function parseLanGuestMessage(raw: string): LanGuestMessage | null {
  const message = parseJson(raw);
  switch (message?.kind) {
    case "join": {
      const name = typeof message.name === "string" ? message.name.trim().slice(0, 12) : "";
      return name ? { kind: "join", name } : null;
    }
    case "move": {
      const action = message.action;
      if (!isRecord(action) || typeof action.actionId !== "string" ||
        !/^lan-guest:[1-9][0-9]{0,11}$/.test(action.actionId) ||
        !isIndex(action.baseRevision) || !isMove(action.payload)) return null;
      return { kind: "move", action: {
        actionId: action.actionId, baseRevision: action.baseRevision, payload: action.payload,
      } };
    }
    case "hand": {
      const hand = message.hand;
      if (!isRecord(hand)) return null;
      const { item, items, location } = hand;
      if ((item != null && !isCard(item)) ||
        (items != null && (!Array.isArray(items) || items.length > 52 || !items.every(isCard))) ||
        (location != null && !isCursorLocation(location))) return null;
      return { kind: "hand", hand: {
        ...(item !== undefined ? { item: item as CardState | null } : {}),
        ...(items !== undefined ? { items: items as CardState[] | null } : {}),
        ...(location !== undefined ? { location: location as CursorLocation | null } : {}),
      } };
    }
    case "ready":
      return typeof message.ready === "boolean" ? { kind: "ready", ready: message.ready } : null;
    case "stuck":
      return typeof message.stuck === "boolean" ? { kind: "stuck", stuck: message.stuck } : null;
    case "reaction":
      return isAllowedReactionId(message.reaction) ? { kind: "reaction", reaction: message.reaction } : null;
    case "sync":
      return { kind: "sync" };
    case "ping":
    case "pong":
      return isIndex(message.time) ? { kind: message.kind, time: message.time } : null;
    default:
      return null;
  }
}

export function parseLanHostMessage(raw: string): LanHostMessage | null {
  const message = parseJson(raw);
  if (!message) return null;
  switch (message.kind) {
    case "board":
      if (isRecord(message.update) && isRecord(message.update.board) &&
        Array.isArray(message.update.board.players) && Array.isArray(message.update.board.piles) &&
        isRecord(message.update.settings) && isIndex(message.update.revision)) {
        return message as unknown as LanHostMessage;
      }
      break;
    case "action":
      if (isRecord(message.action) && isMove(message.action.move) &&
        isIndex(message.action.playerIndex) && isIndex(message.action.revision)) {
        return message as unknown as LanHostMessage;
      }
      break;
    case "ack":
      if (isRecord(message.ack) && typeof message.ack.actionId === "string" &&
        typeof message.ack.ok === "boolean" && isIndex(message.ack.revision)) {
        return message as unknown as LanHostMessage;
      }
      break;
    case "hands":
      if (Array.isArray(message.hands) && Array.isArray(message.versions)) {
        return message as unknown as LanHostMessage;
      }
      break;
    case "hand":
      if (isRecord(message.delta) && isRecord(message.delta.hand) &&
        isIndex(message.delta.playerIndex) && message.delta.playerIndex < 32 &&
        isIndex(message.delta.version)) return message as unknown as LanHostMessage;
      break;
    case "toast":
      if (isRecord(message.toast)) return message as unknown as LanHostMessage;
      break;
    case "reaction":
      if (isRecord(message.reaction) && isAllowedReactionId(message.reaction.reactionId)) {
        return message as unknown as LanHostMessage;
      }
      break;
    case "ping":
    case "pong":
      if (isIndex(message.time)) return { kind: message.kind, time: message.time };
      break;
  }
  return null;
}
