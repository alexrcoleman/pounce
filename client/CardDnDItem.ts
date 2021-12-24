import { CardState } from "../shared/GameUtils";

export type SourceType =
  | { type: "pounce" }
  | { type: "solitaire"; pileIndex: number; slotIndex: number }
  | { type: "flippedDeck" }
  | { type: "other" };

export type CardDnDItem = {
  source: SourceType;
  card: CardState;
};
