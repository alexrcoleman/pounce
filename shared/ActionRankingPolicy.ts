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
  "source.stackHeight",
  "source.bottomValue",
  "source.exposesCard",
  "source.exposedValue",
  "source.exposedCenterPlayable",
  "source.exposedCanPlaySoon",
  "source.exposedMatchesPounceParity",
  "source.exposedPounceConnectorCloseness",
  "source.exposedOwnSolitaireDestinationCount",
  "dest.center",
  "dest.solitaire",
  "card.value",
  "card.isRed",
  "card.stackParity",
  "card.matchesPounceParity",
  "card.pounceConnectorCloseness",
  "card.isAce",
  "card.isFace",
  "dest.isEmpty",
  "dest.topValue",
  "dest.bottomValue",
  "dest.stackHeight",
  "dest.centerHeight",
  "move.cardCount",
  "own.pounceCount",
  "own.deckCount",
  "own.flippedCount",
  "own.wasteCanPlaySoon",
  "own.wasteOwnSolitaireDestinationCount",
  "own.wasteOwnSolitaireConnectorForPounce",
  "own.wasteMatchesPounceParity",
  "own.wastePounceConnectorCloseness",
  "cycle.revealsCard",
  "cycle.revealedValue",
  "cycle.revealedCenterPlayable",
  "cycle.revealedCanPlaySoon",
  "cycle.revealedOwnSolitaireDestinationCount",
  "cycle.revealedOwnSolitaireConnectorForPounce",
  "cycle.revealedMatchesPounceParity",
  "cycle.revealedPounceConnectorCloseness",
  "cycle.resetsWaste",
  "cycle.stockFractionAfter",
  "cycle.cardsAdvanced",
  "own.emptyStackCount",
  "own.currentPoints",
  "own.pointDifferential",
  "board.ticksSinceMove",
  "move.immediatePointDelta",
  "move.immediatePointDifferentialDelta",
  "move.clearsPounce",
  "center.ownCanFollowAfter",
  "center.opponentsCanFollowAfter",
  "center.opponentsCanPlaySameNow",
  "center.opponentPounceCanFollowAfter",
  "center.opponentDeckCanFollowAfter",
  "center.opponentStackCanFollowAfter",
  "center.opponentPounceCanPlaySameNow",
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
  "solitaire.postTopConnectorCount",
  "solitaire.postTopConnectorCloseness",
  "solitaire.postTopConnectsPounce",
  "solitaire.postTopConnectsStackRoot",
  "solitaire.deckStockFraction",
  "cycle.resetRevealsCard",
  "cycle.resetRevealedValue",
  "cycle.resetRevealedCenterPlayable",
  "cycle.resetRevealedCanPlaySoon",
  "cycle.resetRevealedOwnSolitaireDestinationCount",
  "cycle.resetRevealedOwnSolitaireConnectorForPounce",
  "cycle.resetRevealedMatchesPounceParity",
  "cycle.resetRevealedPounceConnectorCloseness",
  "cycle.lookaheadCenterPlayableReach",
  "cycle.lookaheadCanPlaySoonReach",
  "cycle.lookaheadOwnSolitaireDestinationReach",
  "cycle.lookaheadOwnSolitaireConnectorForPounceReach",
  "cycle.lookaheadPounceConnectorReach",
  "own.stockLookaheadCenterPlayableReach",
  "own.stockLookaheadCanPlaySoonReach",
  "own.stockLookaheadOwnSolitaireDestinationReach",
  "own.stockLookaheadOwnSolitaireConnectorForPounceReach",
  "own.stockLookaheadPounceConnectorReach",
  "own.pounceCenterPlayable",
  "own.deckCenterPlayable",
  "own.stackCenterPlayableCount",
  "own.stackTopCanPlaySoonCount",
  "own.stackNextCenterPlayableCount",
  "own.stackNextCanPlaySoonCount",
  "own.stackNextPounceConnectorCloseness",
  "own.stackBottomPounceConnectorCloseness",
  "own.pounceCanPlaySoon",
  "opponent.pounceCenterPlayableCount",
  "opponent.deckCenterPlayableCount",
  "opponent.stackCenterPlayableCount",
  "opponent.pounceCanPlaySoonCount",
  "own.stockFraction",
  "own.wasteFraction",
  "own.pounceValue",
  "own.pounceStackParity",
  "opponent.minPounceCount",
  "opponent.maxPouncePressure",
  "center.ownPounceCanFollowAfter",
  "center.ownDeckCanFollowAfter",
  "center.ownStackCanFollowAfter",
  "center.opponentFollowPressureAfter",
  "center.opponentPounceFollowPressureAfter",
  "center.opponentSameNowPressure",
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
  const cardShape = getCardShapeFeatures(player, card);
  const sourceShape = getSourceShapeFeatures(board, player, move, card);
  const cycleShape = getCycleShapeFeatures(board, player, move);
  const centerFollow = getCenterFollowFeatures(board, playerIndex, move, card);
  const deckContext = getOwnDeckContextFeatures(board, player);
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
  const pressureFeatures = getVisiblePressureFeatures(board, playerIndex);
  const solitaireContext = getOwnSolitaireContextFeatures(board, player);
  const ownPounceCard = player ? peek(player.pounceDeck) : undefined;
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
    normalize(sourceShape.stackHeight, 13),
    normalizeCardValue(sourceShape.bottomCard),
    bool(sourceShape.exposedCard != null),
    normalizeCardValue(sourceShape.exposedCard),
    bool(sourceShape.exposedCenterPlayable),
    bool(sourceShape.exposedCanPlaySoon),
    bool(sourceShape.exposedMatchesPounceParity),
    normalize(sourceShape.exposedPounceConnectorCloseness, 1),
    normalize(sourceShape.exposedOwnSolitaireDestinationCount, 4),
    bool(move.type === "c2c"),
    bool(move.type === "c2s" || move.type === "s2s"),
    normalizeCardValue(card),
    bool(card != null && RED_SUITS.includes(card.suit)),
    bool(cardShape.stackParity),
    bool(cardShape.matchesPounceParity),
    normalize(cardShape.pounceConnectorCloseness, 1),
    bool(card?.value === 1),
    bool(card != null && card.value >= 11),
    bool(dest?.isEmpty),
    normalizeCardValue(dest?.topCard),
    normalizeCardValue(dest?.bottomCard),
    normalize(dest?.stackHeight, 13),
    normalize(dest?.centerHeight, 13),
    normalize(getMoveCardCount(move), 13),
    normalize(player?.pounceDeck.length, 13),
    normalize(player?.deck.length, 35),
    normalize(player?.flippedDeck.length, 35),
    bool(deckContext.wasteCanPlaySoon),
    normalize(deckContext.wasteOwnSolitaireDestinationCount, 4),
    bool(deckContext.wasteOwnSolitaireConnectorForPounce),
    bool(deckContext.wasteMatchesPounceParity),
    normalize(deckContext.wastePounceConnectorCloseness, 1),
    bool(cycleShape.revealedCard != null),
    normalizeCardValue(cycleShape.revealedCard),
    bool(cycleShape.revealedCenterPlayable),
    bool(cycleShape.revealedCanPlaySoon),
    normalize(cycleShape.revealedOwnSolitaireDestinationCount, 4),
    bool(cycleShape.revealedOwnSolitaireConnectorForPounce),
    bool(cycleShape.revealedMatchesPounceParity),
    normalize(cycleShape.revealedPounceConnectorCloseness, 1),
    bool(cycleShape.resetsWaste),
    normalize(cycleShape.stockFractionAfter, 1),
    normalize(cycleShape.cardsAdvanced, 3),
    normalize(player?.stacks.filter((stack) => stack.length === 0).length, 4),
    normalizeSigned(player ? getCurrentPointsFromCards(player) : undefined, 52),
    normalizeSigned(
      player ? getPointDifferential(board, playerIndex) : undefined,
      52
    ),
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
    normalize(centerFollow.opponentPounceCanFollowAfter, 6),
    normalize(centerFollow.opponentDeckCanFollowAfter, 6),
    normalize(centerFollow.opponentStackCanFollowAfter, 12),
    normalize(centerFollow.opponentPounceCanPlaySameNow, 6),
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
    normalize(strategyFeatures.postTopConnectorCount, 5),
    normalize(strategyFeatures.postTopConnectorCloseness, 1),
    bool(strategyFeatures.postTopConnectsPounce),
    bool(strategyFeatures.postTopConnectsStackRoot),
    normalize(strategyFeatures.deckStockFraction, 1),
    bool(cycleShape.resetRevealedCard != null),
    normalizeCardValue(cycleShape.resetRevealedCard),
    bool(cycleShape.resetRevealedCenterPlayable),
    bool(cycleShape.resetRevealedCanPlaySoon),
    normalize(cycleShape.resetRevealedOwnSolitaireDestinationCount, 4),
    bool(cycleShape.resetRevealedOwnSolitaireConnectorForPounce),
    bool(cycleShape.resetRevealedMatchesPounceParity),
    normalize(cycleShape.resetRevealedPounceConnectorCloseness, 1),
    normalize(cycleShape.lookaheadCenterPlayableReach, 1),
    normalize(cycleShape.lookaheadCanPlaySoonReach, 1),
    normalize(cycleShape.lookaheadOwnSolitaireDestinationReach, 1),
    normalize(cycleShape.lookaheadOwnSolitaireConnectorForPounceReach, 1),
    normalize(cycleShape.lookaheadPounceConnectorReach, 1),
    normalize(deckContext.stockLookaheadCenterPlayableReach, 1),
    normalize(deckContext.stockLookaheadCanPlaySoonReach, 1),
    normalize(deckContext.stockLookaheadOwnSolitaireDestinationReach, 1),
    normalize(deckContext.stockLookaheadOwnSolitaireConnectorForPounceReach, 1),
    normalize(deckContext.stockLookaheadPounceConnectorReach, 1),
    bool(pressureFeatures.ownPounceCenterPlayable),
    bool(pressureFeatures.ownDeckCenterPlayable),
    normalize(pressureFeatures.ownStackCenterPlayableCount, 4),
    normalize(solitaireContext.stackTopCanPlaySoonCount, 4),
    normalize(solitaireContext.stackNextCenterPlayableCount, 4),
    normalize(solitaireContext.stackNextCanPlaySoonCount, 4),
    normalize(solitaireContext.stackNextPounceConnectorCloseness, 1),
    normalize(solitaireContext.stackBottomPounceConnectorCloseness, 1),
    bool(pressureFeatures.ownPounceCanPlaySoon),
    normalize(pressureFeatures.opponentPounceCenterPlayableCount, 6),
    normalize(pressureFeatures.opponentDeckCenterPlayableCount, 6),
    normalize(pressureFeatures.opponentStackCenterPlayableCount, 24),
    normalize(pressureFeatures.opponentPounceCanPlaySoonCount, 6),
    normalize(deckContext.stockFraction, 1),
    normalize(deckContext.wasteFraction, 1),
    normalizeCardValue(ownPounceCard),
    bool(
      ownPounceCard != null &&
        getStackCompatibilityParity(ownPounceCard) === 1
    ),
    normalize(pressureFeatures.opponentMinPounceCount, 13),
    normalize(pressureFeatures.opponentMaxPouncePressure, 1),
    normalize(centerFollow.ownPounceCanFollowAfter, 1),
    normalize(centerFollow.ownDeckCanFollowAfter, 1),
    normalize(centerFollow.ownStackCanFollowAfter, 4),
    normalize(centerFollow.opponentFollowPressureAfter, 1),
    normalize(centerFollow.opponentPounceFollowPressureAfter, 1),
    normalize(centerFollow.opponentSameNowPressure, 1),
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

function getCardShapeFeatures(
  player: PlayerState | undefined,
  card: CardState | undefined
) {
  const pounceCard = player ? peek(player.pounceDeck) : undefined;
  return {
    stackParity: card ? getStackCompatibilityParity(card) === 1 : false,
    matchesPounceParity:
      card != null &&
      pounceCard != null &&
      getStackCompatibilityParity(card) ===
        getStackCompatibilityParity(pounceCard),
    pounceConnectorCloseness:
      card && pounceCard ? getConnectorCloseness(card, pounceCard) : 0,
  };
}

function getSourceShapeFeatures(
  board: BoardState,
  player: PlayerState | undefined,
  move: Move,
  card: CardState | undefined
) {
  const emptyFeatures = {
    stackHeight: 0,
    bottomCard: undefined as CardState | undefined,
    exposedCard: undefined as CardState | undefined,
    exposedCenterPlayable: false,
    exposedCanPlaySoon: false,
    exposedMatchesPounceParity: false,
    exposedPounceConnectorCloseness: 0,
    exposedOwnSolitaireDestinationCount: 0,
  };
  if (!player) {
    return emptyFeatures;
  }

  const sourceIndex = getSolitaireSourceIndex(move);
  if (sourceIndex == null) {
    return emptyFeatures;
  }

  const sourceStack = player.stacks[sourceIndex];
  const exposedCard = getExposedSourceCard(player, move);
  const pounceCard = peek(player.pounceDeck);
  const centerPiles = getCenterPilesAfterCenterMove(board, move, card);
  const exposedSolitaireDestinations = exposedCard
    ? getExposedSourceSolitaireDestinations(player, move, exposedCard)
    : [];
  return {
    stackHeight: sourceStack.length,
    bottomCard: sourceStack[0],
    exposedCard,
    exposedCenterPlayable:
      exposedCard != null &&
      centerPiles.some((pile) => canPlayOnCenterPile(pile, exposedCard)),
    exposedCanPlaySoon:
      exposedCard != null &&
      getCanPlaySoonOnCenterPiles(exposedCard, centerPiles, 4),
    exposedMatchesPounceParity:
      exposedCard != null &&
      pounceCard != null &&
      getStackCompatibilityParity(exposedCard) ===
        getStackCompatibilityParity(pounceCard),
    exposedPounceConnectorCloseness:
      exposedCard && pounceCard
        ? getConnectorCloseness(exposedCard, pounceCard)
        : 0,
    exposedOwnSolitaireDestinationCount: exposedSolitaireDestinations.length,
  };
}

function getCycleShapeFeatures(
  board: BoardState,
  player: PlayerState | undefined,
  move: Move
) {
  const emptyFeatures = {
    revealedCard: undefined as CardState | undefined,
    revealedCenterPlayable: false,
    revealedCanPlaySoon: false,
    revealedOwnSolitaireDestinationCount: 0,
    revealedOwnSolitaireConnectorForPounce: false,
    revealedMatchesPounceParity: false,
    revealedPounceConnectorCloseness: 0,
    resetsWaste: false,
    stockFractionAfter: 0,
    cardsAdvanced: 0,
    resetRevealedCard: undefined as CardState | undefined,
    resetRevealedCenterPlayable: false,
    resetRevealedCanPlaySoon: false,
    resetRevealedOwnSolitaireDestinationCount: 0,
    resetRevealedOwnSolitaireConnectorForPounce: false,
    resetRevealedMatchesPounceParity: false,
    resetRevealedPounceConnectorCloseness: 0,
    lookaheadCenterPlayableReach: 0,
    lookaheadCanPlaySoonReach: 0,
    lookaheadOwnSolitaireDestinationReach: 0,
    lookaheadOwnSolitaireConnectorForPounceReach: 0,
    lookaheadPounceConnectorReach: 0,
  };
  if (!player || move.type !== "cycle") {
    return emptyFeatures;
  }

  const total = player.deck.length + player.flippedDeck.length;
  if (total <= 0) {
    return emptyFeatures;
  }

  const lookaheadFeatures = getCycleLookaheadFeatures(board, player);

  if (player.deck.length === 0) {
    const resetDeck = player.flippedDeck.slice().reverse();
    const cardsAdvancedAfterReset = Math.min(3, resetDeck.length);
    const resetRevealedCard =
      cardsAdvancedAfterReset > 0
        ? peek(resetDeck.slice(-cardsAdvancedAfterReset).reverse())
        : undefined;
    const pounceCard = peek(player.pounceDeck);
    const resetSolitaireDestinations = resetRevealedCard
      ? player.stacks.flatMap((_, dest) =>
          canMoveCardToSolitaireStack(player, resetRevealedCard, dest)
            ? [dest]
            : []
        )
      : [];
    return {
      ...emptyFeatures,
      resetsWaste: player.flippedDeck.length > 0,
      stockFractionAfter: 1,
      resetRevealedCard,
      resetRevealedCenterPlayable:
        resetRevealedCard != null &&
        board.piles.some((pile) => canPlayOnCenterPile(pile, resetRevealedCard)),
      resetRevealedCanPlaySoon:
        resetRevealedCard != null && getCanPlaySoon(resetRevealedCard, board, 4),
      resetRevealedOwnSolitaireDestinationCount:
        resetSolitaireDestinations.length,
      resetRevealedOwnSolitaireConnectorForPounce:
        resetRevealedCard != null &&
        resetSolitaireDestinations.some((dest) =>
          getMakesPouncePlayable(
            player,
            { type: "c2s", source: "deck", dest },
            resetRevealedCard
          )
        ),
      resetRevealedMatchesPounceParity:
        resetRevealedCard != null &&
        pounceCard != null &&
        getStackCompatibilityParity(resetRevealedCard) ===
          getStackCompatibilityParity(pounceCard),
      resetRevealedPounceConnectorCloseness:
        resetRevealedCard && pounceCard
          ? getConnectorCloseness(resetRevealedCard, pounceCard)
          : 0,
      ...lookaheadFeatures,
    };
  }

  const cardsAdvanced = Math.min(3, player.deck.length);
  const revealedCard = peek(player.deck.slice(-cardsAdvanced).reverse());
  const pounceCard = peek(player.pounceDeck);
  const solitaireDestinations = revealedCard
    ? player.stacks.flatMap((_, dest) =>
        canMoveCardToSolitaireStack(player, revealedCard, dest) ? [dest] : []
      )
    : [];
  return {
    revealedCard,
    revealedCenterPlayable:
      revealedCard != null &&
      board.piles.some((pile) => canPlayOnCenterPile(pile, revealedCard)),
    revealedCanPlaySoon:
      revealedCard != null && getCanPlaySoon(revealedCard, board, 4),
    revealedOwnSolitaireDestinationCount: solitaireDestinations.length,
    revealedOwnSolitaireConnectorForPounce:
      revealedCard != null &&
      solitaireDestinations.some((dest) =>
        getMakesPouncePlayable(
          player,
          { type: "c2s", source: "deck", dest },
          revealedCard
        )
      ),
    revealedMatchesPounceParity:
      revealedCard != null &&
      pounceCard != null &&
      getStackCompatibilityParity(revealedCard) ===
        getStackCompatibilityParity(pounceCard),
    revealedPounceConnectorCloseness:
      revealedCard && pounceCard
        ? getConnectorCloseness(revealedCard, pounceCard)
        : 0,
    resetsWaste: false,
    stockFractionAfter: (player.deck.length - cardsAdvanced) / total,
    cardsAdvanced,
    resetRevealedCard: undefined,
    resetRevealedCenterPlayable: false,
    resetRevealedCanPlaySoon: false,
    resetRevealedOwnSolitaireDestinationCount: 0,
    resetRevealedOwnSolitaireConnectorForPounce: false,
    resetRevealedMatchesPounceParity: false,
    resetRevealedPounceConnectorCloseness: 0,
    ...lookaheadFeatures,
  };
}

const CYCLE_LOOKAHEAD_MAX_STEPS = 16;

function getCycleLookaheadFeatures(board: BoardState, player: PlayerState) {
  const features = {
    lookaheadCenterPlayableReach: 0,
    lookaheadCanPlaySoonReach: 0,
    lookaheadOwnSolitaireDestinationReach: 0,
    lookaheadOwnSolitaireConnectorForPounceReach: 0,
    lookaheadPounceConnectorReach: 0,
  };
  let deck = player.deck.slice();
  let flippedDeck = player.flippedDeck.slice();
  const pounceCard = peek(player.pounceDeck);

  for (
    let step = 0;
    step < CYCLE_LOOKAHEAD_MAX_STEPS &&
    (deck.length > 0 || flippedDeck.length > 0);
    step += 1
  ) {
    if (deck.length === 0) {
      deck = flippedDeck.slice().reverse();
      flippedDeck = [];
      continue;
    }

    const cardsAdvanced = Math.min(3, deck.length);
    const triple = deck.slice(-cardsAdvanced).reverse();
    deck.splice(deck.length - cardsAdvanced, cardsAdvanced);
    flippedDeck.push(...triple);

    const visibleCard = peek(flippedDeck);
    if (!visibleCard) {
      continue;
    }

    const reach = 1 / (step + 1);
    const solitaireDestinations = player.stacks.flatMap((_, dest) =>
      canMoveCardToSolitaireStack(player, visibleCard, dest) ? [dest] : []
    );

    if (board.piles.some((pile) => canPlayOnCenterPile(pile, visibleCard))) {
      features.lookaheadCenterPlayableReach = Math.max(
        features.lookaheadCenterPlayableReach,
        reach
      );
    }
    if (getCanPlaySoon(visibleCard, board, 4)) {
      features.lookaheadCanPlaySoonReach = Math.max(
        features.lookaheadCanPlaySoonReach,
        reach
      );
    }
    features.lookaheadOwnSolitaireDestinationReach = Math.max(
      features.lookaheadOwnSolitaireDestinationReach,
      reach * normalize(solitaireDestinations.length, 4)
    );
    if (
      solitaireDestinations.some((dest) =>
        getMakesPouncePlayable(
          player,
          { type: "c2s", source: "deck", dest },
          visibleCard
        )
      )
    ) {
      features.lookaheadOwnSolitaireConnectorForPounceReach = Math.max(
        features.lookaheadOwnSolitaireConnectorForPounceReach,
        reach
      );
    }
    if (pounceCard) {
      features.lookaheadPounceConnectorReach = Math.max(
        features.lookaheadPounceConnectorReach,
        reach * getConnectorCloseness(visibleCard, pounceCard)
      );
    }
  }

  return features;
}

function getOwnDeckContextFeatures(
  board: BoardState,
  player: PlayerState | undefined
) {
  const emptyFeatures = {
    wasteCanPlaySoon: false,
    wasteOwnSolitaireDestinationCount: 0,
    wasteOwnSolitaireConnectorForPounce: false,
    wasteMatchesPounceParity: false,
    wastePounceConnectorCloseness: 0,
    stockFraction: 0,
    wasteFraction: 0,
    stockLookaheadCenterPlayableReach: 0,
    stockLookaheadCanPlaySoonReach: 0,
    stockLookaheadOwnSolitaireDestinationReach: 0,
    stockLookaheadOwnSolitaireConnectorForPounceReach: 0,
    stockLookaheadPounceConnectorReach: 0,
  };
  if (!player) {
    return emptyFeatures;
  }

  const wasteCard = peek(player.flippedDeck);
  const pounceCard = peek(player.pounceDeck);
  const deckTotal = player.deck.length + player.flippedDeck.length;
  const wasteSolitaireDestinations = wasteCard
    ? player.stacks.flatMap((_, dest) =>
        canMoveCardToSolitaireStack(player, wasteCard, dest) ? [dest] : []
      )
    : [];
  const lookahead = getCycleLookaheadFeatures(board, player);

  return {
    wasteCanPlaySoon: wasteCard != null && getCanPlaySoon(wasteCard, board, 4),
    wasteOwnSolitaireDestinationCount: wasteSolitaireDestinations.length,
    wasteOwnSolitaireConnectorForPounce:
      wasteCard != null &&
      wasteSolitaireDestinations.some((dest) =>
        getMakesPouncePlayable(
          player,
          { type: "c2s", source: "deck", dest },
          wasteCard
        )
      ),
    wasteMatchesPounceParity:
      wasteCard != null &&
      pounceCard != null &&
      getStackCompatibilityParity(wasteCard) ===
        getStackCompatibilityParity(pounceCard),
    wastePounceConnectorCloseness:
      wasteCard && pounceCard ? getConnectorCloseness(wasteCard, pounceCard) : 0,
    stockFraction: deckTotal <= 0 ? 0 : player.deck.length / deckTotal,
    wasteFraction: deckTotal <= 0 ? 0 : player.flippedDeck.length / deckTotal,
    stockLookaheadCenterPlayableReach: lookahead.lookaheadCenterPlayableReach,
    stockLookaheadCanPlaySoonReach: lookahead.lookaheadCanPlaySoonReach,
    stockLookaheadOwnSolitaireDestinationReach:
      lookahead.lookaheadOwnSolitaireDestinationReach,
    stockLookaheadOwnSolitaireConnectorForPounceReach:
      lookahead.lookaheadOwnSolitaireConnectorForPounceReach,
    stockLookaheadPounceConnectorReach: lookahead.lookaheadPounceConnectorReach,
  };
}

function getVisiblePressureFeatures(board: BoardState, playerIndex: number) {
  return board.players.reduce(
    (result, player, index) => {
      if (player.isSpectating) {
        return result;
      }
      const isOwnPlayer = index === playerIndex;
      const pounceCard = peek(player.pounceDeck);
      const deckCard = peek(player.flippedDeck);
      const stackPlayableCount = player.stacks.filter((stack) => {
        const topCard = peek(stack);
        return (
          topCard != null &&
          board.piles.some((pile) => canPlayOnCenterPile(pile, topCard))
        );
      }).length;

      if (isOwnPlayer) {
        result.ownPounceCenterPlayable =
          pounceCard != null &&
          board.piles.some((pile) => canPlayOnCenterPile(pile, pounceCard));
        result.ownDeckCenterPlayable =
          deckCard != null &&
          board.piles.some((pile) => canPlayOnCenterPile(pile, deckCard));
        result.ownStackCenterPlayableCount = stackPlayableCount;
        result.ownPounceCanPlaySoon =
          pounceCard != null && getCanPlaySoon(pounceCard, board, 4);
        return result;
      }

      if (player.pounceDeck.length > 0) {
        result.opponentMinPounceCount =
          result.opponentMinPounceCount === 0
            ? player.pounceDeck.length
            : Math.min(result.opponentMinPounceCount, player.pounceDeck.length);
      }
      result.opponentMaxPouncePressure = Math.max(
        result.opponentMaxPouncePressure,
        getPouncePressure(player)
      );
      if (
        pounceCard != null &&
        board.piles.some((pile) => canPlayOnCenterPile(pile, pounceCard))
      ) {
        result.opponentPounceCenterPlayableCount += 1;
      }
      if (
        deckCard != null &&
        board.piles.some((pile) => canPlayOnCenterPile(pile, deckCard))
      ) {
        result.opponentDeckCenterPlayableCount += 1;
      }
      result.opponentStackCenterPlayableCount += stackPlayableCount;
      if (pounceCard != null && getCanPlaySoon(pounceCard, board, 4)) {
        result.opponentPounceCanPlaySoonCount += 1;
      }
      return result;
    },
    {
      ownPounceCenterPlayable: false,
      ownDeckCenterPlayable: false,
      ownStackCenterPlayableCount: 0,
      ownPounceCanPlaySoon: false,
      opponentPounceCenterPlayableCount: 0,
      opponentDeckCenterPlayableCount: 0,
      opponentStackCenterPlayableCount: 0,
      opponentPounceCanPlaySoonCount: 0,
      opponentMinPounceCount: 0,
      opponentMaxPouncePressure: 0,
    }
  );
}

function getOwnSolitaireContextFeatures(
  board: BoardState,
  player: PlayerState | undefined
) {
  const emptyFeatures = {
    stackTopCanPlaySoonCount: 0,
    stackNextCenterPlayableCount: 0,
    stackNextCanPlaySoonCount: 0,
    stackNextPounceConnectorCloseness: 0,
    stackBottomPounceConnectorCloseness: 0,
  };
  if (!player) {
    return emptyFeatures;
  }

  const pounceCard = peek(player.pounceDeck);
  return player.stacks.reduce((result, stack) => {
    const topCard = peek(stack);
    const nextCard = stack[stack.length - 2];
    const bottomCard = stack[0];

    if (topCard && getCanPlaySoon(topCard, board, 4)) {
      result.stackTopCanPlaySoonCount += 1;
    }
    if (
      nextCard &&
      board.piles.some((pile) => canPlayOnCenterPile(pile, nextCard))
    ) {
      result.stackNextCenterPlayableCount += 1;
    }
    if (nextCard && getCanPlaySoon(nextCard, board, 4)) {
      result.stackNextCanPlaySoonCount += 1;
    }
    if (pounceCard && nextCard) {
      result.stackNextPounceConnectorCloseness = Math.max(
        result.stackNextPounceConnectorCloseness,
        getConnectorCloseness(nextCard, pounceCard)
      );
    }
    if (pounceCard && bottomCard) {
      result.stackBottomPounceConnectorCloseness = Math.max(
        result.stackBottomPounceConnectorCloseness,
        getConnectorCloseness(bottomCard, pounceCard)
      );
    }
    return result;
  }, emptyFeatures);
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

function getExposedSourceSolitaireDestinations(
  player: PlayerState,
  move: Move,
  exposedCard: CardState
): number[] {
  const sourceStackIndex = getSolitaireSourceIndex(move);
  if (sourceStackIndex == null) {
    return [];
  }

  const stacks = getSolitaireStacksAfterSourceMove(player, move);
  return stacks.flatMap((stack, dest) =>
    dest !== sourceStackIndex && canMoveToSolitairePile(exposedCard, stack)
      ? [dest]
      : []
  );
}

function getSolitaireStacksAfterSourceMove(
  player: PlayerState,
  move: Move
): PlayerState["stacks"] {
  const stacks = player.stacks.map((stack) =>
    stack.slice()
  ) as PlayerState["stacks"];

  if (move.type === "c2c" && move.source.type === "solitaire") {
    stacks[move.source.index].pop();
  } else if (move.type === "s2s") {
    const source = stacks[move.source];
    const movingCards = source.splice(source.length - move.count, move.count);
    stacks[move.dest].push(...movingCards);
  }

  return stacks;
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
    postTopConnectorCount: 0,
    postTopConnectorCloseness: 0,
    postTopConnectsPounce: false,
    postTopConnectsStackRoot: false,
    deckStockFraction: 0,
  };
  if (!player || !card || (move.type !== "c2s" && move.type !== "s2s")) {
    return emptyFeatures;
  }

  const destStack = player.stacks[move.dest];
  const postTopConnector = getPostTopConnectorFeatures(player, move, card);
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
    ...postTopConnector,
    deckStockFraction:
      move.type === "c2s" && move.source === "deck"
        ? getDeckStockFraction(player)
        : 0,
  };
}

const POST_TOP_CONNECTOR_THRESHOLD = 5;

function getPostTopConnectorFeatures(
  player: PlayerState,
  move: Extract<Move, { type: "c2s" | "s2s" }>,
  card: CardState
) {
  const stacks = getSolitaireStacksAfterMove(player, move, card);
  const postTop = peek(stacks[move.dest]);
  const emptyFeatures = {
    postTopConnectorCount: 0,
    postTopConnectorCloseness: 0,
    postTopConnectsPounce: false,
    postTopConnectsStackRoot: false,
  };
  if (!postTop) {
    return emptyFeatures;
  }

  return getPostTopConnectorCandidates(player, move, stacks).reduce(
    (result, candidate) => {
      const gap = postTop.value - candidate.card.value;
      if (
        gap < 1 ||
        gap > POST_TOP_CONNECTOR_THRESHOLD ||
        !couldMatch(candidate.card, postTop)
      ) {
        return result;
      }

      result.postTopConnectorCount += 1;
      result.postTopConnectorCloseness = Math.max(
        result.postTopConnectorCloseness,
        (POST_TOP_CONNECTOR_THRESHOLD + 1 - gap) / POST_TOP_CONNECTOR_THRESHOLD
      );
      if (candidate.type === "pounce") {
        result.postTopConnectsPounce = true;
      } else {
        result.postTopConnectsStackRoot = true;
      }
      return result;
    },
    emptyFeatures
  );
}

function getPostTopConnectorCandidates(
  player: PlayerState,
  move: Extract<Move, { type: "c2s" | "s2s" }>,
  stacks: PlayerState["stacks"]
): { type: "pounce" | "stackRoot"; card: CardState }[] {
  const pounceCard =
    move.type === "c2s" && move.source === "pounce"
      ? undefined
      : peek(player.pounceDeck);
  return [
    ...(pounceCard ? [{ type: "pounce" as const, card: pounceCard }] : []),
    ...stacks
      .map((stack) => stack[0])
      .filter((candidate): candidate is CardState => candidate != null)
      .map((candidate) => ({ type: "stackRoot" as const, card: candidate })),
  ];
}

function getDeckStockFraction(player: PlayerState): number {
  const total = player.deck.length + player.flippedDeck.length;
  return total <= 0 ? 0 : player.deck.length / total;
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
      bottomCard: CardState | undefined;
      stackHeight: number;
      centerHeight: number;
    }
  | undefined {
  if (move.type === "c2c") {
    const pile = board.piles[move.dest];
    return {
      isEmpty: pile.length === 0,
      topCard: peek(pile),
      bottomCard: undefined,
      stackHeight: 0,
      centerHeight: pile.length,
    };
  }
  if ((move.type === "c2s" || move.type === "s2s") && player) {
    const stack = player.stacks[move.dest];
    return {
      isEmpty: stack.length === 0,
      topCard: peek(stack),
      bottomCard: stack[0],
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
      ownPounceCanFollowAfter: 0,
      ownDeckCanFollowAfter: 0,
      ownStackCanFollowAfter: 0,
      opponentsCanFollowAfter: 0,
      opponentsCanPlaySameNow: 0,
      opponentPounceCanFollowAfter: 0,
      opponentDeckCanFollowAfter: 0,
      opponentStackCanFollowAfter: 0,
      opponentPounceCanPlaySameNow: 0,
      opponentFollowPressureAfter: 0,
      opponentPounceFollowPressureAfter: 0,
      opponentSameNowPressure: 0,
    };
  }

  const destinationPile = board.piles[move.dest] ?? [];
  const canPlaySameNow = (visibleCard: CardState) =>
    canPlayOnCenterPile(destinationPile, visibleCard) &&
    visibleCard.suit === card.suit &&
    visibleCard.value === card.value;

  const canFollowAfter = (visibleCard: CardState) =>
    visibleCard.suit === card.suit && visibleCard.value === card.value + 1;

  return getVisibleCardSources(board).reduce(
    (result, visible) => {
      if (visible.player === playerIndex) {
        if (!cardEquals(visible.card, card) && canFollowAfter(visible.card)) {
          result.ownCanFollowAfter += 1;
          if (visible.location === "pounce") {
            result.ownPounceCanFollowAfter += 1;
          } else if (visible.location === "deck") {
            result.ownDeckCanFollowAfter += 1;
          } else {
            result.ownStackCanFollowAfter += 1;
          }
        }
        return result;
      }

      const visiblePlayer = board.players[visible.player];
      const opponentPouncePressure = getPouncePressure(visiblePlayer);
      if (canFollowAfter(visible.card)) {
        result.opponentsCanFollowAfter += 1;
        result.opponentFollowPressureAfter = Math.max(
          result.opponentFollowPressureAfter,
          opponentPouncePressure
        );
        if (visible.location === "pounce") {
          result.opponentPounceCanFollowAfter += 1;
          result.opponentPounceFollowPressureAfter = Math.max(
            result.opponentPounceFollowPressureAfter,
            opponentPouncePressure
          );
        } else if (visible.location === "deck") {
          result.opponentDeckCanFollowAfter += 1;
        } else {
          result.opponentStackCanFollowAfter += 1;
        }
      }
      if (canPlaySameNow(visible.card)) {
        result.opponentsCanPlaySameNow += 1;
        result.opponentSameNowPressure = Math.max(
          result.opponentSameNowPressure,
          opponentPouncePressure
        );
        if (visible.location === "pounce") {
          result.opponentPounceCanPlaySameNow += 1;
        }
      }
      return result;
    },
    {
      ownCanFollowAfter: 0,
      ownPounceCanFollowAfter: 0,
      ownDeckCanFollowAfter: 0,
      ownStackCanFollowAfter: 0,
      opponentsCanFollowAfter: 0,
      opponentsCanPlaySameNow: 0,
      opponentPounceCanFollowAfter: 0,
      opponentDeckCanFollowAfter: 0,
      opponentStackCanFollowAfter: 0,
      opponentPounceCanPlaySameNow: 0,
      opponentFollowPressureAfter: 0,
      opponentPounceFollowPressureAfter: 0,
      opponentSameNowPressure: 0,
    }
  );
}

function getCenterPilesAfterCenterMove(
  board: BoardState,
  move: Move,
  card: CardState | undefined
): BoardState["piles"] {
  if (move.type !== "c2c" || !card) {
    return board.piles;
  }

  return board.piles.map((pile, index) =>
    index === move.dest ? [...pile, card] : pile
  );
}

function getVisibleCardSources(board: BoardState): {
  card: CardState;
  player: number;
  location: "pounce" | "deck" | "solitaire";
}[] {
  return board.players
    .flatMap((player, playerIndex) => {
      if (player.isSpectating) {
        return [];
      }
      return [
        {
          card: peek(player.pounceDeck),
          player: playerIndex,
          location: "pounce" as const,
        },
        {
          card: peek(player.flippedDeck),
          player: playerIndex,
          location: "deck" as const,
        },
        ...player.stacks.map((stack) => ({
          card: peek(stack),
          player: playerIndex,
          location: "solitaire" as const,
        })),
      ];
    })
    .filter(
      (
        source
      ): source is {
        card: CardState;
        player: number;
        location: "pounce" | "deck" | "solitaire";
      } => source.card != null
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

function getExposedSourceCard(
  player: PlayerState,
  move: Move
): CardState | undefined {
  if (move.type === "c2c" && move.source.type === "solitaire") {
    const sourceStack = player.stacks[move.source.index];
    return sourceStack[sourceStack.length - 2];
  }
  if (move.type === "s2s") {
    const sourceStack = player.stacks[move.source];
    return sourceStack[sourceStack.length - move.count - 1];
  }
}

function getStackCompatibilityParity(card: CardState): 0 | 1 {
  const isBlack = !RED_SUITS.includes(card.suit);
  return ((card.value % 2) ^ (isBlack ? 1 : 0)) as 0 | 1;
}

function getConnectorCloseness(
  card: CardState,
  target: CardState,
  threshold = 5
): number {
  if (getStackCompatibilityParity(card) !== getStackCompatibilityParity(target)) {
    return 0;
  }

  const gap = Math.abs(card.value - target.value);
  if (gap < 1 || gap > threshold) {
    return 0;
  }
  return (threshold + 1 - gap) / threshold;
}

function getPouncePressure(player: PlayerState | undefined): number {
  const pounceCount = player?.pounceDeck.length ?? 0;
  if (pounceCount <= 0) {
    return 0;
  }

  return 1 - normalize(pounceCount - 1, 12);
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

  const stacks = getSolitaireStacksAfterMove(player, move, card);
  const hasEmptyStack = stacks.some((stack) => stack.length === 0);
  return stacks.some((stack) =>
    canMoveCardToSolitaireStackShape(pounceCard, stack, hasEmptyStack)
  );
}

function getSolitaireStacksAfterMove(
  player: PlayerState,
  move: Extract<Move, { type: "c2s" | "s2s" }>,
  card: CardState
): PlayerState["stacks"] {
  const stacks = player.stacks.map((stack) =>
    stack.slice()
  ) as PlayerState["stacks"];
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

  return stacks;
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
  return getCanPlaySoonOnCenterPiles(target, sourceBoard.piles, threshold);
}

function getCanPlaySoonOnCenterPiles(
  target: CardState,
  piles: BoardState["piles"],
  threshold: number
): boolean {
  if (target.value <= 2) {
    return true;
  }
  return piles.some((pile) => {
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
