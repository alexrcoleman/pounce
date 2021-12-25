import type { BoardState, CardState } from "./GameUtils";
import {
  canMoveToSolitairePile,
  canPlayOnCenterPile,
  couldMatch,
  peek,
} from "./CardUtils";

import type { Move } from "./MoveHandler";

export function getBasicAIMove(
  boardState: BoardState,
  playerIndex: number
): Move {
  // Settings:
  const solitaireFromDeck = true;
  const solitaireFromDeckOnlyIfHelp = true;

  const player = boardState.players[playerIndex];
  // Play pounce card
  const pounceToCenterIndex = getCentralPileForCardIndex(
    boardState,
    peek(player.pounceDeck)
  );
  if (pounceToCenterIndex >= 0) {
    return {
      type: "c2c",
      source: { type: "pounce" },
      dest: pounceToCenterIndex,
    };
  }

  // Move pounce to solitaire
  const pounceToSolitaireIndex = player.stacks.findIndex((stack) =>
    canMoveToSolitairePile(peek(player.pounceDeck), stack)
  );
  if (pounceToSolitaireIndex >= 0) {
    return { type: "c2s", source: "pounce", dest: pounceToSolitaireIndex };
  }

  // Play solitaire card
  const playableSolitaire = player.stacks
    .map((stack, index) => ({
      source: index,
      dest: getCentralPileForCardIndex(boardState, peek(stack)),
    }))
    .find((item) => item.dest >= 0);
  if (playableSolitaire != null) {
    return {
      type: "c2c",
      source: { type: "solitaire", index: playableSolitaire.source },
      dest: playableSolitaire.dest,
    };
  }

  // Play deck card
  const deckCenterIndex = getCentralPileForCardIndex(
    boardState,
    peek(player.flippedDeck)
  );
  if (deckCenterIndex >= 0) {
    return { type: "c2c", source: { type: "deck" }, dest: deckCenterIndex };
  }

  // Merge whole solitaire piles
  const solitairePlay = player.stacks
    .map((stack, fromIndex) => {
      const toIndex = player.stacks.findIndex((stack2) =>
        canMoveToSolitairePile(stack[0], stack2)
      );
      if (toIndex >= 0) {
        return { fromIndex, toIndex };
      }
      return null;
    })
    .find((x) => x != null);
  if (solitairePlay != null) {
    return {
      type: "s2s",
      dest: solitairePlay.toIndex,
      source: solitairePlay.fromIndex,
      count: player.stacks[solitairePlay.fromIndex].length,
    };
  }

  if (solitaireFromDeck) {
    // Play solitaire moves from deck too
    const toIndex = player.stacks.findIndex((stack) => {
      if (!canMoveToSolitairePile(peek(player.flippedDeck), stack)) {
        return false;
      }
      if (!solitaireFromDeckOnlyIfHelp) {
        return true;
      }
      const pounceCard = peek(player.pounceDeck);
      const cands = player.stacks.map((stack) => stack[0]);
      if (pounceCard) {
        cands.push(pounceCard);
      }
      const stackLowest = stack[stack.length - 1];
      if (
        cands.find(
          (card) =>
            card.value < stackLowest.value &&
            card.value >= stackLowest.value - 5 &&
            couldMatch(card, stackLowest)
        ) != null
      ) {
        return true;
      }
      return false;
    });
    if (toIndex >= 0) {
      return { type: "c2s", source: "deck", dest: toIndex };
    }
  }

  return { type: "cycle" };
}

function getCentralPileForCardIndex(
  boardState: BoardState,
  card: CardState | undefined
) {
  if (card == null) {
    return -1;
  }
  return boardState.piles.findIndex((pile) => canPlayOnCenterPile(pile, card));
}
