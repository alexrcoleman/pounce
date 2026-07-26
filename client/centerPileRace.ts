import type { CardState } from "../shared/GameUtils";
import type { Move } from "../shared/MoveHandler";

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

export function isConfirmedCenterPileRaceRejection(
  move: Move,
  reason?: string
): boolean {
  return (
    move.type === "c2c" &&
    (reason === "That move is no longer available." ||
      reason === "The round is already over.")
  );
}
