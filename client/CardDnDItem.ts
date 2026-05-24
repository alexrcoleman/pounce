import { CardState } from "../shared/GameUtils";

export type SourceType =
  | { type: "pounce" }
  | {
      type: "solitaire";
      pileIndex: number;
      slotIndex: number;
      isTopCard: boolean;
    }
  | { type: "flippedDeck" }
  | { type: "other" }
  | { type: "field_stack"; index: number; isTopCard: boolean };

export type CardDnDItem = {
  source: SourceType;
  card: CardState;
  initialClientPosition: [number, number];
};

export type FieldStackDnDItem = {
  index: number;
  initialPosition: [number, number];
  initialClientPosition: [number, number];
};

export function isMultiCardSolitaireDrag(item: CardDnDItem): boolean {
  return item.source.type === "solitaire" && !item.source.isTopCard;
}
