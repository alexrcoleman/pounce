import { BoardState, CursorState, isGameOver } from "../shared/GameUtils";
import { DEFAULT_AI_LEVEL } from "../shared/AIDifficulty";
import { makeAutoObservable } from "mobx";
import deepClone from "../shared/deepClone";
import {
  executeMove,
  isProductiveMove,
  resolveMoveForBoard,
  type Move,
} from "../shared/MoveHandler";
import type { RoomSettings } from "../shared/RoomState";
import {
  type ActionAck,
  type ActionEnvelope,
  type BoardUpdate,
  type HandUpdateDelta,
  type RoomAction,
} from "../shared/SocketTypes";
import type { RoundAnalysis } from "../shared/RoundAnalysis";
import type { PlayerReaction } from "../shared/Reactions";

type PendingMoveAction = {
  actionId: string;
  baseRevision: number;
  createdAt: number;
  move: Move;
  isAppliedToClientBoard: boolean;
  canReplayOnServerBoard: boolean;
  acceptedRevision?: number;
};

export type RoomActionApplyResult = "applied" | "stale" | "needs_sync";

const SERVER_TIME_SAFETY_BUFFER_MS = 100;

function createDefaultRoomSettings(): RoomSettings {
  return {
    fairHandMode: "off",
    fairHandRotation: false,
    aiMode: "fixed",
    aiSpeed: DEFAULT_AI_LEVEL,
    simulationMode: false,
  };
}

export default class SocketState {
  serverBoard: BoardState | null = null;
  roomSettings: RoomSettings = createDefaultRoomSettings();
  serverRevision = 0;
  lastTime = 0;
  latency = 0;
  stuckPlayerIndices: number[] = [];
  pingLatency: number | null = null;
  isPingUnstable = false;
  serverClockOffset = 0;
  isConnected = false;
  socketId = "";
  playerSessionId: string | null = null;
  hands: CursorState[] = [];
  handUpdateVersions: number[] = [];
  pendingMoves: PendingMoveAction[] = [];
  reactions: PlayerReaction[] = [];
  roundAnalysis: RoundAnalysis | null = null;
  // Client-owned board view. It is always synced in place from the server
  // snapshot plus any pending optimistic moves, so observers keep one stable
  // board object across optimistic/non-optimistic transitions.
  private clientsideMutableBoard: BoardState | null = null;
  private isAwaitingRoomSync = false;
  private nextActionNumber = 0;
  constructor() {
    makeAutoObservable(this);
  }
  get board(): BoardState | null {
    return this.clientsideMutableBoard;
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
    this.stuckPlayerIndices = applyDeepUpdate(
      this.stuckPlayerIndices,
      data.stuckPlayerIndices
    );
    this.serverRevision = data.revision;
    this.pendingMoves.forEach((action) => {
      if (
        action.acceptedRevision == null &&
        action.baseRevision < data.revision
      ) {
        action.canReplayOnServerBoard = false;
        action.isAppliedToClientBoard = false;
      }
    });
    this.pendingMoves = this.pendingMoves.filter(
      (action) =>
        action.acceptedRevision == null ||
        action.acceptedRevision > data.revision
    );
    this.latency = Date.now() - data.time;
    this.serverClockOffset =
      data.time - Date.now() - SERVER_TIME_SAFETY_BUFFER_MS;
    this.lastTime = data.time;
    this.roundAnalysis = applyDeepUpdate(
      this.roundAnalysis,
      data.roundAnalysis ?? null
    );
    this.rebaseClientBoardFromServer();
  }
  onRoomAction(action: RoomAction): RoomActionApplyResult {
    if (action.revision <= this.serverRevision) {
      const discardedAction = this.discardPendingRoomAction(action);
      if (discardedAction?.isAppliedToClientBoard) {
        this.rebaseClientBoardFromServer();
      }
      return "stale";
    }

    if (
      this.isAwaitingRoomSync ||
      !this.serverBoard ||
      action.revision !== this.serverRevision + 1
    ) {
      return this.requireRoomSync();
    }

    if (action.type === "move") {
      return this.applyMoveAction(action);
    }

    return this.requireRoomSync();
  }
  onConnect(socketId: string) {
    this.isConnected = true;
    this.socketId = socketId;
    this.pingLatency = null;
    this.isPingUnstable = false;
    this.rebaseClientBoardFromServer();
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
  setPingUnstable(isUnstable: boolean) {
    this.isPingUnstable = isUnstable;
  }
  getEstimatedServerTime(now = Date.now()) {
    return now + this.serverClockOffset;
  }
  get isGameOver() {
    // makeAutoObservable treats getters as computed, so observers only update
    // when this broad pounce-deck scan changes the boolean result.
    return this.board != null && isGameOver(this.board);
  }
  updateHands(hands: CursorState[], versions: number[] = []) {
    this.hands = applyDeepUpdate(this.hands, hands);
    this.handUpdateVersions = applyDeepUpdate(
      this.handUpdateVersions,
      versions
    );
  }
  updateHandDelta(delta: HandUpdateDelta) {
    const currentVersion = this.handUpdateVersions[delta.playerIndex];
    if (currentVersion != null && delta.version < currentVersion) {
      return;
    }

    while (this.hands.length <= delta.playerIndex) {
      this.hands.push({});
    }
    this.hands[delta.playerIndex] = applyDeepUpdate(
      this.hands[delta.playerIndex] ?? {},
      delta.hand
    );
    this.handUpdateVersions[delta.playerIndex] = delta.version;
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
    this.isPingUnstable = false;
    this.hands = [];
    this.handUpdateVersions = [];
    this.reactions = [];
    this.rebaseClientBoardFromServer();
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
      createdAt: Date.now(),
      move,
      isAppliedToClientBoard: false,
      canReplayOnServerBoard: true,
    };
    this.pendingMoves.push(action);
    const pendingAction = this.pendingMoves[this.pendingMoves.length - 1];
    if (!this.tryApplyPendingMoveToClientBoard(pendingAction)) {
      this.rebaseClientBoardFromServer();
    }
    return {
      actionId: pendingAction.actionId,
      baseRevision: pendingAction.baseRevision,
      payload: pendingAction.move,
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
        const discardedAction = this.discardPendingMoveAction(ack.actionId);
        if (discardedAction?.isAppliedToClientBoard) {
          this.rebaseClientBoardFromServer();
        }
      }
      return;
    } else {
      const discardedAction = this.discardPendingMoveAction(ack.actionId);
      if (discardedAction?.isAppliedToClientBoard) {
        this.rebaseClientBoardFromServer();
      }
    }
  }
  discardPendingMoveActions(actionIds: readonly string[]) {
    if (actionIds.length === 0) {
      return;
    }

    const discardedIds = new Set(actionIds);
    const discardedActions: PendingMoveAction[] = [];
    this.pendingMoves = this.pendingMoves.filter((action) => {
      if (!discardedIds.has(action.actionId)) {
        return true;
      }

      discardedActions.push(action);
      return false;
    });
    if (discardedActions.some((action) => action.isAppliedToClientBoard)) {
      this.rebaseClientBoardFromServer();
    }
  }
  private resetBoardState() {
    this.serverBoard = null;
    this.clientsideMutableBoard = null;
    this.roomSettings = createDefaultRoomSettings();
    this.stuckPlayerIndices = [];
    this.serverRevision = 0;
    this.serverClockOffset = 0;
    this.isPingUnstable = false;
    this.pendingMoves = [];
    this.reactions = [];
    this.hands = [];
    this.handUpdateVersions = [];
    this.roundAnalysis = null;
    this.isAwaitingRoomSync = false;
  }
  private applyMoveAction(action: RoomAction): RoomActionApplyResult {
    if (!this.serverBoard) {
      return this.requireRoomSync();
    }

    const matchingPendingAction = this.pendingMoves.find(
      (pendingAction) => pendingAction.actionId === action.actionId
    );
    const result = this.applyRoomActionToBoard(this.serverBoard, action);
    if (result == null) {
      return this.requireRoomSync();
    }

    if (result.boardChanged && isProductiveMove(action.move)) {
      this.stuckPlayerIndices = applyDeepUpdate(this.stuckPlayerIndices, []);
    }
    this.serverRevision = action.revision;
    this.latency = Date.now() - action.time;
    this.serverClockOffset =
      action.time - Date.now() - SERVER_TIME_SAFETY_BUFFER_MS;
    this.lastTime = action.time;
    const discardedPendingAction = this.discardPendingRoomAction(action);

    if (matchingPendingAction) {
      this.applyRoomActionMetadataToBoard(this.clientsideMutableBoard, action);
      if (
        !discardedPendingAction?.isAppliedToClientBoard &&
        !this.tryApplyRoomActionToClientBoard(action)
      ) {
        this.rebaseClientBoardFromServer();
      }
      return "applied";
    }

    if (!this.tryApplyRoomActionToClientBoard(action)) {
      this.rebaseClientBoardFromServer();
      return "applied";
    }

    return "applied";
  }
  private requireRoomSync(): RoomActionApplyResult {
    this.isAwaitingRoomSync = true;
    return "needs_sync";
  }
  private discardPendingRoomAction(action: RoomAction): PendingMoveAction | null {
    let discardedAction: PendingMoveAction | null = null;
    this.pendingMoves = this.pendingMoves.filter((pendingAction) => {
      const shouldDiscard =
        pendingAction.actionId === action.actionId ||
        (pendingAction.acceptedRevision != null &&
          pendingAction.acceptedRevision <= action.revision);
      if (shouldDiscard && pendingAction.actionId === action.actionId) {
        discardedAction = pendingAction;
      }
      return !shouldDiscard;
    });
    return discardedAction;
  }
  private discardPendingMoveAction(actionId: string): PendingMoveAction | null {
    let discardedAction: PendingMoveAction | null = null;
    this.pendingMoves = this.pendingMoves.filter((pendingAction) => {
      if (pendingAction.actionId !== actionId) {
        return true;
      }

      discardedAction = pendingAction;
      return false;
    });
    return discardedAction;
  }
  private rebaseClientBoardFromServer() {
    if (!this.serverBoard) {
      this.clientsideMutableBoard = null;
      return;
    }

    const nextBoard =
      this.pendingMoves.length === 0
        ? this.serverBoard
        : this.createOptimisticBoard(this.serverBoard);
    this.clientsideMutableBoard = applyDeepUpdate(
      this.clientsideMutableBoard,
      nextBoard,
      nextBoard === this.serverBoard
    );
  }
  private createOptimisticBoard(serverBoard: BoardState) {
    const nextBoard = deepClone(serverBoard);
    const playerIndex = this.getActivePlayerIndexForBoard(nextBoard);
    this.pendingMoves.forEach((action) => {
      action.isAppliedToClientBoard = false;
    });
    if (playerIndex < 0) {
      return nextBoard;
    }

    this.pendingMoves.forEach((action) => {
      if (!action.canReplayOnServerBoard) {
        return;
      }

      const result = executeMove(
        nextBoard,
        playerIndex,
        action.move,
        undefined,
        this.getEstimatedServerTime()
      );
      action.isAppliedToClientBoard = result != null;
    });
    return nextBoard;
  }
  private tryApplyPendingMoveToClientBoard(action: PendingMoveAction): boolean {
    if (!this.clientsideMutableBoard) {
      return false;
    }

    const playerIndex = this.getActivePlayerIndexForBoard(
      this.clientsideMutableBoard
    );
    if (playerIndex < 0) {
      return false;
    }

    const result = executeMove(
      this.clientsideMutableBoard,
      playerIndex,
      action.move,
      undefined,
      this.getEstimatedServerTime()
    );
    action.isAppliedToClientBoard = result != null;
    return result != null;
  }
  private tryApplyRoomActionToClientBoard(action: RoomAction): boolean {
    if (!this.clientsideMutableBoard) {
      return false;
    }

    return (
      this.applyRoomActionToBoard(this.clientsideMutableBoard, action) != null
    );
  }
  private applyRoomActionToBoard(
    board: BoardState,
    action: RoomAction
  ): ReturnType<typeof executeMove> {
    if (this.wouldRedirectAuthoritativeCenterMove(board, action)) {
      return null;
    }

    const result = executeMove(
      board,
      action.playerIndex,
      action.move,
      undefined,
      action.time
    );
    if (result != null) {
      this.applyRoomActionMetadataToBoard(board, action);
    }
    return result;
  }
  private wouldRedirectAuthoritativeCenterMove(
    board: BoardState,
    action: RoomAction
  ): boolean {
    if (action.type !== "move" || action.move.type !== "c2c") {
      return false;
    }

    const resolvedMove = resolveMoveForBoard(
      board,
      action.playerIndex,
      action.move
    );
    return resolvedMove.type === "c2c" && resolvedMove.dest !== action.move.dest;
  }
  private applyRoomActionMetadataToBoard(
    board: BoardState | null,
    action: RoomAction
  ): void {
    if (!board || !action.pileLocs) {
      return;
    }

    board.pileLocs = applyDeepUpdate(board.pileLocs, action.pileLocs, true);
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
function applyDeepUpdate<T>(
  target: T,
  value: unknown,
  cloneNewValues = false
): T {
  if (value === target) {
    return target;
  }
  if (
    typeof target !== typeof value ||
    Array.isArray(target) !== Array.isArray(value) ||
    (target == null) !== (value == null)
  ) {
    return cloneNewValues ? cloneDeepUpdateValue(value as T) : (value as T);
  }

  if (Array.isArray(target) && Array.isArray(value)) {
    if (target.length === value.length) {
      for (let i = 0; i < target.length; i++) {
        target[i] = applyDeepUpdate(target[i], value[i], cloneNewValues);
        // todo: Does this assignment cause issues with mobx?
      }
      return target;
    }
    // todo: if one array is just a prefix of another, we should just push maybe

    // If the arrays are different lengths, we will create a new array but preserve elements
    const newValues = value.map((v, i): any => {
      // Look if theres a "match" to update
      const elTarget = target[i];
      return applyDeepUpdate(elTarget, v, cloneNewValues);
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
      targetObj[key] = applyDeepUpdate(
        targetObj[key],
        valueObj[key],
        cloneNewValues
      );
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

function cloneDeepUpdateValue<T>(value: T): T {
  return value == null || typeof value !== "object" ? value : deepClone(value);
}
