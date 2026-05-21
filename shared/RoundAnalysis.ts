import {
  canMoveToSolitairePile,
  canPlayOnCenterPile,
  peek,
} from "./CardUtils";
import type { BoardState, CardState } from "./GameUtils";
import type { Move } from "./MoveHandler";

export type RoundSnapshotReason =
  | "round_start"
  | "move"
  | "manual_rotate"
  | "auto_rotate"
  | "round_end";

export type RoundSnapshot = {
  time: number;
  reason: RoundSnapshotReason;
  board: BoardState;
  playerIndex?: number;
  move?: Move;
};

export type RoundAnalysis = {
  version: 1;
  roundStartedAt: number;
  roundEndedAt: number;
  durationMs: number;
  pouncerIndex: number | null;
  moveLog: RoundAnalysisMoveEvent[];
  playerReports: PlayerRoundAnalysis[];
};

export type PlayerRoundAnalysis = {
  playerIndex: number;
  playerName: string;
  playerColor: string;
  score: number;
  pounceCardsLeft: number;
  summary: {
    missedCenterPlays: number;
    missedPounceHelpers: number;
    cycledPastPlayableCards: number;
    beatenToCenter: number;
    solitaireMoves: number;
    cardsPlayedToCenter: number;
    deckCycles: number;
    deckCyclesPerSecond: number;
    centerPlayRate: number | null;
    solitairePlayRate: number | null;
    delayedPlays: number;
    totalMissedMs: number;
    longestMissMs: number;
  };
  highlights: RoundAnalysisHighlight[];
  moves: RoundAnalysisMoveEvent[];
};

export type RoundAnalysisHighlight = {
  id: string;
  kind:
    | "missed_center_play"
    | "cycled_past_playable"
    | "beaten_to_center"
    | "round_end_available"
    | "missed_pounce_solitaire"
    | "missed_pounce_connector"
    | "missed_pounce_slot"
    | "delayed_center_play"
    | "delayed_pounce_helper"
    | "buried_center_shuffle"
    | "delayed_buried_center_shuffle";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  card: CardState;
  cardLabel: string;
  sourceLabel: string;
  pointValue: number;
  board: BoardState;
  openedByAction?: RoundAnalysisActionContext;
  closedByAction?: RoundAnalysisActionContext;
  closedReason?: string;
  windowActions: RoundAnalysisActionContext[];
  durationMs: number;
  firstSeenOffsetMs: number;
  lastSeenOffsetMs: number;
  sortScore: number;
  playerIndex: number;
};

export type RoundAnalysisActionContext = {
  offsetMs: number;
  playerIndex?: number;
  playerName: string;
  description: string;
};

export type RoundAnalysisMoveEvent = RoundAnalysisActionContext & {
  id: string;
  moveType: Move["type"] | "manual_rotate" | "auto_rotate";
};

type CenterPlaySource =
  | { type: "pounce" }
  | { type: "deck" }
  | { type: "solitaire"; index: number };

type AvailableCenterPlay = {
  id: string;
  playerIndex: number;
  source: CenterPlaySource;
  card: CardState;
  destPileIndex: number;
};

type OpenCenterPlayWindow = AvailableCenterPlay & {
  firstSeen: number;
  lastSeen: number;
  firstSeenBoard: BoardState;
  openedByAction?: RoundAnalysisActionContext;
  windowActions: RoundAnalysisActionContext[];
  seenCount: number;
};

type SolitaireSource =
  | { type: "pounce" }
  | { type: "deck" }
  | { type: "solitaire"; index: number; count: number };

type PounceHelperBenefit =
  | "play_pounce_to_solitaire"
  | "connect_pounce_card"
  | "free_slot_for_pounce";

type AvailablePounceHelper = {
  id: string;
  playerIndex: number;
  source: SolitaireSource;
  card: CardState;
  destStackIndex: number;
  destTopCard?: CardState;
  pounceCard: CardState;
  benefit: PounceHelperBenefit;
};

type OpenPounceHelperWindow = AvailablePounceHelper & {
  firstSeen: number;
  lastSeen: number;
  firstSeenBoard: BoardState;
  openedByAction?: RoundAnalysisActionContext;
  windowActions: RoundAnalysisActionContext[];
  seenCount: number;
};

type AvailableBuriedCenterShuffle = {
  id: string;
  playerIndex: number;
  card: CardState;
  sourceStackIndex: number;
  destStackIndex: number;
  movingRootCard: CardState;
  moveCount: number;
  destTopCard?: CardState;
  destPileIndex: number;
  pounceSlotCard?: CardState;
};

type OpenBuriedCenterShuffleWindow = AvailableBuriedCenterShuffle & {
  firstSeen: number;
  lastSeen: number;
  firstSeenBoard: BoardState;
  openedByAction?: RoundAnalysisActionContext;
  windowActions: RoundAnalysisActionContext[];
  seenCount: number;
};

const MIN_MISSED_WINDOW_MS = 750;
const MIN_SOLITAIRE_HELPER_WINDOW_MS = 3000;
const MIN_DELAYED_PLAY_WINDOW_MS = 5000;
const MAX_WINDOW_ACTIONS = 3;
const MAX_HIGHLIGHTS_PER_PLAYER = 5;

export function analyzeRoundSnapshots(
  snapshots: RoundSnapshot[]
): RoundAnalysis | null {
  if (snapshots.length === 0) {
    return null;
  }

  const orderedSnapshots = snapshots
    .slice()
    .sort((a, b) => a.time - b.time);
  const firstSnapshot = orderedSnapshots[0];
  const finalSnapshot = orderedSnapshots[orderedSnapshots.length - 1];
  const finalBoard = finalSnapshot.board;
  const playerCount = finalBoard.players.length;
  const moveStatsByPlayer = collectMoveStats(orderedSnapshots, playerCount);
  const moveLog = collectMoveLog(orderedSnapshots, firstSnapshot.time);
  const openWindows = Array.from({ length: playerCount }, () => new Map<
    string,
    OpenCenterPlayWindow
  >());
  const openPounceHelperWindows = Array.from(
    { length: playerCount },
    () => new Map<string, OpenPounceHelperWindow>()
  );
  const openBuriedCenterShuffleWindows = Array.from(
    { length: playerCount },
    () => new Map<string, OpenBuriedCenterShuffleWindow>()
  );
  const opportunityStatsByPlayer = Array.from({ length: playerCount }, () => ({
    centerMissed: 0,
    centerPlayed: 0,
    solitaireMissed: 0,
    solitairePlayed: 0,
    delayedPlays: 0,
  }));
  const highlightsByPlayer = Array.from({ length: playerCount }, () => [] as RoundAnalysisHighlight[]);

  orderedSnapshots.forEach((snapshot, snapshotIndex) => {
    const actionContext = getSnapshotActionContext(
      snapshot,
      firstSnapshot.time,
      orderedSnapshots[snapshotIndex - 1]
    );

    snapshot.board.players.forEach((player, playerIndex) => {
      if (player.isSpectating) {
        return;
      }

      const currentPlays = enumerateAvailableCenterPlays(
        snapshot.board,
        playerIndex
      );
      const currentPlayIds = new Set(currentPlays.map((play) => play.id));
      const playerOpenWindows = openWindows[playerIndex];

      Array.from(playerOpenWindows.values()).forEach((openWindow) => {
        if (currentPlayIds.has(openWindow.id)) {
          return;
        }

        playerOpenWindows.delete(openWindow.id);
        addWindowAction(openWindow, snapshot, actionContext);
        const wasOwnPlay = isOwnCenterPlay(openWindow, snapshot);
        const highlight = createHighlightForClosedWindow(
          openWindow,
          snapshot,
          firstSnapshot.time,
          { closedByAction: actionContext }
        );
        if (wasOwnPlay) {
          opportunityStatsByPlayer[playerIndex].centerPlayed += 1;
        } else if (highlight) {
          opportunityStatsByPlayer[playerIndex].centerMissed += 1;
        }
        if (highlight) {
          highlightsByPlayer[playerIndex].push(highlight);
          if (isDelayedHighlight(highlight)) {
            opportunityStatsByPlayer[playerIndex].delayedPlays += 1;
          }
        }
      });

      currentPlays.forEach((play) => {
        const openWindow = playerOpenWindows.get(play.id);
        if (openWindow) {
          addWindowAction(openWindow, snapshot, actionContext);
          openWindow.lastSeen = snapshot.time;
          openWindow.seenCount += 1;
          openWindow.destPileIndex = play.destPileIndex;
          return;
        }

        playerOpenWindows.set(play.id, {
          ...play,
          firstSeen: snapshot.time,
          lastSeen: snapshot.time,
          firstSeenBoard: snapshot.board,
          openedByAction: actionContext,
          windowActions: [],
          seenCount: 1,
        });
      });

      const currentPounceHelpers = enumerateAvailablePounceHelpers(
        snapshot.board,
        playerIndex
      );
      const currentPounceHelperIds = new Set(
        currentPounceHelpers.map((play) => play.id)
      );
      const playerOpenPounceHelperWindows =
        openPounceHelperWindows[playerIndex];

      Array.from(playerOpenPounceHelperWindows.values()).forEach(
        (openWindow) => {
          if (currentPounceHelperIds.has(openWindow.id)) {
            return;
          }

          playerOpenPounceHelperWindows.delete(openWindow.id);
          addWindowAction(openWindow, snapshot, actionContext);
          const wasOwnPlay = isOwnPounceHelperPlay(openWindow, snapshot);
          const wasBetterPlay = isOwnBetterPounceHelperPlay(
            openWindow,
            snapshot
          );
          const highlight = createPounceHelperHighlight(
            openWindow,
            snapshot,
            firstSnapshot.time,
            actionContext
          );
          if (wasOwnPlay) {
            opportunityStatsByPlayer[playerIndex].solitairePlayed += 1;
          } else if (!wasBetterPlay && highlight) {
            opportunityStatsByPlayer[playerIndex].solitaireMissed += 1;
          }
          if (highlight) {
            highlightsByPlayer[playerIndex].push(highlight);
            if (isDelayedHighlight(highlight)) {
              opportunityStatsByPlayer[playerIndex].delayedPlays += 1;
            }
          }
        }
      );

      currentPounceHelpers.forEach((play) => {
        const openWindow = playerOpenPounceHelperWindows.get(play.id);
        if (openWindow) {
          addWindowAction(openWindow, snapshot, actionContext);
          openWindow.lastSeen = snapshot.time;
          openWindow.seenCount += 1;
          return;
        }

        playerOpenPounceHelperWindows.set(play.id, {
          ...play,
          firstSeen: snapshot.time,
          lastSeen: snapshot.time,
          firstSeenBoard: snapshot.board,
          openedByAction: actionContext,
          windowActions: [],
          seenCount: 1,
        });
      });

      const currentBuriedCenterShuffles =
        enumerateAvailableBuriedCenterShuffles(snapshot.board, playerIndex);
      const currentBuriedCenterShuffleIds = new Set(
        currentBuriedCenterShuffles.map((play) => play.id)
      );
      const playerOpenBuriedCenterShuffleWindows =
        openBuriedCenterShuffleWindows[playerIndex];

      Array.from(playerOpenBuriedCenterShuffleWindows.values()).forEach(
        (openWindow) => {
          if (currentBuriedCenterShuffleIds.has(openWindow.id)) {
            return;
          }

          playerOpenBuriedCenterShuffleWindows.delete(openWindow.id);
          addWindowAction(openWindow, snapshot, actionContext);
          const wasOwnSetup = isOwnBuriedCenterShuffleSetup(
            openWindow,
            snapshot
          );
          const highlight = createBuriedCenterShuffleHighlight(
            openWindow,
            snapshot,
            firstSnapshot.time,
            actionContext
          );
          if (!wasOwnSetup && highlight) {
            opportunityStatsByPlayer[playerIndex].centerMissed += 1;
          }
          if (highlight) {
            highlightsByPlayer[playerIndex].push(highlight);
            if (isDelayedHighlight(highlight)) {
              opportunityStatsByPlayer[playerIndex].delayedPlays += 1;
            }
          }
        }
      );

      currentBuriedCenterShuffles.forEach((play) => {
        const openWindow = playerOpenBuriedCenterShuffleWindows.get(play.id);
        if (openWindow) {
          addWindowAction(openWindow, snapshot, actionContext);
          openWindow.lastSeen = snapshot.time;
          openWindow.seenCount += 1;
          return;
        }

        playerOpenBuriedCenterShuffleWindows.set(play.id, {
          ...play,
          firstSeen: snapshot.time,
          lastSeen: snapshot.time,
          firstSeenBoard: snapshot.board,
          openedByAction: actionContext,
          windowActions: [],
          seenCount: 1,
        });
      });
    });
  });

  openWindows.forEach((playerOpenWindows, playerIndex) => {
    Array.from(playerOpenWindows.values()).forEach((openWindow) => {
      const highlight = createHighlightForClosedWindow(
        openWindow,
        finalSnapshot,
        firstSnapshot.time,
        { forcedKind: "round_end_available" }
      );
      if (highlight) {
        opportunityStatsByPlayer[playerIndex].centerMissed += 1;
        highlightsByPlayer[playerIndex].push(highlight);
      }
    });
  });

  openPounceHelperWindows.forEach((playerOpenWindows, playerIndex) => {
    Array.from(playerOpenWindows.values()).forEach((openWindow) => {
      const highlight = createPounceHelperHighlight(
        openWindow,
        finalSnapshot,
        firstSnapshot.time
      );
      if (highlight) {
        opportunityStatsByPlayer[playerIndex].solitaireMissed += 1;
        highlightsByPlayer[playerIndex].push(highlight);
      }
    });
  });

  openBuriedCenterShuffleWindows.forEach((playerOpenWindows, playerIndex) => {
    Array.from(playerOpenWindows.values()).forEach((openWindow) => {
      const highlight = createBuriedCenterShuffleHighlight(
        openWindow,
        finalSnapshot,
        firstSnapshot.time
      );
      if (highlight) {
        opportunityStatsByPlayer[playerIndex].centerMissed += 1;
        highlightsByPlayer[playerIndex].push(highlight);
      }
    });
  });

  const pouncerIndex = finalBoard.players.findIndex(
    (player) => !player.isSpectating && player.pounceDeck.length === 0
  );

  return {
    version: 1,
    roundStartedAt: firstSnapshot.time,
    roundEndedAt: finalSnapshot.time,
    durationMs: Math.max(0, finalSnapshot.time - firstSnapshot.time),
    pouncerIndex: pouncerIndex >= 0 ? pouncerIndex : null,
    moveLog,
    playerReports: finalBoard.players.map((player, playerIndex) => {
      const highlights = highlightsByPlayer[playerIndex]
        .sort((a, b) => b.sortScore - a.sortScore)
        .slice(0, MAX_HIGHLIGHTS_PER_PLAYER);
      const allHighlights = highlightsByPlayer[playerIndex];
      const missedHighlights = allHighlights.filter(
        (highlight) => !isDelayedHighlight(highlight)
      );
      const missedCenterHighlights = missedHighlights.filter(
        isMissedCenterHighlight
      );
      const missedPounceHelperHighlights =
        missedHighlights.filter(isMissedPounceHelperHighlight);
      const moveStats = moveStatsByPlayer[playerIndex];
      const opportunityStats = opportunityStatsByPlayer[playerIndex];

      return {
        playerIndex,
        playerName: player.name,
        playerColor: player.color,
        score: player.currentPoints,
        pounceCardsLeft: player.pounceDeck.length,
        summary: {
          missedCenterPlays: missedCenterHighlights.length,
          missedPounceHelpers: missedPounceHelperHighlights.length,
          cycledPastPlayableCards: highlightsByPlayer[playerIndex].filter(
            (highlight) => highlight.kind === "cycled_past_playable"
          ).length,
          beatenToCenter: highlightsByPlayer[playerIndex].filter(
            (highlight) => highlight.kind === "beaten_to_center"
          ).length,
          solitaireMoves: moveStats.solitaireMoves,
          cardsPlayedToCenter: moveStats.cardsPlayedToCenter,
          deckCycles: moveStats.deckCycles,
          deckCyclesPerSecond: getRatePerSecond(
            moveStats.deckCycles,
            Math.max(0, finalSnapshot.time - firstSnapshot.time)
          ),
          centerPlayRate: getPlayRate(
            opportunityStats.centerPlayed,
            opportunityStats.centerMissed
          ),
          solitairePlayRate: getPlayRate(
            opportunityStats.solitairePlayed,
            opportunityStats.solitaireMissed
          ),
          delayedPlays: opportunityStats.delayedPlays,
          totalMissedMs: missedHighlights.reduce(
            (sum, highlight) => sum + highlight.durationMs,
            0
          ),
          longestMissMs: missedHighlights.reduce(
            (longest, highlight) => Math.max(longest, highlight.durationMs),
            0
          ),
        },
        highlights,
        moves: moveLog.filter((move) => move.playerIndex === playerIndex),
      };
    }),
  };
}

function collectMoveLog(
  snapshots: RoundSnapshot[],
  roundStartedAt: number
): RoundAnalysisMoveEvent[] {
  return snapshots.flatMap((snapshot, index) => {
    const actionContext = getSnapshotActionContext(
      snapshot,
      roundStartedAt,
      snapshots[index - 1]
    );
    const moveType = getSnapshotMoveType(snapshot);
    if (!actionContext || !moveType) {
      return [];
    }

    return [
      {
        ...actionContext,
        id: `move:${index}:${actionContext.playerIndex ?? "table"}:${
          actionContext.offsetMs
        }`,
        moveType,
      },
    ];
  });
}

function getSnapshotMoveType(
  snapshot: RoundSnapshot
): RoundAnalysisMoveEvent["moveType"] | undefined {
  if (snapshot.reason === "manual_rotate") {
    return "manual_rotate";
  }
  if (snapshot.reason === "auto_rotate") {
    return "auto_rotate";
  }
  return snapshot.move?.type;
}

function collectMoveStats(
  snapshots: RoundSnapshot[],
  playerCount: number
): {
  solitaireMoves: number;
  cardsPlayedToCenter: number;
  deckCycles: number;
}[] {
  const stats = Array.from({ length: playerCount }, () => ({
    solitaireMoves: 0,
    cardsPlayedToCenter: 0,
    deckCycles: 0,
    centerCardKeys: new Set<string>(),
  }));

  snapshots.forEach((snapshot, index) => {
    const move = snapshot.move;
    const playerIndex = snapshot.playerIndex;
    const previousSnapshot = snapshots[index - 1];
    if (!move || playerIndex == null || !stats[playerIndex]) {
      return;
    }

    if (move.type === "c2c") {
      const movedCard = getMovedCenterCard(snapshot, previousSnapshot);
      if (movedCard && movedCard.player === playerIndex) {
        stats[playerIndex].centerCardKeys.add(cardKey(movedCard));
        stats[playerIndex].cardsPlayedToCenter =
          stats[playerIndex].centerCardKeys.size;
      }
    } else if (move.type === "c2s" || move.type === "s2s") {
      const movedCards = getMovedSolitaireCards(
        snapshot,
        previousSnapshot,
        playerIndex,
        move.dest
      );
      if (movedCards.length > 0) {
        stats[playerIndex].solitaireMoves += 1;
      }
    } else if (move.type === "cycle") {
      if (didPlayerDeckChange(snapshot, previousSnapshot, playerIndex)) {
        stats[playerIndex].deckCycles += getDeckCycles(
          previousSnapshot?.board,
          playerIndex
        );
      }
    }
  });

  return stats.map(({ centerCardKeys, ...stat }) => stat);
}

function getDeckCycles(
  previousBoard: BoardState | undefined,
  playerIndex: number
): number {
  const previousPlayer = previousBoard?.players[playerIndex];
  if (!previousPlayer || previousPlayer.deck.length === 0) {
    return 0;
  }

  return 1;
}

function getRatePerSecond(count: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }

  return count / (durationMs / 1000);
}

function getPlayRate(played: number, missed: number): number | null {
  const total = played + missed;
  if (total === 0) {
    return null;
  }

  return played / total;
}

function addWindowAction(
  openWindow: {
    firstSeen: number;
    playerIndex: number;
    windowActions: RoundAnalysisActionContext[];
  },
  snapshot: RoundSnapshot,
  actionContext: RoundAnalysisActionContext | undefined
): void {
  if (
    !actionContext ||
    snapshot.time <= openWindow.firstSeen ||
    actionContext.playerIndex !== openWindow.playerIndex ||
    openWindow.windowActions.length >= MAX_WINDOW_ACTIONS
  ) {
    return;
  }

  openWindow.windowActions.push(actionContext);
}

function getSnapshotActionContext(
  snapshot: RoundSnapshot,
  roundStartedAt: number,
  previousSnapshot?: RoundSnapshot
): RoundAnalysisActionContext | undefined {
  const offsetMs = Math.max(0, snapshot.time - roundStartedAt);

  if (snapshot.reason === "manual_rotate") {
    return {
      offsetMs,
      playerName: "Table",
      description: "rotated all decks",
    };
  }

  if (snapshot.reason === "auto_rotate") {
    return {
      offsetMs,
      playerName: "Table",
      description: "auto-rotated all decks",
    };
  }

  const playerIndex = snapshot.playerIndex;
  const move = snapshot.move;
  if (snapshot.reason !== "move" || playerIndex == null || !move) {
    return undefined;
  }

  const playerName =
    snapshot.board.players[playerIndex]?.name ?? `Player ${playerIndex + 1}`;
  const description = getMoveDescription(
    snapshot,
    previousSnapshot,
    playerIndex,
    move
  );
  if (!description) {
    return undefined;
  }

  return {
    offsetMs,
    playerIndex,
    playerName,
    description,
  };
}

function getMoveDescription(
  snapshot: RoundSnapshot,
  previousSnapshot: RoundSnapshot | undefined,
  playerIndex: number,
  move: Move
): string | undefined {
  if (move.type === "cycle") {
    if (!didPlayerDeckChange(snapshot, previousSnapshot, playerIndex)) {
      return undefined;
    }
    return "cycled the deck";
  }
  if (move.type === "flip_deck") {
    if (!didPlayerDeckChange(snapshot, previousSnapshot, playerIndex)) {
      return undefined;
    }
    return "flipped the deck";
  }
  if (move.type === "move_field_stack") {
    return "moved a center pile";
  }
  if (move.type === "c2c") {
    const movedCard = getMovedCenterCard(snapshot, previousSnapshot);
    if (!movedCard) {
      return undefined;
    }
    return movedCard
      ? `played ${formatCard(movedCard)} to center`
      : "played a card to center";
  }
  if (move.type === "c2s") {
    const movedCard = getMovedSolitaireCards(
      snapshot,
      previousSnapshot,
      playerIndex,
      move.dest
    )[0];
    if (!movedCard) {
      return undefined;
    }
    const sourceLabel = move.source === "pounce" ? "pounce" : "waste";
    return `moved ${formatCard(movedCard)} from ${sourceLabel} to S${
      move.dest + 1
    }`;
  }

  const movedCards = getMovedSolitaireCards(
    snapshot,
    previousSnapshot,
    playerIndex,
    move.dest
  );
  if (movedCards.length === 0) {
    return undefined;
  }
  const cardLabel =
    movedCards.length === 1 ? formatCard(movedCards[0]) : `${move.count} cards`;
  return `moved ${cardLabel} from S${move.source + 1} to S${move.dest + 1}`;
}

function getMovedSolitaireCards(
  snapshot: RoundSnapshot,
  previousSnapshot: RoundSnapshot | undefined,
  playerIndex: number,
  destStackIndex: number
): CardState[] {
  const currentStack =
    snapshot.board.players[playerIndex]?.stacks[destStackIndex] ?? [];
  if (!previousSnapshot) {
    return currentStack.length > 0 ? [currentStack[currentStack.length - 1]] : [];
  }

  return getAddedCards(
    previousSnapshot.board.players[playerIndex]?.stacks[destStackIndex] ?? [],
    currentStack
  );
}

function getAddedCards(
  previousCards: CardState[],
  currentCards: CardState[]
): CardState[] {
  const previousCounts = new Map<string, number>();
  previousCards.forEach((card) => {
    const key = cardKey(card);
    previousCounts.set(key, (previousCounts.get(key) ?? 0) + 1);
  });

  return currentCards.filter((card) => {
    const key = cardKey(card);
    const previousCount = previousCounts.get(key) ?? 0;
    if (previousCount > 0) {
      previousCounts.set(key, previousCount - 1);
      return false;
    }
    return true;
  });
}

function getAddedCardsAcrossPiles(
  previousPiles: CardState[][],
  currentPiles: CardState[][]
): CardState[] {
  const previousCards = previousPiles.flat();
  const currentCards = currentPiles.flat();
  return getAddedCards(previousCards, currentCards);
}

function didPlayerDeckChange(
  snapshot: RoundSnapshot,
  previousSnapshot: RoundSnapshot | undefined,
  playerIndex: number
): boolean {
  if (!previousSnapshot) {
    return true;
  }

  const previousPlayer = previousSnapshot.board.players[playerIndex];
  const currentPlayer = snapshot.board.players[playerIndex];
  if (!previousPlayer || !currentPlayer) {
    return false;
  }

  return (
    previousPlayer.deck.length !== currentPlayer.deck.length ||
    previousPlayer.flippedDeck.length !== currentPlayer.flippedDeck.length ||
    optionalCardKey(peek(previousPlayer.deck)) !==
      optionalCardKey(peek(currentPlayer.deck)) ||
    optionalCardKey(peek(previousPlayer.flippedDeck)) !==
      optionalCardKey(peek(currentPlayer.flippedDeck))
  );
}

function optionalCardKey(card: CardState | undefined): string | undefined {
  if (!card) {
    return undefined;
  }
  return cardKey(card);
}

export function enumerateAvailableCenterPlays(
  board: BoardState,
  playerIndex: number
): AvailableCenterPlay[] {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) {
    return [];
  }

  const sources: { source: CenterPlaySource; card?: CardState }[] = [
    { source: { type: "pounce" }, card: peek(player.pounceDeck) },
    { source: { type: "deck" }, card: peek(player.flippedDeck) },
    ...player.stacks.map((stack, index) => ({
      source: { type: "solitaire" as const, index },
      card: peek(stack),
    })),
  ];

  return sources.flatMap(({ source, card }) => {
    if (!card) {
      return [];
    }

    const destPileIndex = board.piles.findIndex((pile) =>
      canPlayOnCenterPile(pile, card)
    );
    if (destPileIndex < 0) {
      return [];
    }

    return [
      {
        id: `${playerIndex}:${sourceKey(source)}:${cardKey(card)}`,
        playerIndex,
        source,
        card,
        destPileIndex,
      },
    ];
  });
}

export function enumerateAvailablePounceHelpers(
  board: BoardState,
  playerIndex: number
): AvailablePounceHelper[] {
  const player = board.players[playerIndex];
  const pounceCard = peek(player?.pounceDeck ?? []);
  if (!player || player.isSpectating || !pounceCard) {
    return [];
  }

  const helpers: AvailablePounceHelper[] = [];

  player.stacks.forEach((destStack, destStackIndex) => {
    if (canMoveToSolitairePile(pounceCard, destStack)) {
      helpers.push({
        id: `${playerIndex}:pounce-solitaire:${destStackIndex}:${cardKey(
          pounceCard
        )}`,
        playerIndex,
        source: { type: "pounce" },
        card: pounceCard,
        destStackIndex,
        destTopCard: peek(destStack),
        pounceCard,
        benefit: "play_pounce_to_solitaire",
      });
    }
  });

  const deckCard = peek(player.flippedDeck);
  if (deckCard) {
    player.stacks.forEach((destStack, destStackIndex) => {
      addPounceConnectorIfUseful(
        helpers,
        playerIndex,
        { type: "deck" },
        deckCard,
        destStack,
        destStackIndex,
        pounceCard
      );
    });
  }

  player.stacks.forEach((sourceStack, sourceStackIndex) => {
    const sourceCard = peek(sourceStack);
    if (!sourceCard) {
      return;
    }

    if (
      !player.stacks.some((stack) => stack.length === 0) &&
      sourceStack.length > 0
    ) {
      const movingRootCard = sourceStack[0];
      player.stacks.forEach((destStack, destStackIndex) => {
        if (
          sourceStackIndex === destStackIndex ||
          !canMoveToSolitairePile(movingRootCard, destStack)
        ) {
          return;
        }

        helpers.push({
          id: `${playerIndex}:free-slot:${sourceStackIndex}:${destStackIndex}:${cardKey(
            movingRootCard
          )}:${cardKey(pounceCard)}`,
          playerIndex,
          source: {
            type: "solitaire",
            index: sourceStackIndex,
            count: sourceStack.length,
          },
          card: movingRootCard,
          destStackIndex,
          destTopCard: peek(destStack),
          pounceCard,
          benefit: "free_slot_for_pounce",
        });
      });
    }
  });

  return helpers;
}

export function enumerateAvailableBuriedCenterShuffles(
  board: BoardState,
  playerIndex: number
): AvailableBuriedCenterShuffle[] {
  const player = board.players[playerIndex];
  if (!player || player.isSpectating) {
    return [];
  }

  const playsById = new Map<string, AvailableBuriedCenterShuffle>();

  player.stacks.forEach((sourceStack, sourceStackIndex) => {
    if (sourceStack.length < 2) {
      return;
    }

    sourceStack.forEach((card, cardIndex) => {
      if (cardIndex >= sourceStack.length - 1) {
        return;
      }

      const destPileIndex = board.piles.findIndex((pile) =>
        canPlayOnCenterPile(pile, card)
      );
      if (destPileIndex < 0) {
        return;
      }

      const movingRootCard = sourceStack[cardIndex + 1];
      const moveCount = sourceStack.length - cardIndex - 1;

      player.stacks.forEach((destStack, destStackIndex) => {
        if (
          sourceStackIndex === destStackIndex ||
          !canMoveToSolitairePile(movingRootCard, destStack)
        ) {
          return;
        }

        const play: AvailableBuriedCenterShuffle = {
          id: `${playerIndex}:buried-center:${sourceStackIndex}:${cardKey(
            card
          )}`,
          playerIndex,
          card,
          sourceStackIndex,
          destStackIndex,
          movingRootCard,
          moveCount,
          destTopCard: peek(destStack),
          destPileIndex,
          pounceSlotCard: getPounceSlotCardAfterBuriedCenterShuffle(
            player,
            sourceStackIndex,
            destStackIndex,
            cardIndex
          ),
        };
        const existing = playsById.get(play.id);
        if (!existing || isBetterBuriedCenterShuffle(play, existing)) {
          playsById.set(play.id, play);
        }
      });
    });
  });

  return Array.from(playsById.values());
}

function isBetterBuriedCenterShuffle(
  candidate: AvailableBuriedCenterShuffle,
  existing: AvailableBuriedCenterShuffle
): boolean {
  if (!!candidate.pounceSlotCard !== !!existing.pounceSlotCard) {
    return !!candidate.pounceSlotCard;
  }
  if (candidate.destStackIndex !== existing.destStackIndex) {
    return candidate.destStackIndex < existing.destStackIndex;
  }
  return candidate.destPileIndex < existing.destPileIndex;
}

function getPounceSlotCardAfterBuriedCenterShuffle(
  player: NonNullable<BoardState["players"][number]>,
  sourceStackIndex: number,
  destStackIndex: number,
  buriedCardIndex: number
): CardState | undefined {
  const pounceCard = peek(player.pounceDeck);
  if (!pounceCard) {
    return undefined;
  }

  const pounceAlreadyHadAHome = player.stacks.some((stack) =>
    canMoveToSolitairePile(pounceCard, stack)
  );
  if (pounceAlreadyHadAHome) {
    return undefined;
  }

  const sourceStack = player.stacks[sourceStackIndex];
  const destStack = player.stacks[destStackIndex];
  const movedTail = sourceStack.slice(buriedCardIndex + 1);
  const sourceAfterCenterPlay = sourceStack.slice(0, buriedCardIndex);

  if (sourceAfterCenterPlay.length === 0) {
    return pounceCard;
  }

  const destAfterSetup = destStack.concat(movedTail);
  if (canMoveToSolitairePile(destAfterSetup[0], sourceAfterCenterPlay)) {
    return pounceCard;
  }

  return undefined;
}

function addPounceConnectorIfUseful(
  helpers: AvailablePounceHelper[],
  playerIndex: number,
  source: SolitaireSource,
  card: CardState,
  destStack: CardState[],
  destStackIndex: number,
  pounceCard: CardState
): void {
  if (
    !canMoveToSolitairePile(card, destStack) ||
    canMoveToSolitairePile(pounceCard, destStack)
  ) {
    return;
  }

  const destAfterMove = destStack.concat(card);
  if (!canMoveToSolitairePile(pounceCard, destAfterMove)) {
    return;
  }

  helpers.push({
    id: `${playerIndex}:connect-pounce:${solitaireSourceKey(
      source
    )}:${destStackIndex}:${cardKey(card)}:${cardKey(pounceCard)}`,
    playerIndex,
    source,
    card,
    destStackIndex,
    destTopCard: peek(destStack),
    pounceCard,
    benefit: "connect_pounce_card",
  });
}

function createHighlightForClosedWindow(
  openWindow: OpenCenterPlayWindow,
  closingSnapshot: RoundSnapshot,
  roundStartedAt: number,
  options: {
    forcedKind?: RoundAnalysisHighlight["kind"];
    closedByAction?: RoundAnalysisActionContext;
  } = {}
): RoundAnalysisHighlight | null {
  const durationMs = Math.max(0, closingSnapshot.time - openWindow.firstSeen);
  const isOwnPlay = isOwnCenterPlay(openWindow, closingSnapshot);
  if (isOwnPlay && durationMs < MIN_DELAYED_PLAY_WINDOW_MS) {
    return null;
  }
  if (durationMs < MIN_MISSED_WINDOW_MS) {
    return null;
  }

  const kind = isOwnPlay
    ? "delayed_center_play"
    : options.forcedKind ?? getMissedPlayKind(openWindow, closingSnapshot);
  const cardLabel = formatCard(openWindow.card);
  const sourceLabel = formatSource(openWindow.source);
  const durationLabel = formatDuration(durationMs);
  const severity = getSeverity(openWindow, durationMs);
  const pointValue = getCenterPointValue(openWindow);
  const followUpDetail = getFreedPounceSlotDetail(openWindow);

  return {
    id: `${openWindow.id}:${openWindow.firstSeen}:${closingSnapshot.time}`,
    kind,
    severity,
    title: getHighlightTitle(kind, cardLabel),
    detail: appendFollowUpDetail(
      getHighlightDetail(kind, cardLabel, sourceLabel, durationLabel),
      followUpDetail
    ),
    card: openWindow.card,
    cardLabel,
    sourceLabel,
    pointValue,
    board: openWindow.firstSeenBoard,
    openedByAction: openWindow.openedByAction,
    closedByAction: options.closedByAction,
    closedReason: getWindowCloseReason(
      kind,
      closingSnapshot.reason === "round_end"
    ),
    windowActions: openWindow.windowActions,
    durationMs,
    firstSeenOffsetMs: Math.max(0, openWindow.firstSeen - roundStartedAt),
    lastSeenOffsetMs: Math.max(0, closingSnapshot.time - roundStartedAt),
    sortScore: getSortScore(openWindow, kind, durationMs),
    playerIndex: openWindow.playerIndex,
  };
}

function createPounceHelperHighlight(
  openWindow: OpenPounceHelperWindow,
  closingSnapshot: RoundSnapshot,
  roundStartedAt: number,
  closedByAction?: RoundAnalysisActionContext
): RoundAnalysisHighlight | null {
  const isOwnPlay = isOwnPounceHelperPlay(openWindow, closingSnapshot);
  const isBetterPlay = isOwnBetterPounceHelperPlay(openWindow, closingSnapshot);
  if (isBetterPlay) {
    return null;
  }

  const durationMs = Math.max(0, closingSnapshot.time - openWindow.firstSeen);
  if (isOwnPlay && durationMs < MIN_DELAYED_PLAY_WINDOW_MS) {
    return null;
  }
  if (durationMs < MIN_SOLITAIRE_HELPER_WINDOW_MS) {
    return null;
  }

  const kind = isOwnPlay
    ? "delayed_pounce_helper"
    : getPounceHelperKind(openWindow.benefit);
  const cardLabel = formatCard(openWindow.card);
  const pounceCardLabel = formatCard(openWindow.pounceCard);
  const sourceLabel = formatSolitaireSource(openWindow.source);
  const destLabel = formatSolitaireDest(openWindow.destTopCard);
  const durationLabel = formatDuration(durationMs);
  const pointValue = getPounceHelperPointValue(openWindow);

  return {
    id: `${openWindow.id}:${openWindow.firstSeen}:${closingSnapshot.time}`,
    kind,
    severity:
      kind === "delayed_pounce_helper"
        ? "low"
        : openWindow.benefit === "play_pounce_to_solitaire"
        ? "high"
        : "medium",
    title: getPounceHelperTitle(
      openWindow,
      kind,
      cardLabel,
      pounceCardLabel
    ),
    detail: getPounceHelperDetail(
      openWindow,
      kind,
      cardLabel,
      sourceLabel,
      destLabel,
      pounceCardLabel,
      durationLabel
    ),
    card: openWindow.card,
    cardLabel,
    sourceLabel,
    pointValue,
    board: openWindow.firstSeenBoard,
    openedByAction: openWindow.openedByAction,
    closedByAction,
    closedReason: getWindowCloseReason(
      kind,
      closingSnapshot.reason === "round_end"
    ),
    windowActions: openWindow.windowActions,
    durationMs,
    firstSeenOffsetMs: Math.max(0, openWindow.firstSeen - roundStartedAt),
    lastSeenOffsetMs: Math.max(0, closingSnapshot.time - roundStartedAt),
    sortScore: getPounceHelperSortScore(openWindow, durationMs),
    playerIndex: openWindow.playerIndex,
  };
}

function createBuriedCenterShuffleHighlight(
  openWindow: OpenBuriedCenterShuffleWindow,
  closingSnapshot: RoundSnapshot,
  roundStartedAt: number,
  closedByAction?: RoundAnalysisActionContext
): RoundAnalysisHighlight | null {
  const isOwnSetup = isOwnBuriedCenterShuffleSetup(
    openWindow,
    closingSnapshot
  );
  const durationMs = Math.max(0, closingSnapshot.time - openWindow.firstSeen);
  if (isOwnSetup && durationMs < MIN_DELAYED_PLAY_WINDOW_MS) {
    return null;
  }
  if (durationMs < MIN_SOLITAIRE_HELPER_WINDOW_MS) {
    return null;
  }

  const kind = isOwnSetup
    ? "delayed_buried_center_shuffle"
    : "buried_center_shuffle";
  const cardLabel = formatCard(openWindow.card);
  const sourceLabel = `solitaire stack ${openWindow.sourceStackIndex + 1}`;
  const durationLabel = formatDuration(durationMs);
  const pointValue = getBuriedCenterShufflePointValue(openWindow);

  return {
    id: `${openWindow.id}:${openWindow.firstSeen}:${closingSnapshot.time}`,
    kind,
    severity: getBuriedCenterShuffleSeverity(openWindow, kind, durationMs),
    title: getBuriedCenterShuffleTitle(openWindow, kind, cardLabel),
    detail: getBuriedCenterShuffleDetail(
      openWindow,
      kind,
      cardLabel,
      sourceLabel,
      durationLabel
    ),
    card: openWindow.card,
    cardLabel,
    sourceLabel,
    pointValue,
    board: openWindow.firstSeenBoard,
    openedByAction: openWindow.openedByAction,
    closedByAction,
    closedReason: getBuriedCenterShuffleCloseReason(
      openWindow,
      kind,
      closingSnapshot
    ),
    windowActions: openWindow.windowActions,
    durationMs,
    firstSeenOffsetMs: Math.max(0, openWindow.firstSeen - roundStartedAt),
    lastSeenOffsetMs: Math.max(0, closingSnapshot.time - roundStartedAt),
    sortScore: getBuriedCenterShuffleSortScore(openWindow, durationMs),
    playerIndex: openWindow.playerIndex,
  };
}

function getCenterPointValue(openWindow: OpenCenterPlayWindow): number {
  const centerPointValue = openWindow.source.type === "pounce" ? 3 : 1;
  return centerPointValue + (getFreedPounceSlotCard(openWindow) ? 2 : 0);
}

function getFreedPounceSlotCard(
  openWindow: OpenCenterPlayWindow
): CardState | undefined {
  if (openWindow.source.type !== "solitaire") {
    return undefined;
  }

  const player = openWindow.firstSeenBoard.players[openWindow.playerIndex];
  const sourceStack = player?.stacks[openWindow.source.index];
  const pounceCard = peek(player?.pounceDeck ?? []);
  if (!player || !sourceStack || sourceStack.length !== 1 || !pounceCard) {
    return undefined;
  }

  const pounceAlreadyHadAHome = player.stacks.some((stack) =>
    canMoveToSolitairePile(pounceCard, stack)
  );
  return pounceAlreadyHadAHome ? undefined : pounceCard;
}

function getFreedPounceSlotDetail(
  openWindow: OpenCenterPlayWindow
): string | null {
  const pounceCard = getFreedPounceSlotCard(openWindow);
  if (!pounceCard) {
    return null;
  }

  return `Playing it would also free a slot for your pounce card ${formatCard(
    pounceCard
  )}.`;
}

function appendFollowUpDetail(detail: string, followUpDetail: string | null) {
  return followUpDetail ? `${detail} ${followUpDetail}` : detail;
}

function getPounceHelperPointValue(
  openWindow: OpenPounceHelperWindow
): number {
  if (openWindow.benefit === "connect_pounce_card") {
    return 2;
  }
  return 2;
}

function getBuriedCenterShufflePointValue(
  openWindow: OpenBuriedCenterShuffleWindow
): number {
  return 1 + (openWindow.pounceSlotCard ? 2 : 0);
}

function getBuriedCenterShuffleSeverity(
  openWindow: OpenBuriedCenterShuffleWindow,
  kind: RoundAnalysisHighlight["kind"],
  durationMs: number
): RoundAnalysisHighlight["severity"] {
  if (kind === "delayed_buried_center_shuffle") {
    return "low";
  }
  if (openWindow.pounceSlotCard || durationMs >= 8000) {
    return "high";
  }
  return "medium";
}

function getBuriedCenterShuffleSortScore(
  openWindow: OpenBuriedCenterShuffleWindow,
  durationMs: number
): number {
  return (openWindow.pounceSlotCard ? 270000 : 230000) + durationMs;
}

function getBuriedCenterShuffleTitle(
  openWindow: OpenBuriedCenterShuffleWindow,
  kind: RoundAnalysisHighlight["kind"],
  cardLabel: string
): string {
  if (kind === "delayed_buried_center_shuffle") {
    return `Delayed uncovering ${cardLabel}`;
  }
  if (openWindow.pounceSlotCard) {
    return `Could uncover ${cardLabel} and open a slot`;
  }
  return `Could uncover ${cardLabel}`;
}

function getBuriedCenterShuffleDetail(
  openWindow: OpenBuriedCenterShuffleWindow,
  kind: RoundAnalysisHighlight["kind"],
  cardLabel: string,
  sourceLabel: string,
  durationLabel: string
): string {
  const movingLabel =
    openWindow.moveCount === 1
      ? formatCard(openWindow.movingRootCard)
      : `${openWindow.moveCount} cards starting with ${formatCard(
          openWindow.movingRootCard
        )}`;
  const destLabel = formatSolitaireDest(openWindow.destTopCard);
  const timingLabel =
    kind === "delayed_buried_center_shuffle"
      ? `; this line was available for ${durationLabel} before you started it`
      : `; this line was available for ${durationLabel}`;
  const pounceDetail = openWindow.pounceSlotCard
    ? ` After ${cardLabel} goes to center, this can also open a slot for your pounce card ${formatCard(
        openWindow.pounceSlotCard
      )}.`
    : "";

  return `Moving ${movingLabel} from your ${sourceLabel} to ${destLabel} would expose ${cardLabel} to play to center${timingLabel}.${pounceDetail}`;
}

function getBuriedCenterShuffleCloseReason(
  openWindow: OpenBuriedCenterShuffleWindow,
  kind: RoundAnalysisHighlight["kind"],
  closingSnapshot: RoundSnapshot
): string {
  if (closingSnapshot.reason === "round_end") {
    return "The round ended while this buried-card line was still available.";
  }
  if (kind === "delayed_buried_center_shuffle") {
    return "You eventually started this shuffle.";
  }

  const movedCenterCard = getMovedCenterCard(closingSnapshot);
  if (
    closingSnapshot.playerIndex != null &&
    closingSnapshot.playerIndex !== openWindow.playerIndex &&
    movedCenterCard?.suit === openWindow.card.suit &&
    movedCenterCard.value === openWindow.card.value
  ) {
    return "Another player took the center spot before you could uncover it.";
  }

  if (closingSnapshot.playerIndex === openWindow.playerIndex) {
    return "Your move changed the solitaire layout before this line was completed.";
  }

  return "The buried-card line was no longer available.";
}

function getWindowCloseReason(
  kind: RoundAnalysisHighlight["kind"],
  wasRoundEnd = false
): string {
  if (wasRoundEnd) {
    return "The round ended while this play was still available.";
  }
  if (kind === "delayed_center_play" || kind === "delayed_pounce_helper") {
    return "You eventually made this play.";
  }
  if (kind === "cycled_past_playable") {
    return "You cycled past the playable waste card.";
  }
  if (kind === "beaten_to_center") {
    return "Another player took the center spot first.";
  }
  if (kind === "round_end_available") {
    return "The round ended while this play was still available.";
  }
  if (kind === "missed_center_play") {
    return "The card was no longer playable to center.";
  }
  if (kind === "missed_pounce_solitaire") {
    return "The pounce-card move was no longer available.";
  }
  if (kind === "missed_pounce_slot") {
    return "The slot-opening move was no longer available.";
  }
  return "The pounce-helper move was no longer available.";
}

function isOwnPounceHelperPlay(
  openWindow: OpenPounceHelperWindow,
  closingSnapshot: RoundSnapshot
): boolean {
  const move = closingSnapshot.move;
  if (closingSnapshot.playerIndex !== openWindow.playerIndex || !move) {
    return false;
  }

  if (
    move.type === "c2s" &&
    move.source === openWindow.source.type
  ) {
    return (
      move.dest === openWindow.destStackIndex ||
      openWindow.source.type === "pounce"
    );
  }

  return (
    move.type === "s2s" &&
    openWindow.source.type === "solitaire" &&
    move.source === openWindow.source.index &&
    move.dest === openWindow.destStackIndex &&
    move.count === openWindow.source.count
  );
}

function isOwnBuriedCenterShuffleSetup(
  openWindow: OpenBuriedCenterShuffleWindow,
  closingSnapshot: RoundSnapshot
): boolean {
  const move = closingSnapshot.move;
  return (
    closingSnapshot.playerIndex === openWindow.playerIndex &&
    move?.type === "s2s" &&
    move.source === openWindow.sourceStackIndex &&
    move.count === openWindow.moveCount
  );
}

function isOwnBetterPounceHelperPlay(
  openWindow: OpenPounceHelperWindow,
  closingSnapshot: RoundSnapshot
): boolean {
  const move = closingSnapshot.move;
  if (closingSnapshot.playerIndex !== openWindow.playerIndex || !move) {
    return false;
  }
  if (move.type !== "c2c") {
    return false;
  }

  const movedCard = getMovedCenterCard(closingSnapshot);
  if (
    movedCard?.player !== openWindow.card.player ||
    movedCard.suit !== openWindow.card.suit ||
    movedCard.value !== openWindow.card.value
  ) {
    return false;
  }

  return solitaireSourceKey(openWindow.source) === sourceKey(move.source);
}

function getPounceHelperKind(
  benefit: PounceHelperBenefit
): RoundAnalysisHighlight["kind"] {
  if (benefit === "play_pounce_to_solitaire") {
    return "missed_pounce_solitaire";
  }
  if (benefit === "free_slot_for_pounce") {
    return "missed_pounce_slot";
  }
  return "missed_pounce_connector";
}

function getPounceHelperTitle(
  openWindow: OpenPounceHelperWindow,
  kind: RoundAnalysisHighlight["kind"],
  cardLabel: string,
  pounceCardLabel: string
): string {
  if (kind === "delayed_pounce_helper") {
    return `Delayed ${cardLabel}`;
  }
  if (openWindow.benefit === "play_pounce_to_solitaire") {
    return `Pounce card ${pounceCardLabel} had a home`;
  }
  if (openWindow.benefit === "free_slot_for_pounce") {
    return `Could free a slot for ${pounceCardLabel}`;
  }
  return `${cardLabel} connected ${pounceCardLabel}`;
}

function getPounceHelperDetail(
  openWindow: OpenPounceHelperWindow,
  kind: RoundAnalysisHighlight["kind"],
  cardLabel: string,
  sourceLabel: string,
  destLabel: string,
  pounceCardLabel: string,
  durationLabel: string
): string {
  if (kind === "delayed_pounce_helper") {
    if (openWindow.benefit === "play_pounce_to_solitaire") {
      return `Your pounce card ${pounceCardLabel} could move to ${destLabel} for ${durationLabel} before you played it.`;
    }
    if (openWindow.benefit === "free_slot_for_pounce") {
      return `${cardLabel} could move from your ${sourceLabel} to ${destLabel}, freeing an empty slot for your pounce card ${pounceCardLabel}, for ${durationLabel} before you played it.`;
    }
    return `${cardLabel} could move from your ${sourceLabel} to ${destLabel}, connecting your pounce card ${pounceCardLabel}, for ${durationLabel} before you played it.`;
  }
  if (openWindow.benefit === "play_pounce_to_solitaire") {
    return `Your pounce card ${pounceCardLabel} could move to ${destLabel} for ${durationLabel}.`;
  }
  if (openWindow.benefit === "free_slot_for_pounce") {
    return `${cardLabel} could move from your ${sourceLabel} to ${destLabel}, freeing an empty slot for your pounce card ${pounceCardLabel} for ${durationLabel}.`;
  }
  return `${cardLabel} could move from your ${sourceLabel} to ${destLabel}, connecting your pounce card ${pounceCardLabel} for ${durationLabel}.`;
}

function getPounceHelperSortScore(
  openWindow: OpenPounceHelperWindow,
  durationMs: number
) {
  const benefitScore =
    openWindow.benefit === "play_pounce_to_solitaire"
      ? 280000
      : openWindow.benefit === "free_slot_for_pounce"
      ? 255000
      : 240000;
  return benefitScore + durationMs;
}

function getMissedPlayKind(
  openWindow: OpenCenterPlayWindow,
  closingSnapshot: RoundSnapshot
): RoundAnalysisHighlight["kind"] {
  const move = closingSnapshot.move;
  if (
    closingSnapshot.playerIndex === openWindow.playerIndex &&
    openWindow.source.type === "deck" &&
    (move?.type === "cycle" || move?.type === "flip_deck")
  ) {
    return "cycled_past_playable";
  }

  const movedCenterCard = getMovedCenterCard(closingSnapshot);
  if (
    closingSnapshot.playerIndex != null &&
    closingSnapshot.playerIndex !== openWindow.playerIndex &&
    movedCenterCard &&
    movedCenterCard.suit === openWindow.card.suit &&
    movedCenterCard.value === openWindow.card.value
  ) {
    return "beaten_to_center";
  }

  return "missed_center_play";
}

function isOwnCenterPlay(
  openWindow: OpenCenterPlayWindow,
  closingSnapshot: RoundSnapshot
): boolean {
  const move = closingSnapshot.move;
  return (
    closingSnapshot.playerIndex === openWindow.playerIndex &&
    move?.type === "c2c" &&
    sourceKey(move.source) === sourceKey(openWindow.source)
  );
}

function getMovedCenterCard(
  snapshot: RoundSnapshot,
  previousSnapshot?: RoundSnapshot
): CardState | undefined {
  if (snapshot.move?.type !== "c2c") {
    return undefined;
  }

  if (previousSnapshot) {
    const destAddedCards = getAddedCards(
      previousSnapshot.board.piles[snapshot.move.dest] ?? [],
      snapshot.board.piles[snapshot.move.dest] ?? []
    );
    return (
      destAddedCards[0] ??
      getAddedCardsAcrossPiles(
        previousSnapshot.board.piles,
        snapshot.board.piles
      )[0]
    );
  }

  return peek(snapshot.board.piles[snapshot.move.dest] ?? []);
}

function getSeverity(
  openWindow: OpenCenterPlayWindow,
  durationMs: number
): RoundAnalysisHighlight["severity"] {
  if (openWindow.source.type === "pounce" || durationMs >= 5000) {
    return "high";
  }
  if (openWindow.source.type === "solitaire" || durationMs >= 2500) {
    return "medium";
  }
  return "low";
}

function getSortScore(
  openWindow: OpenCenterPlayWindow,
  kind: RoundAnalysisHighlight["kind"],
  durationMs: number
) {
  const sourceScore =
    openWindow.source.type === "pounce"
      ? 300000
      : openWindow.source.type === "solitaire"
      ? 200000
      : 100000;
  const kindScore =
    kind === "beaten_to_center"
      ? 50000
      : kind === "cycled_past_playable"
      ? 35000
      : kind === "round_end_available"
      ? 15000
      : 25000;
  return sourceScore + kindScore + durationMs;
}

function getHighlightTitle(
  kind: RoundAnalysisHighlight["kind"],
  cardLabel: string
): string {
  if (kind === "delayed_center_play") {
    return `Delayed ${cardLabel}`;
  }
  if (kind === "cycled_past_playable") {
    return `Cycled past ${cardLabel}`;
  }
  if (kind === "beaten_to_center") {
    return `Beaten to ${cardLabel}`;
  }
  if (kind === "round_end_available") {
    return `${cardLabel} was still open`;
  }
  return `Missed ${cardLabel}`;
}

function getHighlightDetail(
  kind: RoundAnalysisHighlight["kind"],
  cardLabel: string,
  sourceLabel: string,
  durationLabel: string
): string {
  if (kind === "delayed_center_play") {
    if (sourceLabel === "pounce pile") {
      return `Your pounce card ${cardLabel} was playable to center for ${durationLabel} before you played it.`;
    }
    return `${cardLabel} was playable from your ${sourceLabel} for ${durationLabel} before you played it to center.`;
  }
  if (kind === "cycled_past_playable") {
    return `${cardLabel} was playable from your ${sourceLabel} for ${durationLabel} before you cycled.`;
  }
  if (kind === "beaten_to_center") {
    if (sourceLabel === "pounce pile") {
      return `Your pounce card ${cardLabel} was playable to center for ${durationLabel} before another player took the spot.`;
    }
    return `${cardLabel} was playable from your ${sourceLabel} for ${durationLabel} before another player took the spot.`;
  }
  if (kind === "round_end_available") {
    if (sourceLabel === "pounce pile") {
      return `Your pounce card ${cardLabel} stayed playable to center for ${durationLabel} through the end of the round.`;
    }
    return `${cardLabel} stayed playable from your ${sourceLabel} for ${durationLabel} through the end of the round.`;
  }
  if (sourceLabel === "pounce pile") {
    return `Your pounce card ${cardLabel} was playable to center for ${durationLabel}.`;
  }
  return `${cardLabel} was playable from your ${sourceLabel} for ${durationLabel}.`;
}

function sourceKey(source: CenterPlaySource): string {
  if (source.type === "solitaire") {
    return `solitaire:${source.index}`;
  }
  return source.type;
}

function cardKey(card: CardState): string {
  return `${card.player}:${card.suit}:${card.value}`;
}

function isMissedCenterHighlight(highlight: RoundAnalysisHighlight): boolean {
  return (
    highlight.kind === "missed_center_play" ||
    highlight.kind === "cycled_past_playable" ||
    highlight.kind === "beaten_to_center" ||
    highlight.kind === "round_end_available" ||
    highlight.kind === "buried_center_shuffle"
  );
}

function isMissedPounceHelperHighlight(
  highlight: RoundAnalysisHighlight
): boolean {
  return (
    highlight.kind === "missed_pounce_solitaire" ||
    highlight.kind === "missed_pounce_connector" ||
    highlight.kind === "missed_pounce_slot"
  );
}

function isDelayedHighlight(highlight: RoundAnalysisHighlight): boolean {
  return (
    highlight.kind === "delayed_center_play" ||
    highlight.kind === "delayed_pounce_helper" ||
    highlight.kind === "delayed_buried_center_shuffle"
  );
}

export function formatCard(card: CardState): string {
  const value =
    card.value === 1
      ? "A"
      : card.value === 11
      ? "J"
      : card.value === 12
      ? "Q"
      : card.value === 13
      ? "K"
      : String(card.value);
  return `${value} ${card.suit}`;
}

function formatSource(source: CenterPlaySource): string {
  if (source.type === "pounce") {
    return "pounce pile";
  }
  if (source.type === "deck") {
    return "deck";
  }
  return `solitaire stack ${source.index + 1}`;
}

function solitaireSourceKey(source: SolitaireSource): string {
  if (source.type === "solitaire") {
    return `solitaire:${source.index}:${source.count}`;
  }
  return source.type;
}

function formatSolitaireSource(source: SolitaireSource): string {
  if (source.type === "pounce") {
    return "pounce pile";
  }
  if (source.type === "deck") {
    return "deck";
  }
  return `solitaire stack ${source.index + 1}`;
}

function formatSolitaireDest(destTopCard: CardState | undefined): string {
  return destTopCard ? formatCard(destTopCard) : "an empty solitaire slot";
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
