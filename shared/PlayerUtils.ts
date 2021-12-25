import { BoardState, CardState, Suits, isGameOver } from "./GameUtils";

const black = ["clubs", "spades"];
export function cycleDeck(boardState: BoardState, playerIndex: number) {
  const player = boardState.players[playerIndex];
  if (player.deck.length === 0) {
    player.deck = player.flippedDeck.reverse();
    player.flippedDeck = [];
  } else {
    const triple = [
      player.deck.pop(),
      player.deck.pop(),
      player.deck.pop(),
    ].filter(Boolean) as CardState[];
    player.flippedDeck.push(...triple);
  }
}

function peek(cards: CardState[]): CardState | undefined {
  return cards[cards.length - 1] ?? undefined;
}

function cardToSolitaire(
  boardState: BoardState,
  playerIndex: number,
  source: "pounce" | "deck",
  solitairePile: number
) {
  const player = boardState.players[playerIndex];
  const sourceStack =
    source === "pounce" ? player.pounceDeck : player.flippedDeck;
  const destStack = player.stacks[solitairePile];
  const topCard = peek(sourceStack);
  if (topCard == null) {
    throw new Error("No card to play from that pile");
  }
  if (!canMoveToSolitairePile(topCard, destStack)) {
    throw new Error("Tried to move stack to stack of invalid value/color");
  }
  sourceStack.pop();
  destStack.push(topCard);
}

function solitaireToSolitaire(
  boardState: BoardState,
  playerIndex: number,
  fromPile: number,
  toPile: number,
  count: number
) {
  const player = boardState.players[playerIndex];
  const source = player.stacks[fromPile];
  const dest = player.stacks[toPile];

  const topCard = source[source.length - count];
  if (topCard == null) {
    throw new Error("Tried to move too many cards from solitaire stack");
  }
  if (!canMoveToSolitairePile(topCard, dest)) {
    throw new Error(
      "Tried to move solitaire stack to stack of invalid value/color"
    );
  }
  const movingStack = source.splice(source.length - count, count);
  dest.push(...movingStack);
}

function canPlayOnCenterPile(pile: CardState[], card: CardState) {
  const top = pile[pile.length - 1];
  return (
    (top != null && top.suit === card.suit && top.value === card.value - 1) ||
    (top == null && card.value === 1)
  );
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

function canMoveToSolitairePile(
  card: CardState | undefined,
  solitairePile: CardState[]
) {
  if (card == null) {
    return false;
  }
  const destTopCard = peek(solitairePile);
  if (destTopCard != null) {
    if (black.includes(destTopCard.suit) === black.includes(card.suit)) {
      return false;
    }
    if (destTopCard.value !== card.value + 1) {
      return false;
    }
  }
  return true;
}

function cardToCenter(
  boardState: BoardState,
  playerIndex: number,
  source:
    | { type: "pounce" }
    | { type: "solitaire"; index: number }
    | { type: "deck" },
  dest: number
) {
  const player = boardState.players[playerIndex];
  const sourceStack =
    source.type === "pounce"
      ? player.pounceDeck
      : source.type === "deck"
      ? player.flippedDeck
      : player.stacks[source.index];
  const topCard = peek(sourceStack);
  if (topCard == null) {
    throw new Error("No card to play from that pile");
  }
  const pile = boardState.piles[dest];
  if (!pile || !canPlayOnCenterPile(pile, topCard)) {
    throw new Error("Cannot play given card on pile");
  }
  if (!pile) {
    throw new Error("No pile to play on");
  }

  sourceStack.pop();
  pile.push(topCard);
}
export type Move =
  | {
      type: "s2s";
      source: number;
      dest: number;
      count: number;
    }
  | { type: "c2s"; source: "pounce" | "deck"; dest: number }
  | {
      type: "c2c";
      source:
        | { type: "pounce" }
        | { type: "deck" }
        | { type: "solitaire"; index: number };
      dest: number;
      position?: [number, number];
    }
  | { type: "cycle" };

function getBasicAIMove(boardState: BoardState, playerIndex: number): Move {
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

function couldMatch(a: CardState, b: CardState) {
  return (
    a.value % 2 ^
    b.value % 2 ^
    (a.suit === "spades" || a.suit === "clubs" ? 1 : 0) ^
    (b.suit === "spades" || b.suit === "clubs" ? 1 : 0)
  );
}
export function handleAIMove(boardState: BoardState, playerIndex: number) {
  if (isGameOver(boardState)) {
    return;
  }
  const move = getBasicAIMove(boardState, playerIndex);
  executeMove(boardState, playerIndex, move);
}

export function executeMove(
  board: BoardState,
  playerIndex: number,
  move: Move
) {
  try {
    if (isGameOver(board)) {
      throw new Error("Game is over");
    }
    const player = board.players[playerIndex];
    if (move.type === "c2c") {
      cardToCenter(board, playerIndex, move.source, move.dest);
      const pile = board.piles[move.dest];
      // May set the position of the pile
      if (pile.length === 1 && move.position) {
        board.pileLocs[move.dest][0] = move.position[0];
        board.pileLocs[move.dest][1] = move.position[1];
      }
    } else if (move.type === "cycle") {
      cycleDeck(board, playerIndex);
    } else if (move.type === "c2s") {
      cardToSolitaire(board, playerIndex, move.source, move.dest);
    } else if (move.type === "s2s") {
      solitaireToSolitaire(
        board,
        playerIndex,
        move.source,
        move.dest,
        move.count
      );
    }

    player.currentPoints =
      52 +
      player.pounceDeck.length * -3 +
      player.deck.length * -1 +
      player.flippedDeck.length * -1 +
      player.stacks.reduce((s, x) => s + x.length, 0) * -1;
  } catch (e) {
    console.error("Player " + playerIndex + " attempted an illegal move", e);
  }
}
