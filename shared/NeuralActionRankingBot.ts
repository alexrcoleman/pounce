import type { CursorState, BoardState } from "./GameUtils";
import championModel from "./models/pounce-action-ranking-cursor-champion.json";
import { getBasicAIMove } from "./ComputerV1";
import type { Move } from "./MoveHandler";
import {
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "./NeuralActionRankingPolicy";
import type { AIMode } from "./RoomState";

let neuralAIPolicy: NeuralActionRankingPolicy | null =
  new NeuralActionRankingPolicy(championModel as NeuralActionRankingModel);

export function setNeuralAIModel(model: NeuralActionRankingModel): void {
  neuralAIPolicy = new NeuralActionRankingPolicy(model);
}

export function clearNeuralAIModel(): void {
  neuralAIPolicy = null;
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
  return neuralAIPolicy?.chooseMove(boardState, playerIndex, {
    actionOptions: { hands, includeWait: true, includePremove: true },
  });
}

export function getConfiguredAIMove(
  boardState: BoardState,
  playerIndex: number,
  cursor: CursorState,
  hands: readonly CursorState[] | undefined,
  mode: AIMode | undefined
): Move | undefined {
  const normalizedMode = mode ?? "fixed";
  if (normalizedMode === "trained") {
    return (
      getNeuralAIMove(boardState, playerIndex, cursor, hands) ??
      getBasicAIMove(boardState, playerIndex, cursor)
    );
  }
  if (normalizedMode === "hybrid" && isFirstAIPlayer(boardState, playerIndex)) {
    return (
      getNeuralAIMove(boardState, playerIndex, cursor, hands) ??
      getBasicAIMove(boardState, playerIndex, cursor)
    );
  }
  return getBasicAIMove(boardState, playerIndex, cursor);
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
