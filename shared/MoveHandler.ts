import { BoardState, CardState, isGameOver } from "./GameUtils";
import { canMoveToSolitairePile, canPlayOnCenterPile, peek } from "./CardUtils";

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
    } else if (move.type === "flip_deck") {
      //todo
    } else if (move.type === "move_field_stack") {
      board.pileLocs[move.index][0] = move.position[0];
      board.pileLocs[move.index][1] = move.position[1];
    } else {
      const _unused: never = move;
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

function cycleDeck(boardState: BoardState, playerIndex: number) {
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
