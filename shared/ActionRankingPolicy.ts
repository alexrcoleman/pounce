import {
  canMoveToSolitairePile,
  canPlayOnCenterPile,
  cardEquals,
  couldMatch,
  peek,
} from "./CardUtils";
import deepClone from "./deepClone";
import type { BoardState, CardState, PlayerState } from "./GameUtils";
import { executeMove, type Move } from "./MoveHandler";

export const ACTION_RANKING_FEATURE_NAMES = [
  "bias",
  "move.c2c",
  "move.c2s",
  "move.s2s",
  "move.cycle",
  "move.flipDeck",
  "source.pounce",
  "source.deck",
  "source.solitaire",
  "dest.center",
  "dest.solitaire",
  "card.value",
  "card.isRed",
  "card.isAce",
  "card.isFace",
  "dest.isEmpty",
  "dest.topValue",
  "dest.stackHeight",
  "dest.centerHeight",
  "move.cardCount",
  "own.pounceCount",
  "own.deckCount",
  "own.flippedCount",
  "own.emptyStackCount",
  "own.currentPoints",
  "board.ticksSinceMove",
  "move.immediatePointDelta",
  "move.immediatePointDifferentialDelta",
  "move.clearsPounce",
  "center.ownCanFollowAfter",
  "center.opponentsCanFollowAfter",
  "center.opponentsCanPlaySameNow",
] as const;

export type ActionRankingFeatureName =
  (typeof ACTION_RANKING_FEATURE_NAMES)[number];

export type ActionRankingFeatureVector = number[];

export type ActionRankingCandidate = {
  key: string;
  move: Move;
  features: ActionRankingFeatureVector;
  immediatePointDelta: number;
  immediatePointDifferentialDelta: number;
  endsRound: boolean;
};

type ActionRankingOptions = {
  includeCycle?: boolean;
  includeFlipDeck?: boolean;
};

type MoveSource =
  | { type: "pounce"; card: CardState | undefined }
  | { type: "deck"; card: CardState | undefined }
  | { type: "solitaire"; index: number; card: CardState | undefined };

const RED_SUITS = ["hearts", "diamonds"];

export function enumerateActionRankingCandidates(
  board: BoardState,
  playerIndex: number,
  options: ActionRankingOptions = {}
): ActionRankingCandidate[] {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) {
    return [];
  }

  const moves = enumerateLegalMoves(board, playerIndex, options);
  return moves.map((move) =>
    createActionRankingCandidate(board, playerIndex, move)
  );
}

export function enumerateLegalMoves(
  board: BoardState,
  playerIndex: number,
  options: ActionRankingOptions = {}
): Move[] {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) {
    return [];
  }

  const moves: Move[] = [];
  enumerateCenterMoves(board, player).forEach((move) => moves.push(move));
  enumerateCardToSolitaireMoves(player).forEach((move) => moves.push(move));
  enumerateSolitaireToSolitaireMoves(player).forEach((move) =>
    moves.push(move)
  );

  if (options.includeCycle ?? true) {
    if (player.deck.length > 0 || player.flippedDeck.length > 0) {
      moves.push({ type: "cycle" });
    }
  }

  if (options.includeFlipDeck) {
    if (player.deck.length > 0 || player.flippedDeck.length > 0) {
      moves.push({ type: "flip_deck" });
    }
  }

  return moves;
}

export function getActionRankingMoveKey(move: Move): string {
  if (move.type === "c2c") {
    return [
      move.type,
      getCenterSourceKey(move.source),
      move.dest,
    ].join(":");
  }
  if (move.type === "c2s") {
    return [move.type, move.source, move.dest].join(":");
  }
  if (move.type === "s2s") {
    return [move.type, move.source, move.dest, move.count].join(":");
  }
  if (move.type === "move_field_stack") {
    return [
      move.type,
      move.index,
      move.position[0].toFixed(3),
      move.position[1].toFixed(3),
    ].join(":");
  }
  return move.type;
}

export function getPointDifferential(
  board: BoardState,
  playerIndex: number
): number {
  const activePlayers = board.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !player.isSpectating);
  const player = board.players[playerIndex];
  if (!player || activePlayers.length <= 1) {
    return 0;
  }

  const opponentTotal = activePlayers.reduce((sum, item) => {
    return item.index === playerIndex
      ? sum
      : sum + getCurrentPointsFromCards(item.player);
  }, 0);
  return (
    getCurrentPointsFromCards(player) -
    opponentTotal / (activePlayers.length - 1)
  );
}

export function getCurrentPointsFromCards(player: PlayerState): number {
  return (
    52 +
    player.pounceDeck.length * -3 +
    player.deck.length * -1 +
    player.flippedDeck.length * -1 +
    player.stacks.reduce((sum, stack) => sum + stack.length, 0) * -1
  );
}

function createActionRankingCandidate(
  board: BoardState,
  playerIndex: number,
  move: Move
): ActionRankingCandidate {
  const outcome = getMoveOutcome(board, playerIndex, move);
  return {
    key: getActionRankingMoveKey(move),
    move,
    features: buildActionRankingFeatures(
      board,
      playerIndex,
      move,
      outcome.immediatePointDelta,
      outcome.immediatePointDifferentialDelta
    ),
    immediatePointDelta: outcome.immediatePointDelta,
    immediatePointDifferentialDelta: outcome.immediatePointDifferentialDelta,
    endsRound: outcome.endsRound,
  };
}

function enumerateCenterMoves(board: BoardState, player: PlayerState): Move[] {
  const sources: MoveSource[] = [
    { type: "pounce", card: peek(player.pounceDeck) },
    { type: "deck", card: peek(player.flippedDeck) },
    ...player.stacks.map((stack, index) => ({
      type: "solitaire" as const,
      index,
      card: peek(stack),
    })),
  ];

  return sources.flatMap((source) => {
    const card = source.card;
    if (!card) {
      return [];
    }
    return board.piles.flatMap((pile, dest) => {
      if (!canPlayOnCenterPile(pile, card)) {
        return [];
      }
      return [
        {
          type: "c2c" as const,
          source: getCenterMoveSource(source),
          dest,
        },
      ];
    });
  });
}

function enumerateCardToSolitaireMoves(player: PlayerState): Move[] {
  const sources = [
    { type: "pounce" as const, card: peek(player.pounceDeck) },
    { type: "deck" as const, card: peek(player.flippedDeck) },
  ];

  return sources.flatMap((source) => {
    const card = source.card;
    if (!card) {
      return [];
    }

    return player.stacks.flatMap((_, dest) => {
      if (!canMoveCardToSolitaireStack(player, card, dest)) {
        return [];
      }
      return [{ type: "c2s" as const, source: source.type, dest }];
    });
  });
}

function enumerateSolitaireToSolitaireMoves(player: PlayerState): Move[] {
  return player.stacks.flatMap((sourceStack, source) => {
    return sourceStack.flatMap((card, cardIndex) => {
      const count = sourceStack.length - cardIndex;
      return player.stacks.flatMap((destStack, dest) => {
        if (source === dest || !canMoveToSolitairePile(card, destStack)) {
          return [];
        }
        return [{ type: "s2s" as const, source, dest, count }];
      });
    });
  });
}

function buildActionRankingFeatures(
  board: BoardState,
  playerIndex: number,
  move: Move,
  immediatePointDelta: number,
  immediatePointDifferentialDelta: number
): ActionRankingFeatureVector {
  const player = board.players[playerIndex];
  const card = getMoveCard(board, playerIndex, move);
  const dest = getMoveDestination(board, player, move);
  const centerFollow = getCenterFollowFeatures(board, playerIndex, move, card);

  return [
    1,
    bool(move.type === "c2c"),
    bool(move.type === "c2s"),
    bool(move.type === "s2s"),
    bool(move.type === "cycle"),
    bool(move.type === "flip_deck"),
    bool(isPounceSource(move)),
    bool(isDeckSource(move)),
    bool(isSolitaireSource(move)),
    bool(move.type === "c2c"),
    bool(move.type === "c2s" || move.type === "s2s"),
    normalizeCardValue(card),
    bool(card != null && RED_SUITS.includes(card.suit)),
    bool(card?.value === 1),
    bool(card != null && card.value >= 11),
    bool(dest?.isEmpty),
    normalizeCardValue(dest?.topCard),
    normalize(dest?.stackHeight, 13),
    normalize(dest?.centerHeight, 13),
    normalize(getMoveCardCount(move), 13),
    normalize(player?.pounceDeck.length, 13),
    normalize(player?.deck.length, 35),
    normalize(player?.flippedDeck.length, 35),
    normalize(player?.stacks.filter((stack) => stack.length === 0).length, 4),
    normalizeSigned(player ? getCurrentPointsFromCards(player) : undefined, 52),
    normalize(board.ticksSinceMove, 30),
    normalizeSigned(immediatePointDelta, 3),
    normalizeSigned(immediatePointDifferentialDelta, 3),
    bool(
      move.type !== "cycle" &&
        move.type !== "flip_deck" &&
        move.type !== "move_field_stack" &&
        isPounceSource(move) &&
        player?.pounceDeck.length === 1
    ),
    normalize(centerFollow.ownCanFollowAfter, 6),
    normalize(centerFollow.opponentsCanFollowAfter, 24),
    normalize(centerFollow.opponentsCanPlaySameNow, 24),
  ];
}

function getMoveOutcome(board: BoardState, playerIndex: number, move: Move) {
  const beforePlayer = board.players[playerIndex];
  const beforePoints = beforePlayer
    ? getCurrentPointsFromCards(beforePlayer)
    : 0;
  const beforePointDifferential = getPointDifferential(board, playerIndex);
  const nextBoard = deepClone(board);
  const result = executeMove(nextBoard, playerIndex, move);

  if (!result) {
    return {
      immediatePointDelta: 0,
      immediatePointDifferentialDelta: 0,
      endsRound: false,
    };
  }

  const afterPlayer = nextBoard.players[playerIndex];
  const afterPoints = afterPlayer
    ? getCurrentPointsFromCards(afterPlayer)
    : 0;
  const afterPointDifferential = getPointDifferential(nextBoard, playerIndex);
  return {
    immediatePointDelta: afterPoints - beforePoints,
    immediatePointDifferentialDelta:
      afterPointDifferential - beforePointDifferential,
    endsRound:
      nextBoard.players[playerIndex]?.pounceDeck.length === 0 &&
      board.players[playerIndex]?.pounceDeck.length !== 0,
  };
}

function getMoveDestination(
  board: BoardState,
  player: PlayerState | undefined,
  move: Move
):
  | {
      isEmpty: boolean;
      topCard: CardState | undefined;
      stackHeight: number;
      centerHeight: number;
    }
  | undefined {
  if (move.type === "c2c") {
    const pile = board.piles[move.dest];
    return {
      isEmpty: pile.length === 0,
      topCard: peek(pile),
      stackHeight: 0,
      centerHeight: pile.length,
    };
  }
  if ((move.type === "c2s" || move.type === "s2s") && player) {
    const stack = player.stacks[move.dest];
    return {
      isEmpty: stack.length === 0,
      topCard: peek(stack),
      stackHeight: stack.length,
      centerHeight: 0,
    };
  }
}

function getCenterFollowFeatures(
  board: BoardState,
  playerIndex: number,
  move: Move,
  card: CardState | undefined
) {
  if (move.type !== "c2c" || !card) {
    return {
      ownCanFollowAfter: 0,
      opponentsCanFollowAfter: 0,
      opponentsCanPlaySameNow: 0,
    };
  }

  const destinationPile = board.piles[move.dest] ?? [];
  const canPlaySameNow = (visibleCard: CardState) =>
    canPlayOnCenterPile(destinationPile, visibleCard) &&
    visibleCard.suit === card.suit &&
    visibleCard.value === card.value;

  const canFollowAfter = (visibleCard: CardState) =>
    visibleCard.suit === card.suit && visibleCard.value === card.value + 1;

  return getVisibleCards(board).reduce(
    (result, visibleCard) => {
      if (visibleCard.player === playerIndex) {
        if (!cardEquals(visibleCard, card) && canFollowAfter(visibleCard)) {
          result.ownCanFollowAfter += 1;
        }
        return result;
      }

      if (canFollowAfter(visibleCard)) {
        result.opponentsCanFollowAfter += 1;
      }
      if (canPlaySameNow(visibleCard)) {
        result.opponentsCanPlaySameNow += 1;
      }
      return result;
    },
    {
      ownCanFollowAfter: 0,
      opponentsCanFollowAfter: 0,
      opponentsCanPlaySameNow: 0,
    }
  );
}

function getVisibleCards(board: BoardState): CardState[] {
  return board.players
    .filter((player) => !player.isSpectating)
    .flatMap((player) => [
      peek(player.pounceDeck),
      peek(player.flippedDeck),
      ...player.stacks.map(peek),
    ])
    .filter((card): card is CardState => card != null);
}

function getMoveCard(
  board: BoardState,
  playerIndex: number,
  move: Move
): CardState | undefined {
  const player = board.players[playerIndex];
  if (!player) {
    return;
  }
  if (move.type === "c2c") {
    if (move.source.type === "pounce") {
      return peek(player.pounceDeck);
    }
    if (move.source.type === "deck") {
      return peek(player.flippedDeck);
    }
    return peek(player.stacks[move.source.index]);
  }
  if (move.type === "c2s") {
    return move.source === "pounce"
      ? peek(player.pounceDeck)
      : peek(player.flippedDeck);
  }
  if (move.type === "s2s") {
    const source = player.stacks[move.source];
    return source[source.length - move.count];
  }
}

function canMoveCardToSolitaireStack(
  player: PlayerState,
  card: CardState,
  dest: number
): boolean {
  const stack = player.stacks[dest];
  if (canMoveToSolitairePile(card, stack)) {
    return true;
  }

  const bottomCard = stack[0];
  return (
    bottomCard != null &&
    player.stacks.some((candidate) => candidate.length === 0) &&
    card.value === bottomCard.value + 1 &&
    couldMatch(card, bottomCard)
  );
}

function getCenterMoveSource(
  source: MoveSource
): Extract<Move, { type: "c2c" }>["source"] {
  if (source.type === "pounce") {
    return { type: "pounce" };
  }
  if (source.type === "deck") {
    return { type: "deck" };
  }
  return { type: "solitaire", index: source.index };
}

function getCenterSourceKey(
  source: Extract<Move, { type: "c2c" }>["source"]
) {
  if (source.type === "solitaire") {
    return `solitaire:${source.index}`;
  }
  return source.type;
}

function isPounceSource(move: Move): boolean {
  return (
    (move.type === "c2c" && move.source.type === "pounce") ||
    (move.type === "c2s" && move.source === "pounce")
  );
}

function isDeckSource(move: Move): boolean {
  return (
    (move.type === "c2c" && move.source.type === "deck") ||
    (move.type === "c2s" && move.source === "deck")
  );
}

function isSolitaireSource(move: Move): boolean {
  return (
    (move.type === "c2c" && move.source.type === "solitaire") ||
    move.type === "s2s"
  );
}

function getMoveCardCount(move: Move): number {
  return move.type === "s2s" ? move.count : move.type === "cycle" ? 3 : 1;
}

function normalizeCardValue(card: CardState | undefined): number {
  return normalize(card?.value, 13);
}

function normalize(value: number | undefined, scale: number): number {
  return value == null ? 0 : Math.max(0, Math.min(1, value / scale));
}

function normalizeSigned(value: number | undefined, scale: number): number {
  if (value == null) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value / scale));
}

function bool(value: boolean | undefined): number {
  return value ? 1 : 0;
}
