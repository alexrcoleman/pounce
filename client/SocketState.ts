import { BoardState, CursorState } from "../shared/GameUtils";
import { makeAutoObservable } from "mobx";

export default class SocketState {
  board: BoardState | null = null;
  lastTime = 0;
  latency = 0;
  socketId = "";
  hands: CursorState[] = [];
  constructor() {
    makeAutoObservable(this);
  }
  onUpdate(data: { board: BoardState; time: number }) {
    // todo: merge board changes in more nicely
    this.board = applyDeepUpdate(this.board, data.board);
    this.latency = Date.now() - data.time;
    this.lastTime = data.time;
  }
  updateHands(hands: CursorState[]) {
    this.hands = applyDeepUpdate(this.hands, hands);
  }
  onDisconnect() {
    this.socketId = "";
    this.board = null;
  }
  getActivePlayerIndex() {
    if (!this.board) {
      return -1;
    }
    return this.board.players.findIndex((p) => p.socketId === this.socketId);
  }
  getHostPlayerIndex() {
    if (!this.board) {
      return -1;
    }
    return this.board.players.findIndex(
      (p) => !p.disconnected && p.socketId != null
    );
  }
}

// Must handle objects, arrays, and primitives (boolean, number, string, null, undefined)
function applyDeepUpdate<T>(target: T, value: unknown): T {
  if (value === target) {
    return target;
  }
  if (
    typeof target !== typeof value ||
    Array.isArray(target) !== Array.isArray(value) ||
    (target == null) !== (value == null)
  ) {
    return value as T;
  }

  if (Array.isArray(target) && Array.isArray(value)) {
    if (target.length === value.length) {
      for (let i = 0; i < target.length; i++) {
        target[i] = applyDeepUpdate(target[i], value[i]);
        // todo: Does this assignment cause issues with mobx?
      }
      return target;
    }
    // todo: if one array is just a prefix of another, we should just push maybe

    // If the arrays are different lengths, we will create a new array but preserve elements
    const newValues = value.map((v, i): any => {
      // Look if theres a "match" to update
      const elTarget = target[i];
      return applyDeepUpdate(elTarget, v);
    });
    target.splice(0, target.length, ...newValues);
    return target;
  }

  if (value == null) {
    // Changed null <-> undefined
    return value as T;
  }

  if (typeof value === "object") {
    // Object changing value
    const targetObj = target as Record<string, unknown>;
    const valueObj = value as Record<string, unknown>;
    for (const key in valueObj) {
      targetObj[key] = applyDeepUpdate(targetObj[key], valueObj[key]);
      // todo: Does this assignment cause issues with mobx?
    }
    // Remove any old ones
    for (const key in targetObj) {
      if (!(key in valueObj)) {
        delete targetObj[key];
      }
    }
    return target;
  } else {
    // Primitive changing value
    return value as T;
  }
}
