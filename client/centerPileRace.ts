import type { CardState } from "../shared/GameUtils";
import { canPlayOnCenterPile } from "../shared/CardUtils";

export function getPlayableCenterPileIndices(
  piles: readonly CardState[][],
  card: CardState
): number[] {
  return piles.flatMap((pile, index) =>
    canPlayOnCenterPile(pile, card) ? [index] : []
  );
}

export function getCenterPileRaceWinner(
  pile: readonly CardState[] | undefined,
  attemptedCard: CardState,
  playerIndex: number
): CardState | null {
  const topCard = pile?.[pile.length - 1];
  if (
    !topCard ||
    topCard.suit !== attemptedCard.suit ||
    topCard.value < attemptedCard.value
  ) {
    return null;
  }

  const matchingCard = pile.find(
    (card) =>
      card.suit === attemptedCard.suit && card.value === attemptedCard.value
  );
  if (!matchingCard || matchingCard.player === playerIndex) {
    return null;
  }

  return matchingCard;
}
