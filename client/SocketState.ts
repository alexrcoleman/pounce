import { BoardState, CursorState } from "../shared/GameUtils";
import { makeAutoObservable } from "mobx";
import deepClone from "../shared/deepClone";
import { executeMove, type Move } from "../shared/MoveHandler";
import type { RoomSettings } from "../shared/RoomState";
import {
  type ActionAck,
  type ActionEnvelope,
  type BoardUpdate,
} from "../shared/SocketTypes";
import type { RoundAnalysis } from "../shared/RoundAnalysis";
import type { PlayerReaction } from "../shared/Reactions";

type PendingMoveAction = {
  actionId: string;
  baseRevision: number;
  move: Move;
  acceptedRevision?: number;
};

function createDefaultRoomSettings(): RoomSettings {
  return {
    fairHandRotation: false,
    aiSpeed: 3,
    simulationMode: false,
  };
}

export default class SocketState {
  board: BoardState | null = null;
  serverBoard: BoardState | null = null;
  roomSettings: RoomSettings = createDefaultRoomSettings();
  serverRevision = 0;
  lastTime = 0;
  latency = 0;
  pingLatency: number | null = null;
  isConnected = false;
  socketId = "";
  playerSessionId: string | null = null;
  hands: CursorState[] = [];
  pendingMoves: PendingMoveAction[] = [];
  reactions: PlayerReaction[] = [];
  roundAnalysis: RoundAnalysis | null = null;
  private isAwaitingRoomSync = false;
  private nextActionNumber = 0;
  constructor() {
    makeAutoObservable(this);
  }
  onUpdate(data: BoardUpdate) {
    if (data.revision < this.serverRevision) {
      if (!this.isAwaitingRoomSync) {
        return;
      }

      this.resetBoardState();
    }
    this.isAwaitingRoomSync = false;
    this.serverBoard = applyDeepUpdate(this.serverBoard, data.board);
    this.roomSettings = applyDeepUpdate(this.roomSettings, data.settings);
    this.serverRevision = data.revision;
    this.pendingMoves = this.pendingMoves.filter(
      (action) =>
        action.acceptedRevision == null ||
        action.acceptedRevision > data.revision
    );
    this.latency = Date.now() - data.time;
    this.lastTime = data.time;
    this.roundAnalysis = applyDeepUpdate(
      this.roundAnalysis,
      data.roundAnalysis ?? null
    );
    this.recomputeBoard();
  }
  onConnect(socketId: string) {
    this.isConnected = true;
    this.socketId = socketId;
    this.pingLatency = null;
    this.recomputeBoard();
  }
  setPlayerSessionId(playerSessionId: string | null) {
    this.playerSessionId = playerSessionId;
  }
  beginRoomSync() {
    this.isAwaitingRoomSync = true;
  }
  setPingLatency(latency: number | null) {
    this.pingLatency =
      typeof latency === "number" ? Math.max(0, Math.round(latency)) : null;
  }
  updateHands(hands: CursorState[]) {
    this.hands = applyDeepUpdate(this.hands, hands);
  }
  addReaction(reaction: PlayerReaction) {
    this.reactions = this.reactions
      .filter((existing) => existing.eventId !== reaction.eventId)
      .concat(reaction)
      .slice(-12);
  }
  removeReaction(eventId: string) {
    this.reactions = this.reactions.filter(
      (reaction) => reaction.eventId !== eventId
    );
  }
  onDisconnect() {
    this.isConnected = false;
    this.pingLatency = null;
    this.hands = [];
    this.reactions = [];
    this.recomputeBoard();
  }
  getActivePlayerIndex() {
    return this.getActivePlayerIndexForBoard(this.board);
  }
  getHostPlayerIndex() {
    if (!this.board) {
      return -1;
    }
    return this.board.players.findIndex(
      (p) => !p.disconnected && p.socketId != null
    );
  }
  getIsHost() {
    const playerIndex = this.getActivePlayerIndex();
    const hostIndex = this.getHostPlayerIndex();
    return hostIndex === playerIndex;
  }
  clearBoard() {
    this.resetBoardState();
  }
  createOptimisticMove(move: Move): ActionEnvelope<Move> {
    const action = {
      actionId: `${this.socketId || "local"}:${++this.nextActionNumber}`,
      baseRevision: this.serverRevision,
      move,
    };
    this.pendingMoves.push(action);
    this.recomputeBoard();
    return {
      actionId: action.actionId,
      baseRevision: action.baseRevision,
      payload: move,
    };
  }
  onMoveAck(ack: ActionAck) {
    const action = this.pendingMoves.find((a) => a.actionId === ack.actionId);
    if (!action) {
      return;
    }
    if (ack.ok) {
      action.acceptedRevision = ack.revision;
      if (ack.revision <= this.serverRevision) {
        this.pendingMoves = this.pendingMoves.filter(
          (a) => a.actionId !== ack.actionId
        );
      }
    } else {
      this.pendingMoves = this.pendingMoves.filter(
        (a) => a.actionId !== ack.actionId
      );
    }
    this.recomputeBoard();
  }
  discardPendingMoveActions(actionIds: readonly string[]) {
    if (actionIds.length === 0) {
      return;
    }

    const discardedIds = new Set(actionIds);
    this.pendingMoves = this.pendingMoves.filter(
      (action) => !discardedIds.has(action.actionId)
    );
    this.recomputeBoard();
  }
  private resetBoardState() {
    this.board = null;
    this.serverBoard = null;
    this.roomSettings = createDefaultRoomSettings();
    this.serverRevision = 0;
    this.pendingMoves = [];
    this.reactions = [];
    this.hands = [];
    this.roundAnalysis = null;
    this.isAwaitingRoomSync = false;
  }
  private recomputeBoard() {
    if (!this.serverBoard) {
      this.board = null;
      return;
    }
    if (this.pendingMoves.length === 0) {
      this.board = this.serverBoard;
      return;
    }
    const nextBoard = deepClone(this.serverBoard);
    const playerIndex = this.getActivePlayerIndexForBoard(nextBoard);
    if (playerIndex >= 0) {
      this.pendingMoves.forEach((action) => {
        executeMove(nextBoard, playerIndex, action.move);
      });
    }
    const currentBoard = this.board === this.serverBoard ? null : this.board;
    this.board = applyDeepUpdate(currentBoard, nextBoard);
  }
  private getActivePlayerIndexForBoard(board: BoardState | null) {
    if (!board) {
      return -1;
    }
    const socketPlayerIndex = board.players.findIndex(
      (p) => p.socketId === this.socketId
    );
    if (socketPlayerIndex >= 0) {
      return socketPlayerIndex;
    }
    if (this.playerSessionId == null) {
      return -1;
    }
    return board.players.findIndex(
      (p) => p.playerSessionId === this.playerSessionId
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
