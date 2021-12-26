import { CardState } from "../shared/GameUtils";

export type SourceType =
  | { type: "pounce" }
  | { type: "solitaire"; pileIndex: number; slotIndex: number }
  | { type: "flippedDeck" }
  | { type: "other" }
  | { type: "field_stack"; index: number; isTopCard: boolean };

export type CardDnDItem = {
  source: SourceType;
  card: CardState;
};

export type FieldStackDnDItem = {
  index: number;
};
