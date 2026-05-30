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
  "player.index",
  "player.botIndex",
  "board.playerCount",
  "card.canPlaySoon",
  "card.centerPlayableDestinationCount",
  "card.ownSolitaireDestinationCount",
  "card.ownSolitaireConnectorForPounce",
  "center.ownCanFollowSoonAfter",
  "center.opponentsCanFollowSoonAfter",
  "solitaire.isTuck",
  "solitaire.deckMoveHelpful",
  "solitaire.destTopCanPlaySoon",
  "solitaire.makesPouncePlayable",
  "solitaire.exposesCenterPlayable",
  "solitaire.exposesCanPlaySoon",
  "solitaire.movesFullStack",
] as const;

export type ActionRankingFeatureName =
  (typeof ACTION_RANKING_FEATURE_NAMES)[number];

export type ActionRankingFeatureVector = number[];

export type ActionRankingCandidate = {
  key: string;
  equivalenceKey: string;
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

export function getActionRankingMoveEquivalenceKey(
  board: BoardState,
  move: Move
): string {
  if (move.type !== "c2c") {
    return getActionRankingMoveKey(move);
  }

  const pile = board.piles[move.dest];
  const topCard = peek(pile);
  return [
    move.type,
    getCenterSourceKey(move.source),
    topCard ? `${topCard.suit}:${topCard.value}` : "empty",
  ].join(":");
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
    equivalenceKey: getActionRankingMoveEquivalenceKey(board, move),
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
  const cardAlternatives = getCardAlternativeFeatures(
    board,
    player,
    move,
    card
  );
  const strategyFeatures = getStrategyFeatures(
    board,
    playerIndex,
    move,
    card
  );
  const botIndex = player
    ? board.players
        .filter((candidate) => candidate.socketId == null)
        .indexOf(player)
    : -1;

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
    normalize(playerIndex, Math.max(1, board.players.length - 1)),
    normalize(botIndex, Math.max(1, board.players.length - 1)),
    normalize(board.players.length, 6),
    bool(card != null && getCanPlaySoon(card, board, 4)),
    normalize(
      cardAlternatives.centerPlayableDestinationCount,
      Math.max(1, board.piles.length)
    ),
    normalize(cardAlternatives.ownSolitaireDestinationCount, 4),
    bool(cardAlternatives.ownSolitaireConnectorForPounce),
    normalize(strategyFeatures.ownCanFollowSoonAfter, 6),
    normalize(strategyFeatures.opponentsCanFollowSoonAfter, 24),
    bool(strategyFeatures.solitaireTuck),
    bool(strategyFeatures.deckMoveHelpful),
    bool(strategyFeatures.destTopCanPlaySoon),
    bool(strategyFeatures.makesPouncePlayable),
    bool(strategyFeatures.exposesCenterPlayable),
    bool(strategyFeatures.exposesCanPlaySoon),
    bool(strategyFeatures.movesFullStack),
  ];
}

function getCardAlternativeFeatures(
  board: BoardState,
  player: PlayerState | undefined,
  move: Move,
  card: CardState | undefined
) {
  if (!player || !card) {
    return {
      centerPlayableDestinationCount: 0,
      ownSolitaireDestinationCount: 0,
      ownSolitaireConnectorForPounce: false,
    };
  }

  const solitaireDestinations = getOwnSolitaireDestinations(player, move, card);
  const cardToSolitaireSource = getCardToSolitaireSource(move);

  return {
    centerPlayableDestinationCount: board.piles.filter((pile) =>
      canPlayOnCenterPile(pile, card)
    ).length,
    ownSolitaireDestinationCount: solitaireDestinations.length,
    ownSolitaireConnectorForPounce:
      cardToSolitaireSource != null &&
      solitaireDestinations.some((dest) =>
        getMakesPouncePlayable(
          player,
          { type: "c2s", source: cardToSolitaireSource, dest },
          card
        )
      ),
  };
}

function getOwnSolitaireDestinations(
  player: PlayerState,
  move: Move,
  card: CardState
): number[] {
  const sourceStackIndex = getSolitaireSourceIndex(move);
  if (getCardToSolitaireSource(move) != null) {
    return player.stacks.flatMap((_, dest) =>
      canMoveCardToSolitaireStack(player, card, dest) ? [dest] : []
    );
  }

  if (sourceStackIndex == null) {
    return [];
  }

  return player.stacks.flatMap((stack, dest) =>
    dest !== sourceStackIndex && canMoveToSolitairePile(card, stack) ? [dest] : []
  );
}

function getCardToSolitaireSource(
  move: Move
): Extract<Move, { type: "c2s" }>["source"] | undefined {
  if (move.type === "c2s") {
    return move.source;
  }
  if (move.type === "c2c" && move.source.type !== "solitaire") {
    return move.source.type;
  }
}

function getSolitaireSourceIndex(move: Move): number | undefined {
  if (move.type === "s2s") {
    return move.source;
  }
  if (move.type === "c2c" && move.source.type === "solitaire") {
    return move.source.index;
  }
}

function getStrategyFeatures(
  board: BoardState,
  playerIndex: number,
  move: Move,
  card: CardState | undefined
) {
  const player = board.players[playerIndex];
  const centerSoon = getCenterSoonFeatures(board, playerIndex, move, card);
  const solitaire = getSolitaireStrategyFeatures(board, player, move, card);
  return {
    ...centerSoon,
    ...solitaire,
  };
}

function getCenterSoonFeatures(
  board: BoardState,
  playerIndex: number,
  move: Move,
  card: CardState | undefined
) {
  if (move.type !== "c2c" || !card) {
    return {
      ownCanFollowSoonAfter: 0,
      opponentsCanFollowSoonAfter: 0,
    };
  }

  return getVisibleCards(board).reduce(
    (result, visibleCard) => {
      if (cardEquals(visibleCard, card)) {
        return result;
      }
      if (!canPlayOnSoon(card, visibleCard, 3)) {
        return result;
      }
      if (visibleCard.player === playerIndex) {
        result.ownCanFollowSoonAfter += 1;
      } else {
        result.opponentsCanFollowSoonAfter += 1;
      }
      return result;
    },
    {
      ownCanFollowSoonAfter: 0,
      opponentsCanFollowSoonAfter: 0,
    }
  );
}

function getSolitaireStrategyFeatures(
  board: BoardState,
  player: PlayerState | undefined,
  move: Move,
  card: CardState | undefined
) {
  const emptyFeatures = {
    solitaireTuck: false,
    deckMoveHelpful: false,
    destTopCanPlaySoon: false,
    makesPouncePlayable: false,
    exposesCenterPlayable: false,
    exposesCanPlaySoon: false,
    movesFullStack: false,
  };
  if (!player || !card || (move.type !== "c2s" && move.type !== "s2s")) {
    return emptyFeatures;
  }

  const destStack = player.stacks[move.dest];
  const exposedCard =
    move.type === "s2s"
      ? player.stacks[move.source][
          player.stacks[move.source].length - move.count - 1
        ]
      : undefined;

  return {
    solitaireTuck: move.type === "c2s" && isTuckMove(player, card, move.dest),
    deckMoveHelpful:
      move.type === "c2s" &&
      move.source === "deck" &&
      getIsSolitaireMoveHelpful(player, destStack),
    destTopCanPlaySoon:
      peek(destStack) != null && getCanPlaySoon(peek(destStack)!, board, 4),
    makesPouncePlayable: getMakesPouncePlayable(player, move, card),
    exposesCenterPlayable:
      exposedCard != null &&
      board.piles.some((pile) => canPlayOnCenterPile(pile, exposedCard)),
    exposesCanPlaySoon:
      exposedCard != null && getCanPlaySoon(exposedCard, board, 4),
    movesFullStack:
      move.type === "s2s" &&
      move.count === player.stacks[move.source].length,
  };
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

function getMakesPouncePlayable(
  player: PlayerState,
  move: Extract<Move, { type: "c2s" | "s2s" }>,
  card: CardState
): boolean {
  const pounceCard = peek(player.pounceDeck);
  if (!pounceCard || (move.type === "c2s" && move.source === "pounce")) {
    return false;
  }

  const stacks = player.stacks.map((stack) => stack.slice()) as PlayerState["stacks"];
  if (move.type === "c2s") {
    if (isTuckMove(player, card, move.dest)) {
      stacks[move.dest].unshift(card);
    } else {
      stacks[move.dest].push(card);
    }
  } else {
    const source = stacks[move.source];
    const movingCards = source.splice(source.length - move.count, move.count);
    stacks[move.dest].push(...movingCards);
  }

  const hasEmptyStack = stacks.some((stack) => stack.length === 0);
  return stacks.some((stack) =>
    canMoveCardToSolitaireStackShape(pounceCard, stack, hasEmptyStack)
  );
}

function canMoveCardToSolitaireStackShape(
  card: CardState,
  stack: CardState[],
  hasEmptyStack: boolean
): boolean {
  if (canMoveToSolitairePile(card, stack)) {
    return true;
  }

  const bottomCard = stack[0];
  return (
    bottomCard != null &&
    hasEmptyStack &&
    card.value === bottomCard.value + 1 &&
    couldMatch(card, bottomCard)
  );
}

function isTuckMove(
  player: PlayerState,
  card: CardState,
  dest: number
): boolean {
  const stack = player.stacks[dest];
  const bottomCard = stack[0];
  return (
    bottomCard != null &&
    player.stacks.some((candidate) => candidate.length === 0) &&
    card.value === bottomCard.value + 1 &&
    couldMatch(card, bottomCard) &&
    !canMoveToSolitairePile(card, stack)
  );
}

function getIsSolitaireMoveHelpful(
  player: PlayerState,
  stack: CardState[]
): boolean {
  if (stack.length === 0) {
    return false;
  }

  const pounceCard = peek(player.pounceDeck);
  const candidates = player.stacks.map((candidate) => candidate[0]).filter(Boolean);
  if (pounceCard) {
    candidates.push(pounceCard);
  }

  const stackLowest = stack[stack.length - 1];
  return candidates.some(
    (candidate) =>
      candidate.value < stackLowest.value &&
      candidate.value >= stackLowest.value - 5 &&
      couldMatch(candidate, stackLowest)
  );
}

function getCanPlaySoon(
  target: CardState,
  sourceBoard: BoardState,
  threshold: number
): boolean {
  if (target.value <= 2) {
    return true;
  }
  return sourceBoard.piles.some((pile) => {
    const topCard = peek(pile);
    return topCard != null && canPlayOnSoon(topCard, target, threshold);
  });
}

function canPlayOnSoon(
  target: CardState,
  source: CardState,
  threshold: number
): boolean {
  return (
    source.suit === target.suit &&
    source.value >= target.value &&
    source.value - threshold <= target.value
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
