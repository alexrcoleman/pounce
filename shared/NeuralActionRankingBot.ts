import type { CursorState, BoardState } from "./GameUtils";
import championModel from "./models/pounce-action-ranking-cursor-champion.json";
import { getBasicAIMove } from "./ComputerV1";
import type { Move } from "./MoveHandler";
import { enumerateActionRankingCandidates } from "./ActionRankingPolicy";
import {
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "./NeuralActionRankingPolicy";
import { getAIPlayerResolvedMode, type AIMode } from "./RoomState";

let neuralAIPolicy: NeuralActionRankingPolicy | null =
  new NeuralActionRankingPolicy(championModel as NeuralActionRankingModel);
let neuralAIMemoryByBoard = new WeakMap<
  BoardState,
  { roundKey: string; memoryByPlayer: Map<number, number[]> }
>();

export function setNeuralAIModel(model: NeuralActionRankingModel): void {
  neuralAIPolicy = new NeuralActionRankingPolicy(model);
  neuralAIMemoryByBoard = new WeakMap();
}

export function clearNeuralAIModel(): void {
  neuralAIPolicy = null;
  neuralAIMemoryByBoard = new WeakMap();
}

export function hasNeuralAIModel(): boolean {
  return neuralAIPolicy != null;
}

export function getNeuralAIMove(
  boardState: BoardState,
  playerIndex: number,
  _cursor: CursorState,
  hands?: readonly CursorState[]
): Move | undefined {
  if (!neuralAIPolicy) {
    return;
  }
  const store = getNeuralAIMemoryStore(boardState);
  const memoryState = getNeuralAIMemoryState(store, playerIndex, neuralAIPolicy);
  const candidates = enumerateActionRankingCandidates(boardState, playerIndex, {
    hands,
    includeWait: true,
    includePremove: true,
    includeFlipDeck: true,
  });
  const choice = neuralAIPolicy.chooseCandidateWithMemory(
    candidates,
    memoryState
  );
  if (!choice) {
    return;
  }
  store.memoryByPlayer.set(playerIndex, choice.memoryState);
  return choice.candidate.move;
}

export function getConfiguredAIMove(
  boardState: BoardState,
  playerIndex: number,
  cursor: CursorState,
  hands: readonly CursorState[] | undefined,
  mode: AIMode | undefined
): Move | undefined {
  if (getAIPlayerResolvedMode(boardState, playerIndex, mode) === "trained") {
    return (
      getNeuralAIMove(boardState, playerIndex, cursor, hands) ??
      getBasicAIMove(boardState, playerIndex, cursor)
    );
  }
  return getBasicAIMove(boardState, playerIndex, cursor);
}

function getNeuralAIMemoryStore(boardState: BoardState) {
  const roundKey = getNeuralAIRoundKey(boardState);
  const current = neuralAIMemoryByBoard.get(boardState);
  if (current?.roundKey === roundKey) {
    return current;
  }
  const next = {
    roundKey,
    memoryByPlayer: new Map<number, number[]>(),
  };
  neuralAIMemoryByBoard.set(boardState, next);
  return next;
}

function getNeuralAIMemoryState(
  store: { memoryByPlayer: Map<number, number[]> },
  playerIndex: number,
  policy: NeuralActionRankingPolicy
): number[] {
  const current = store.memoryByPlayer.get(playerIndex) ?? [];
  return current.length === policy.getRecurrentStateSize()
    ? current.slice()
    : policy.createInitialMemoryState();
}

function getNeuralAIRoundKey(boardState: BoardState): string {
  return [
    boardState.isActive ? 1 : 0,
    boardState.isDealt ? 1 : 0,
    boardState.roundStartsAt ?? 0,
    boardState.players.length,
    boardState.players.map((player) => player.scores.length).join("|"),
  ].join(":");
}
