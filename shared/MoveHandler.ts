import {
  BoardState,
  CardState,
  CursorState,
  PlayerState,
  fixBoardPiles,
  isCardCursorLocation,
  isGameOver,
  isRoundStartPending,
} from "./GameUtils";
import {
  canMoveToSolitairePile,
  canPlayOnCenterPile,
  cardEquals,
  couldMatch,
  peek,
} from "./CardUtils";

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
  | { type: "cycle" }
  | { type: "flip_deck" }
  | { type: "move_field_stack"; index: number; position: [number, number] };
type MoveResult = {
  cursorMove?: CardState;
  cursorMoveItem?: CardState;
  clearCursor?: boolean;
  clearCursorLocation?: CardState | null;
  boardChanged?: boolean;
};
type AICursorData = CursorState | undefined;

function cursorLocationEqualsCard(
  location: CursorState["location"],
  card: CardState | null | undefined
): boolean {
  return isCardCursorLocation(location) && cardEquals(location, card);
}

export function isBoardAcceptingMoves(
  board: BoardState,
  now = Date.now()
): boolean {
  return (
    board.isActive &&
    !board.isPaused &&
    !isRoundStartPending(board, now) &&
    !isGameOver(board)
  );
}

export function isProductiveMove(move: Move): boolean {
  return (
    move.type !== "cycle" &&
    move.type !== "flip_deck" &&
    move.type !== "move_field_stack"
  );
}

function getSourceCard(
  boardState: BoardState,
  player: PlayerState,
  move: Move
): CardState | null | undefined {
  // Technically not true, but for the sake of the AI it is
  if (
    move.type === "cycle" ||
    move.type === "flip_deck" ||
    move.type === "move_field_stack"
  ) {
    return null;
  }
  if (move.type === "s2s") {
    return player.stacks[move.source][
      player.stacks[move.source].length - move.count
    ];
  }
  if (move.type === "c2s") {
    return move.source === "pounce"
      ? peek(player.pounceDeck)
      : peek(player.flippedDeck);
  }

  return move.source.type === "pounce"
    ? peek(player.pounceDeck)
    : move.source.type === "deck"
    ? peek(player.flippedDeck)
    : peek(player.stacks[move.source.index]);
}
export function executeMove(
  board: BoardState,
  playerIndex: number,
  move: Move,
  aiCursor?: AICursorData,
  now = Date.now()
): MoveResult | null {
  try {
    if (!isBoardAcceptingMoves(board, now)) {
      throw new Error("Game is not accepting moves");
    }
    const player = board.players[playerIndex];
    if (player.isSpectating) {
      throw new Error("Spectating player cannot move");
    }
    let moveResult: MoveResult;
    const card = getSourceCard(board, player, move);

    if (aiCursor?.item != null && !cardEquals(card, aiCursor.item)) {
      // Technically human players can release anywhere to reset the card back
      // But this helps represent the "mental" reset of missing a drop, and makes
      // the move failure more visible
      if (cursorLocationEqualsCard(aiCursor.location, aiCursor.item)) {
        return { clearCursor: true };
      }
      return { cursorMove: aiCursor.item };
    }
    if (move.type === "c2c") {
      moveResult = cardToCenter(
        board,
        playerIndex,
        move.source,
        move.dest,
        aiCursor
      );
      const pile = board.piles[move.dest];
      // May set the position of the pile
      if (pile.length === 1 && move.position) {
        board.pileLocs[move.dest][0] = move.position[0];
        board.pileLocs[move.dest][1] = move.position[1];
        fixBoardPiles(board, move.dest);
      }
    } else if (move.type === "cycle") {
      moveResult = cycleDeck(board, playerIndex, aiCursor);
    } else if (move.type === "c2s") {
      moveResult = cardToSolitaire(
        board,
        playerIndex,
        move.source,
        move.dest,
        aiCursor
      );
    } else if (move.type === "s2s") {
      moveResult = solitaireToSolitaire(
        board,
        playerIndex,
        move.source,
        move.dest,
        move.count,
        aiCursor
      );
    } else if (move.type === "flip_deck") {
      const player = board.players[playerIndex];
      if (player.deck.length === 0 && player.flippedDeck.length === 0) {
        throw new Error("No deck cards to flip");
      }
      if (player.deck.length === 0) {
        player.deck = player.flippedDeck.reverse();
        player.flippedDeck = [];
      } else {
        player.flippedDeck.push(...player.deck.reverse());
        player.deck = [];
      }
      moveResult = {};
    } else if (move.type === "move_field_stack") {
      board.pileLocs[move.index][0] = move.position[0];
      board.pileLocs[move.index][1] = move.position[1];
      fixBoardPiles(board, move.index);
      moveResult = {};
    } else {
      const _unused: never = move;
      throw new Error("Invalid move type");
    }

    if (moveResult.cursorMove == null) {
      moveResult.boardChanged = true;
    }

    player.currentPoints =
      52 +
      player.pounceDeck.length * -3 +
      player.deck.length * -1 +
      player.flippedDeck.length * -1 +
      player.stacks.reduce((s, x) => s + x.length, 0) * -1;
    if (isProductiveMove(move)) {
      // Progress is made on the board
      board.ticksSinceMove = 0;
    }
    board.ticksSinceMove += 1 / board.players.length;
    return moveResult;
  } catch (e) {
    // console.error("Player " + playerIndex + " attempted an illegal move", e);
    return null;
  }
}

function cardToCenter(
  boardState: BoardState,
  playerIndex: number,
  source:
    | { type: "pounce" }
    | { type: "solitaire"; index: number }
    | { type: "deck" },
  dest: number,
  aiCursor: AICursorData
): MoveResult {
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
  let pile = boardState.piles[dest];
  if (topCard.value === 1 && pile.length > 0) {
    // Just auto-adjust to another pile; this is a common mistake from delayed reactions by AI, and not realistic
    dest = boardState.piles.findIndex((p) => p.length === 0);
    pile = boardState.piles[dest];
  }
  if (aiCursor && !cardEquals(aiCursor.item, topCard)) {
    if (cursorLocationEqualsCard(aiCursor.location, topCard)) {
      // Already on the right card, now drag it
      const pileCard = peek(pile);
      if (pileCard) {
        return { cursorMove: pileCard, cursorMoveItem: topCard };
      }
    } else {
      return { cursorMove: topCard };
    }
  } else if (aiCursor) {
    const pileCard = peek(pile);
    if (pileCard && !cursorLocationEqualsCard(aiCursor.location, pileCard)) {
      return { cursorMove: pileCard, cursorMoveItem: topCard };
    }
  }
  if (!pile || !canPlayOnCenterPile(pile, topCard)) {
    throw new Error("Cannot play given card on pile");
  }
  if (!pile) {
    throw new Error("No pile to play on");
  }

  const wasEmptyPile = pile.length === 0;
  sourceStack.pop();
  pile.push(topCard);
  return {
    clearCursor: true,
    clearCursorLocation: wasEmptyPile ? topCard : null,
  };
}

function cardToSolitaire(
  boardState: BoardState,
  playerIndex: number,
  source: "pounce" | "deck",
  solitairePile: number,
  aiCursor: AICursorData
): MoveResult {
  const player = boardState.players[playerIndex];
  const sourceStack =
    source === "pounce" ? player.pounceDeck : player.flippedDeck;
  const destStack = player.stacks[solitairePile];
  const topCard = peek(sourceStack);
  if (topCard == null) {
    throw new Error("No card to play from that pile");
  }
  if (
    aiCursor &&
    !cursorLocationEqualsCard(aiCursor.location, topCard) &&
    !isHoldingCardOverSolitairePile(
      aiCursor,
      boardState,
      playerIndex,
      solitairePile,
      topCard
    )
  ) {
    return { cursorMove: topCard };
  }
  if (
    destStack.length >= 1 &&
    topCard.value === destStack[0].value + 1 &&
    couldMatch(topCard, destStack[0])
  ) {
    // Trying to tuck a card under the solitaire stack, ensure they have a free slot
    if (!player.stacks.some((s) => s.length === 0)) {
      throw new Error("No free solitaire slots");
    }
    sourceStack.pop();
    destStack.unshift(topCard);
    return {};
  } else if (!canMoveToSolitairePile(topCard, destStack)) {
    throw new Error("Tried to move stack to stack of invalid value/color");
  }
  sourceStack.pop();
  destStack.push(topCard);
  return { clearCursor: true };
}

function solitaireToSolitaire(
  boardState: BoardState,
  playerIndex: number,
  fromPile: number,
  toPile: number,
  count: number,
  aiCursor: AICursorData
): MoveResult {
  const player = boardState.players[playerIndex];
  const source = player.stacks[fromPile];
  const dest = player.stacks[toPile];

  const topCard = source[source.length - count];
  if (topCard == null) {
    throw new Error("Tried to move too many cards from solitaire stack");
  }

  if (
    aiCursor &&
    !cursorLocationEqualsCard(aiCursor.location, topCard) &&
    !isHoldingCardOverSolitairePile(
      aiCursor,
      boardState,
      playerIndex,
      toPile,
      topCard
    )
  ) {
    return { cursorMove: topCard };
  }
  if (!canMoveToSolitairePile(topCard, dest)) {
    throw new Error(
      "Tried to move solitaire stack to stack of invalid value/color"
    );
  }
  const movingStack = source.splice(source.length - count, count);
  dest.push(...movingStack);
  return {};
}

function cycleDeck(
  boardState: BoardState,
  playerIndex: number,
  aiCursor: AICursorData
): MoveResult {
  const player = boardState.players[playerIndex];
  if (player.deck.length === 0 && player.flippedDeck.length === 0) {
    throw new Error("No deck cards to cycle");
  }
  if (player.deck.length === 0) {
    if (
      aiCursor &&
      !cursorLocationEqualsCard(aiCursor.location, peek(player.flippedDeck))
    ) {
      return { cursorMove: peek(player.flippedDeck) };
    }
    player.deck = player.flippedDeck.reverse();
    player.flippedDeck = [];
  } else {
    const triple = player.deck.slice(-3).reverse();
    if (aiCursor && !cursorLocationEqualsCard(aiCursor.location, peek(triple))) {
      return { cursorMove: peek(triple) };
    }
    player.deck.pop();
    player.deck.pop();
    player.deck.pop();
    player.flippedDeck.push(...triple);
  }
  return {};
}

function isHoldingCardOverSolitairePile(
  aiCursor: AICursorData,
  boardState: BoardState,
  playerIndex: number,
  pileIndex: number,
  card: CardState
): boolean {
  if (!aiCursor?.item || !cardEquals(aiCursor.item, card)) {
    return false;
  }

  const location = aiCursor.location;
  if (!location) {
    return false;
  }
  if (!isCardCursorLocation(location)) {
    return (
      location.type === "solitaire_slot" &&
      location.player === playerIndex &&
      location.pileIndex === pileIndex
    );
  }

  const stack = boardState.players[playerIndex].stacks[pileIndex];
  return stack.some((stackCard) => cardEquals(stackCard, location));
}

export function getDistance(
  p1: readonly [number, number],
  p2: readonly [number, number]
): number {
  const d1 = p1[0] - p2[0];
  const d2 = p1[1] - p2[1];
  return Math.sqrt(d1 * d1 + d2 * d2);
}
