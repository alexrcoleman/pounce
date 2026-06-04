import type { CardState } from "./GameUtils";

export function peek(cards: CardState[]): CardState | undefined {
  return cards[cards.length - 1];
}

export function cardEquals(
  a: CardState | null | undefined,
  b: CardState | null | undefined
) {
  if (a == null || b == null) {
    return a == null && b == null;
  }
  return (
    a.player === b.player && a.suit === b.suit && a.value === b.value
  );
}

export function canMoveToSolitairePile(
  card: CardState | undefined,
  solitairePile: CardState[]
) {
  if (card == null) {
    return false;
  }
  const destTopCard = peek(solitairePile);
  if (destTopCard != null) {
    if (isBlackSuit(destTopCard.suit) === isBlackSuit(card.suit)) {
      return false;
    }
    if (destTopCard.value !== card.value + 1) {
      return false;
    }
  }
  return true;
}

export function canPlayOnCenterPile(pile: CardState[], card: CardState) {
  const top = pile[pile.length - 1];
  return (
    (top != null && top.suit === card.suit && top.value === card.value - 1) ||
    (top == null && card.value === 1)
  );
}

export function couldMatch(a: CardState, b: CardState): boolean {
  return (
    (a.value % 2 ^
      b.value % 2 ^
      (a.suit === "spades" || a.suit === "clubs" ? 1 : 0) ^
      (b.suit === "spades" || b.suit === "clubs" ? 1 : 0)) ===
    0
  );
}

function isBlackSuit(suit: CardState["suit"]): boolean {
  return suit === "clubs" || suit === "spades";
}
