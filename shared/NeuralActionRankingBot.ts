import type { CursorState, BoardState } from "./GameUtils";
import type { Move } from "./MoveHandler";
import {
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "./NeuralActionRankingPolicy";

let neuralAIPolicy: NeuralActionRankingPolicy | null = null;

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
  _cursor: CursorState
): Move | undefined {
  return neuralAIPolicy?.chooseMove(boardState, playerIndex);
}
