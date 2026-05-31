import { toast } from "sonner";

import {
  canMoveToSolitairePile,
  canPlayOnCenterPile,
  couldMatch,
  peek,
} from "../shared/CardUtils";
import {
  type BoardState,
  type CardState,
  type PlayerState,
  isGameOver,
} from "../shared/GameUtils";
import type { Move } from "../shared/MoveHandler";

type RejectedMoveToastArgs = {
  board: BoardState | null;
  move: Move;
  playerIndex: number;
  reason?: string;
};

type RejectionCopy = {
  message: string;
};

const MOVE_REJECTION_TOAST_ID = "move-rejection";

export function toastRejectedMove(args: RejectedMoveToastArgs) {
  const copy = describeRejectedMove(args);
  toast.error(copy.message, {
    duration: 5000,
    id: MOVE_REJECTION_TOAST_ID,
    testId: "move-rejection-toast",
  });
}

function describeRejectedMove({
  board,
  move,
  playerIndex,
  reason,
}: RejectedMoveToastArgs): RejectionCopy {
  if (!board) {
    return genericRejectedMove(reason);
  }

  const player = board.players[playerIndex];
  if (!player) {
    return genericRejectedMove(reason ?? "No player was found for that move.");
  }

  const blockedReason = getBlockedBoardReason(board, player);
  if (blockedReason) {
    return genericRejectedMove(blockedReason);
  }

  switch (move.type) {
    case "c2c":
      return describeCardToCenter(board, player, move, reason);
    case "c2s":
      return describeCardToSolitaire(player, move, reason);
    case "s2s":
      return describeStackToSolitaire(player, move, reason);
    case "cycle":
      return genericRejectedMove(reason ?? "The deck could not be cycled.");
    case "flip_deck":
      return genericRejectedMove(reason ?? "The deck could not be flipped.");
    case "wait":
      return genericRejectedMove(reason ?? "Waiting is not available now.");
    case "premove":
      return genericRejectedMove(reason ?? "That card could not be readied.");
    case "move_field_stack":
      return genericRejectedMove(reason ?? "That center pile could not move.");
  }
}

function describeCardToCenter(
  board: BoardState,
  player: PlayerState,
  move: Extract<Move, { type: "c2c" }>,
  reason?: string
): RejectionCopy {
  const card = getCenterSourceCard(player, move.source);
  if (!card) {
    return genericRejectedMove(
      `${getCenterSourceName(move.source)} is no longer available.`
    );
  }

  const pile = board.piles[move.dest];
  if (!pile) {
    return {
      message: `${formatCard(card)} invalid: no center pile.`,
    };
  }

  if (canPlayOnCenterPile(pile, card)) {
    return genericRejectedMove(reason);
  }

  const topCard = peek(pile);
  if (!topCard) {
    return {
      message: `${formatCard(card)} invalid: only Ace starts center.`,
    };
  }

  if (topCard.suit === card.suit && topCard.value >= card.value) {
    return {
      message: `${formatCard(card)} beaten: pile already ${formatCard(topCard)}.`,
    };
  }

  return {
    message: `${formatCard(card)} invalid on ${formatCard(topCard)}; needs ${formatNextCenterCard(topCard)}.`,
  };
}

function describeCardToSolitaire(
  player: PlayerState,
  move: Extract<Move, { type: "c2s" }>,
  reason?: string
): RejectionCopy {
  const card =
    move.source === "pounce" ? peek(player.pounceDeck) : peek(player.flippedDeck);

  return describeSolitairePlacement({
    card,
    destStack: player.stacks[move.dest],
    player,
    reason,
    sourceName: move.source === "pounce" ? "pounce card" : "deck card",
  });
}

function describeStackToSolitaire(
  player: PlayerState,
  move: Extract<Move, { type: "s2s" }>,
  reason?: string
): RejectionCopy {
  const sourceStack = player.stacks[move.source];
  const card = sourceStack?.[sourceStack.length - move.count];

  return describeSolitairePlacement({
    card,
    destStack: player.stacks[move.dest],
    player,
    reason,
    sourceName: "solitaire stack",
  });
}

function describeSolitairePlacement({
  card,
  destStack,
  player,
  reason,
  sourceName,
}: {
  card: CardState | undefined;
  destStack: CardState[] | undefined;
  player: PlayerState;
  reason?: string;
  sourceName: string;
}): RejectionCopy {
  if (!card) {
    return genericRejectedMove(`That ${sourceName} is no longer available.`);
  }

  if (!destStack) {
    return {
      message: `${formatCard(card)} invalid: no solitaire stack.`,
    };
  }

  if (canMoveToSolitairePile(card, destStack)) {
    return genericRejectedMove(reason);
  }

  const bottomCard = destStack[0];
  if (
    bottomCard &&
    card.value === bottomCard.value + 1 &&
    couldMatch(card, bottomCard) &&
    !player.stacks.some((stack) => stack.length === 0)
  ) {
    return {
      message: `${formatCard(card)} invalid: no slot to tuck under ${formatCard(bottomCard)}.`,
    };
  }

  const topCard = peek(destStack);
  if (!topCard) {
    return genericRejectedMove(reason);
  }

  return {
    message: `${formatCard(card)} invalid on ${formatCard(topCard)}; alternate colors descending.`,
  };
}

function getBlockedBoardReason(
  board: BoardState,
  player: PlayerState
): string | null {
  if (!board.isActive) {
    return "The game is not accepting moves right now.";
  }
  if (board.isPaused) {
    return "The game is paused.";
  }
  if (isGameOver(board)) {
    return "The round is already over.";
  }
  if (player.isSpectating) {
    return "Spectating players cannot move.";
  }
  return null;
}

function getCenterSourceCard(
  player: PlayerState,
  source: Extract<Move, { type: "c2c" }>["source"]
): CardState | undefined {
  if (source.type === "pounce") {
    return peek(player.pounceDeck);
  }
  if (source.type === "deck") {
    return peek(player.flippedDeck);
  }
  return peek(player.stacks[source.index]);
}

function getCenterSourceName(
  source: Extract<Move, { type: "c2c" }>["source"]
): string {
  if (source.type === "pounce") {
    return "Your pounce card";
  }
  if (source.type === "deck") {
    return "Your deck card";
  }
  return "That solitaire card";
}

function genericRejectedMove(description?: string): RejectionCopy {
  const normalizedDescription = description?.trim();
  if (
    !normalizedDescription ||
    /^move rejected\.?$/i.test(normalizedDescription)
  ) {
    return {
      message: "Move rejected.",
    };
  }

  return {
    message: `Move rejected: ${normalizedDescription}`,
  };
}

function formatCard(card: CardState): string {
  return `${formatValue(card.value)}${formatSuit(card.suit)}`;
}

function formatNextCenterCard(card: CardState): string {
  if (card.value >= 13) {
    return "none";
  }
  return `${formatValue(card.value + 1)}${formatSuit(card.suit)}`;
}

function formatValue(value: number): string {
  if (value === 1) {
    return "A";
  }
  if (value === 11) {
    return "J";
  }
  if (value === 12) {
    return "Q";
  }
  if (value === 13) {
    return "K";
  }
  return String(value);
}

function formatSuit(suit: string): string {
  if (suit === "clubs") {
    return "\u2663";
  }
  if (suit === "diamonds") {
    return "\u2666";
  }
  if (suit === "hearts") {
    return "\u2665";
  }
  return "\u2660";
}
