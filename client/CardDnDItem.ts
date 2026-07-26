import { CardState } from "../shared/GameUtils";
import { getCenterPileRaceWinner } from "./centerPileRace";

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
  source: Exclude<SourceType, { type: "field_stack" }>;
  card: CardState;
  initialClientPosition: [number, number];
  centerPileTarget?: {
    handlerId: string | symbol;
    pileIndex: number;
  };
  rememberedCenterPileIndices?: number[];
};

export type FieldStackDnDItem = {
  index: number;
  initialPosition: [number, number];
  initialClientPosition: [number, number];
};

export function isMultiCardSolitaireDrag(item: CardDnDItem): boolean {
  return item.source.type === "solitaire" && !item.source.isTopCard;
}

export function getActiveCenterPileIndex(
  item: unknown,
  targetIds: readonly (string | symbol)[]
): number | null {
  if (
    typeof item !== "object" ||
    item == null ||
    !("card" in item) ||
    !("centerPileTarget" in item)
  ) {
    return null;
  }

  const target = (item as CardDnDItem).centerPileTarget;
  return target && targetIds.includes(target.handlerId)
    ? target.pileIndex
    : null;
}

export function canHandleRememberedCenterPileDrop(
  item: CardDnDItem,
  pile: readonly CardState[],
  pileIndex: number
): boolean {
  return (
    !isMultiCardSolitaireDrag(item) &&
    item.rememberedCenterPileIndices?.includes(pileIndex) === true &&
    getCenterPileRaceWinner(pile, item.card, item.card.player) != null
  );
}
