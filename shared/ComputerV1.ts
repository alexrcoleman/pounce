import type {
  BoardState,
  CardState,
  CursorState,
  PlayerState,
} from "./GameUtils";
import {
  canMoveToSolitairePile,
  canPlayOnCenterPile,
  couldMatch,
  peek,
} from "./CardUtils";

import {
  getApproximateCardLocation,
  getApproximatePileLocation,
  getApproximatePlayerLocation,
  getDistance,
  type Move,
} from "./MoveHandler";

type StrategySettings = {
  solitaireFromDeck?: boolean;
  solitaireFromDeckOnlyIfHelp?: boolean;
  solitaireFromDeckOnlyIfHelpV2?: boolean;
  ensureMoveSoon?: boolean;
  solitaireSwapUnblocker?: boolean;
  deckToCenterOnlyIfHelp?: boolean;
  disableCycling?: boolean;
  solitaireHelpThreshold?: number;
};

class AIStrategy {
  private sortedPiles: (readonly [CardState[], number])[] = [];
  constructor(
    private settings: StrategySettings,
    private boardState: BoardState,
    private player: PlayerState,
    private cursor: CursorState
  ) {
    this.sortedPiles = boardState.piles
      .map((pile, index) => [pile, index] as const)
      .sort((a, b) => {
        // Get a rough idea of the closest target before we grab something, but update once we have grabbed something
        const c = cursor.location
          ? getApproximateCardLocation(boardState, cursor.location)
          : getApproximatePlayerLocation(
              boardState,
              boardState.players.indexOf(player)
            );
        const p1 = getApproximatePileLocation(boardState, a[1]);
        const p2 = getApproximatePileLocation(boardState, b[1]);
        return getDistance(p1, c) - getDistance(p2, c);
      });
  }

  private getPounceToCenterMove(
    boardState: BoardState,
    player: PlayerState
  ): Move | undefined {
    const pounceToCenterIndex = this.getCentralPileForCardIndex(
      peek(player.pounceDeck)
    );
    if (pounceToCenterIndex >= 0) {
      return {
        type: "c2c",
        source: { type: "pounce" },
        dest: pounceToCenterIndex,
      };
    }
  }

  private getCanPlaySoon(card: CardState, board: BoardState) {
    if (card.value <= 2) {
      return true;
    }
    return board.piles.some((pile) => {
      const topCard = peek(pile);
      return topCard != null && canPlayOnSoon(topCard, card, 4);
    });
  }
  private getPounceToSolitaireMove(
    player: PlayerState,
    boardState: BoardState
  ): Move | undefined {
    // const shouldLeaveEmptyOpen =
    //   player.stacks.filter((stack) => stack.length === 0).length === 1 &&
    //   this.settings.leaveHoleOpen;
    // TODO: Try tucking:

    const pounceCard = peek(player.pounceDeck);
    if (!pounceCard) {
      return;
    }
    const pounceToTuckIndex = !player.stacks.some((s) => s.length === 0)
      ? -1
      : player.stacks.findIndex(
          (stack) =>
            stack.length > 0 &&
            pounceCard.value === stack[0].value + 1 &&
            couldMatch(pounceCard, stack[0])
        );
    if (pounceToTuckIndex >= 0) {
      return { type: "c2s", source: "pounce", dest: pounceToTuckIndex };
    }

    const pounceToSolitaireIndex = player.stacks.findIndex((stack) => {
      if (!canMoveToSolitairePile(pounceCard, stack)) {
        return false;
      }

      if (this.getShouldUnblock()) {
        console.log("We should unblock...");
        return true;
      }
      if (this.settings.ensureMoveSoon) {
        return (
          stack.length === 0 ||
          stack.length >= 3 ||
          !this.getCanPlaySoon(stack[stack.length - 1], boardState)
        );
      }
      return true;
    });
    if (pounceToSolitaireIndex >= 0) {
      return { type: "c2s", source: "pounce", dest: pounceToSolitaireIndex };
    }
  }

  private getSolitaireToSolitaireMove(
    player: PlayerState,
    boardState: BoardState
  ): Move | undefined {
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

    // Partial stack move to unblock a card that plays
    // TODO: Ideally look for one that unblocks a single card that plays, but maybe this is fine too
    if (this.settings.solitaireSwapUnblocker ?? true) {
      const solitairePlayUnblocker = player.stacks
        .map<Move | null>((stack, fromIndex) => {
          for (let i = 1; i < stack.length; i++) {
            const toIndex = player.stacks.findIndex((stack2) =>
              canMoveToSolitairePile(stack[i], stack2)
            );
            if (
              toIndex >= 0 &&
              this.getCentralPileForCardIndex(stack[i - 1]) != -1
            ) {
              return {
                type: "s2s",
                dest: toIndex,
                source: fromIndex,
                count: stack.length - i,
              };
            }
          }
          return null;
        })
        .find((x) => x != null);
      if (solitairePlayUnblocker != null) {
        return solitairePlayUnblocker;
      }
      const solitairePlayUnblockerPrep = player.stacks
        .map<Move | null>((stack, fromIndex) => {
          for (let i = 1; i < stack.length; i++) {
            const toIndex = player.stacks.findIndex((stack2) =>
              canMoveToSolitairePile(stack[i], stack2)
            );
            if (
              toIndex >= 0 &&
              player.stacks[toIndex].length > 0 &&
              this.getCanPlaySoon(stack[i - 1], boardState) &&
              !this.getCanPlaySoon(peek(player.stacks[toIndex])!, boardState)
            ) {
              return {
                type: "s2s",
                dest: toIndex,
                source: fromIndex,
                count: stack.length - i,
              };
            }
          }
          return null;
        })
        .find((x) => x != null);
      if (solitairePlayUnblockerPrep != null) {
        return solitairePlayUnblockerPrep;
      }
    }
  }

  private getShouldUnblock() {
    return this.boardState.ticksSinceMove >= 30;
  }

  private getDeckToSolitaireMove(
    player: PlayerState,
    boardState: BoardState
  ): Move | undefined {
    const solitaireFromDeck = this.settings.solitaireFromDeck ?? true;
    const solitaireFromDeckOnlyIfHelp =
      this.settings.solitaireFromDeckOnlyIfHelp ?? true;
    const solitaireFromDeckOnlyIfHelpV2 =
      this.settings.solitaireFromDeckOnlyIfHelpV2 ?? false;
    if (!solitaireFromDeck) {
      return;
    }
    // Play solitaire moves from deck too
    const deckCard = peek(player.flippedDeck);
    const toIndex = player.stacks.findIndex((stack) => {
      if (!canMoveToSolitairePile(deckCard, stack)) {
        return false;
      }
      if (this.getShouldUnblock()) {
        console.log("We should unblock...");
        return true;
      }
      if (this.settings.ensureMoveSoon) {
        if (
          stack.length > 0 &&
          stack.length < 3 &&
          this.getCanPlaySoon(stack[stack.length - 1], boardState)
        ) {
          return false;
        }
      }
      if (
        solitaireFromDeckOnlyIfHelp &&
        !this.getIsSolitaireMoveHelpful(player, stack)
      ) {
        if (solitaireFromDeckOnlyIfHelpV2) {
          const requiredThreshold = this.settings.solitaireHelpThreshold ?? 0.5;
          if (
            player.deck.length >=
            requiredThreshold * (player.flippedDeck.length + player.deck.length)
          ) {
            // At least half of our deck is left, so we can play to shuffle the rest next rotation
            return true;
          }
          if (deckCard && deckCard.value >= 10) {
            // High card better to cover generally
            return true;
          }
        }
        return false;
      }
      return true;
    });
    if (toIndex >= 0) {
      return { type: "c2s", source: "deck", dest: toIndex };
    }
  }
  private getIsSolitaireMoveHelpful(player: PlayerState, stack: CardState[]) {
    if (stack.length === 0) {
      // Not helpful to play solitaire to empty stack generally
      return false;
    }
    const pounceCard = peek(player.pounceDeck);
    const cands = player.stacks.map((stack) => stack[0]).filter(Boolean);
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
  }

  private getSolitaireToCenterMove(
    boardState: BoardState,
    player: PlayerState
  ): Move | undefined {
    const playableSolitaire = player.stacks
      .map((stack, index) => ({
        source: index,
        dest: this.getCentralPileForCardIndex(peek(stack)),
      }))
      .find((item) => item.dest >= 0);
    if (playableSolitaire != null) {
      return {
        type: "c2c",
        source: { type: "solitaire", index: playableSolitaire.source },
        dest: playableSolitaire.dest,
      };
    }
  }

  private getDeckToCenterMove(
    boardState: BoardState,
    player: PlayerState
  ): Move | undefined {
    const card = peek(player.flippedDeck);
    const deckCenterIndex = this.getCentralPileForCardIndex(card);

    if (deckCenterIndex < 0) {
      return;
    }

    if (this.getShouldUnblock()) {
      console.log("We should unblock...");
    } else {
      if (this.settings.deckToCenterOnlyIfHelp && card) {
        const playableCards = [
          ...player.stacks.map((s) => peek(s)!),
          peek(player.pounceDeck)!,
        ].filter(Boolean);
        if (!playableCards.some((c) => canPlayOnSoon(card, c, 3))) {
          return;
        }
      }
    }
    return { type: "c2c", source: { type: "deck" }, dest: deckCenterIndex };
  }

  public getMove(): Move | undefined {
    const player = this.player;
    const boardState = this.boardState;

    const moves: (Move | undefined)[] = [
      this.getPounceToCenterMove(boardState, player),
      this.getPounceToSolitaireMove(player, boardState),
      this.getSolitaireToCenterMove(boardState, player),
      this.getDeckToCenterMove(boardState, player),
      this.getSolitaireToSolitaireMove(player, boardState),
      this.getDeckToSolitaireMove(player, boardState),
      this.settings.disableCycling ? undefined : { type: "cycle" },
    ];

    return moves.filter(Boolean)[0];
  }

  private getCentralPileForCardIndex(card: CardState | undefined) {
    if (card == null) {
      return -1;
    }
    return (
      this.sortedPiles.find(([pile]) => canPlayOnCenterPile(pile, card))?.[1] ??
      -1
    );
  }
}

function canPlayOnSoon(
  target: CardState,
  source: CardState,
  threshold: number
) {
  return (
    source.suit === target.suit &&
    source.value >= target.value &&
    source.value - threshold <= target.value
  );
}

// Round 8 Totals: X, 19,118,88
// Round 35: 243,326,321
const playerStyles: { name: string; strategy: StrategySettings }[] = [
  {
    name: "Mom",
    strategy: {
      solitaireFromDeckOnlyIfHelp: false,
    },
  },
  {
    name: "Alex-v2",
    strategy: {
      solitaireFromDeckOnlyIfHelp: true,
      solitaireFromDeckOnlyIfHelpV2: true,
    },
  },
  {
    name: "Alex 75%",
    strategy: {
      solitaireFromDeckOnlyIfHelp: true,
      solitaireFromDeckOnlyIfHelpV2: true,
      solitaireHelpThreshold: 0.75,
    },
  },
  {
    name: "Alex 66%",
    strategy: {
      solitaireFromDeckOnlyIfHelp: true,
      solitaireFromDeckOnlyIfHelpV2: true,
      solitaireHelpThreshold: 0.66,
    },
  },
  {
    name: "Alex 1.0",
    strategy: {
      solitaireFromDeck: true,
      solitaireFromDeckOnlyIfHelp: true,
      ensureMoveSoon: true,
    },
  },
  // Somewhat proven worse:
  // {
  //   name: "Safe-Solitaire",
  //   strategy: {
  //     solitaireFromDeckOnlyIfHelp: false,
  //     ensureMoveSoon: true,
  //   },
  // },
];
export function getBasicAIMove(
  boardState: BoardState,
  playerIndex: number,
  cursor: CursorState
): Move | undefined {
  const player = boardState.players[playerIndex];
  const botIndex = boardState.players
    .filter((p) => p.socketId == null)
    .indexOf(player);
  const playerStyle = playerStyles[botIndex % playerStyles.length];
  const ai = new AIStrategy(playerStyle.strategy, boardState, player, cursor);
  return ai.getMove();
}
