import { peek } from "./CardUtils";
import type {
  BoardState,
  CardState,
  CursorState,
  PlayerState,
} from "./GameUtils";
import type { Move, MoveResult } from "./MoveHandler";
import type { ActionRankingOptions } from "./ActionRankingPolicy";

export function createSimulationHands(
  board: BoardState,
  initialHands?: readonly CursorState[]
): CursorState[] {
  return board.players.map((_, playerIndex) =>
    cloneCursorState(initialHands?.[playerIndex])
  );
}

export function getSimulationHand(
  hands: CursorState[],
  playerIndex: number
): CursorState {
  hands[playerIndex] = hands[playerIndex] ?? {};
  return hands[playerIndex];
}

export function getSimulationActionOptions(
  actionOptions: ActionRankingOptions | undefined,
  hands: readonly CursorState[]
): ActionRankingOptions {
  return { ...actionOptions, hands };
}

export function applySimulationMoveResult(
  board: BoardState,
  playerIndex: number,
  move: Move,
  hand: CursorState,
  result: MoveResult | null
): void {
  if (!result) {
    return;
  }

  if (result.cursorMove) {
    hand.location = result.cursorMove;
    hand.item = result.cursorMoveItem ?? hand.item;
    hand.items = result.cursorMoveItem ? [result.cursorMoveItem] : undefined;
    return;
  }

  if (result.clearCursor) {
    if (move.type === "c2c") {
      hand.location =
        result.clearCursorLocation ??
        getPlayerHandCursorLocation(board, playerIndex, move);
      hand.item = null;
      hand.items = null;
      return;
    }

    hand.item = undefined;
    hand.items = undefined;
    return;
  }

  if (
    result.boardChanged &&
    (move.type === "cycle" || move.type === "flip_deck")
  ) {
    hand.location = getPlayerDeckCursorLocation(board, playerIndex);
    hand.item = null;
    hand.items = null;
  }
}

function cloneCursorState(cursor: CursorState | undefined): CursorState {
  return {
    location: cloneCursorLocation(cursor?.location),
    item: cloneCard(cursor?.item),
    items: cursor?.items?.map(cloneCard) ?? cursor?.items,
  };
}

function cloneCursorLocation(
  location: CursorState["location"]
): CursorState["location"] {
  if (location == null || "type" in location) {
    return location;
  }
  return cloneCard(location);
}

function cloneCard<T extends CardState | null | undefined>(card: T): T {
  return card == null ? card : ({ ...card } as T);
}

function getPlayerHandCursorLocation(
  board: BoardState,
  playerIndex: number,
  move: Extract<Move, { type: "c2c" }>
): CardState | null {
  const player = board.players[playerIndex];
  if (!player) {
    return null;
  }

  return (
    getPreferredSourceCursorLocation(player, move.source) ??
    peek(player.pounceDeck) ??
    peek(player.flippedDeck) ??
    peek(player.deck) ??
    getFirstSolitaireTopCard(player) ??
    null
  );
}

function getPreferredSourceCursorLocation(
  player: PlayerState,
  source: Extract<Move, { type: "c2c" }>["source"]
): CardState | null {
  if (source.type === "pounce") {
    return peek(player.pounceDeck) ?? null;
  }
  if (source.type === "deck") {
    return peek(player.flippedDeck) ?? peek(player.deck) ?? null;
  }
  return peek(player.stacks[source.index]) ?? null;
}

function getPlayerDeckCursorLocation(
  board: BoardState,
  playerIndex: number
): CardState | null {
  const player = board.players[playerIndex];
  if (!player) {
    return null;
  }

  return peek(player.flippedDeck) ?? peek(player.deck) ?? null;
}

function getFirstSolitaireTopCard(player: PlayerState): CardState | null {
  for (const stack of player.stacks) {
    const card = peek(stack);
    if (card) {
      return card;
    }
  }
  return null;
}
