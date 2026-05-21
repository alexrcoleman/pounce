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
    totalMissedMs: number;
    longestMissMs: number;
  };
  highlights: RoundAnalysisHighlight[];
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
    | "missed_pounce_slot";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  card: CardState;
  cardLabel: string;
  sourceLabel: string;
  pointValue: number;
  durationMs: number;
  firstSeenOffsetMs: number;
  lastSeenOffsetMs: number;
  sortScore: number;
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
  seenCount: number;
};

const MIN_MISSED_WINDOW_MS = 750;
const MIN_SOLITAIRE_HELPER_WINDOW_MS = 3000;
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
  const openWindows = Array.from({ length: playerCount }, () => new Map<
    string,
    OpenCenterPlayWindow
  >());
  const openPounceHelperWindows = Array.from(
    { length: playerCount },
    () => new Map<string, OpenPounceHelperWindow>()
  );
  const highlightsByPlayer = Array.from({ length: playerCount }, () => [] as RoundAnalysisHighlight[]);

  orderedSnapshots.forEach((snapshot) => {
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
        const highlight = createHighlightForClosedWindow(
          openWindow,
          snapshot,
          firstSnapshot.time
        );
        if (highlight) {
          highlightsByPlayer[playerIndex].push(highlight);
        }
      });

      currentPlays.forEach((play) => {
        const openWindow = playerOpenWindows.get(play.id);
        if (openWindow) {
          openWindow.lastSeen = snapshot.time;
          openWindow.seenCount += 1;
          openWindow.destPileIndex = play.destPileIndex;
          return;
        }

        playerOpenWindows.set(play.id, {
          ...play,
          firstSeen: snapshot.time,
          lastSeen: snapshot.time,
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
          const highlight = createPounceHelperHighlight(
            openWindow,
            snapshot,
            firstSnapshot.time
          );
          if (highlight) {
            highlightsByPlayer[playerIndex].push(highlight);
          }
        }
      );

      currentPounceHelpers.forEach((play) => {
        const openWindow = playerOpenPounceHelperWindows.get(play.id);
        if (openWindow) {
          openWindow.lastSeen = snapshot.time;
          openWindow.seenCount += 1;
          return;
        }

        playerOpenPounceHelperWindows.set(play.id, {
          ...play,
          firstSeen: snapshot.time,
          lastSeen: snapshot.time,
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
        "round_end_available"
      );
      if (highlight) {
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
    playerReports: finalBoard.players.map((player, playerIndex) => {
      const highlights = highlightsByPlayer[playerIndex]
        .sort((a, b) => b.sortScore - a.sortScore)
        .slice(0, MAX_HIGHLIGHTS_PER_PLAYER);
      const missedHighlights = highlightsByPlayer[playerIndex];
      const missedCenterHighlights = missedHighlights.filter(isCenterHighlight);
      const missedPounceHelperHighlights =
        missedHighlights.filter(isPounceHelperHighlight);
      const moveStats = moveStatsByPlayer[playerIndex];

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
      };
    }),
  };
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
    if (!move || playerIndex == null || !stats[playerIndex]) {
      return;
    }

    if (move.type === "c2c") {
      const movedCard = getMovedCenterCard(snapshot);
      if (movedCard && movedCard.player === playerIndex) {
        stats[playerIndex].centerCardKeys.add(cardKey(movedCard));
        stats[playerIndex].cardsPlayedToCenter =
          stats[playerIndex].centerCardKeys.size;
      }
    } else if (move.type === "c2s" || move.type === "s2s") {
      stats[playerIndex].solitaireMoves += 1;
    } else if (move.type === "cycle") {
      stats[playerIndex].deckCycles += getDeckCycles(
        snapshots[index - 1]?.board,
        playerIndex
      );
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
  forcedKind?: RoundAnalysisHighlight["kind"]
): RoundAnalysisHighlight | null {
  if (isOwnCenterPlay(openWindow, closingSnapshot)) {
    return null;
  }

  const durationMs = Math.max(0, closingSnapshot.time - openWindow.firstSeen);
  if (durationMs < MIN_MISSED_WINDOW_MS) {
    return null;
  }

  const kind = forcedKind ?? getMissedPlayKind(openWindow, closingSnapshot);
  const cardLabel = formatCard(openWindow.card);
  const sourceLabel = formatSource(openWindow.source);
  const durationLabel = formatDuration(durationMs);
  const severity = getSeverity(openWindow, durationMs);
  const pointValue = getCenterPointValue(openWindow);

  return {
    id: `${openWindow.id}:${openWindow.firstSeen}:${closingSnapshot.time}`,
    kind,
    severity,
    title: getHighlightTitle(kind, cardLabel),
    detail: getHighlightDetail(kind, cardLabel, sourceLabel, durationLabel),
    card: openWindow.card,
    cardLabel,
    sourceLabel,
    pointValue,
    durationMs,
    firstSeenOffsetMs: Math.max(0, openWindow.firstSeen - roundStartedAt),
    lastSeenOffsetMs: Math.max(0, closingSnapshot.time - roundStartedAt),
    sortScore: getSortScore(openWindow, kind, durationMs),
  };
}

function createPounceHelperHighlight(
  openWindow: OpenPounceHelperWindow,
  closingSnapshot: RoundSnapshot,
  roundStartedAt: number
): RoundAnalysisHighlight | null {
  if (isOwnPounceHelperPlay(openWindow, closingSnapshot)) {
    return null;
  }

  const durationMs = Math.max(0, closingSnapshot.time - openWindow.firstSeen);
  if (durationMs < MIN_SOLITAIRE_HELPER_WINDOW_MS) {
    return null;
  }

  const kind = getPounceHelperKind(openWindow.benefit);
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
      openWindow.benefit === "play_pounce_to_solitaire" ? "high" : "medium",
    title: getPounceHelperTitle(openWindow, cardLabel, pounceCardLabel),
    detail: getPounceHelperDetail(
      openWindow,
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
    durationMs,
    firstSeenOffsetMs: Math.max(0, openWindow.firstSeen - roundStartedAt),
    lastSeenOffsetMs: Math.max(0, closingSnapshot.time - roundStartedAt),
    sortScore: getPounceHelperSortScore(openWindow, durationMs),
  };
}

function getCenterPointValue(openWindow: OpenCenterPlayWindow): number {
  return openWindow.source.type === "pounce" ? 3 : 1;
}

function getPounceHelperPointValue(
  openWindow: OpenPounceHelperWindow
): number {
  if (openWindow.benefit === "connect_pounce_card") {
    return 2;
  }
  return 2;
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
    move.dest === openWindow.destStackIndex &&
    move.source === openWindow.source.type
  ) {
    return true;
  }

  return (
    move.type === "s2s" &&
    openWindow.source.type === "solitaire" &&
    move.source === openWindow.source.index &&
    move.dest === openWindow.destStackIndex &&
    move.count === openWindow.source.count
  );
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
  cardLabel: string,
  pounceCardLabel: string
): string {
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
  cardLabel: string,
  sourceLabel: string,
  destLabel: string,
  pounceCardLabel: string,
  durationLabel: string
): string {
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

function getMovedCenterCard(snapshot: RoundSnapshot): CardState | undefined {
  if (snapshot.move?.type !== "c2c") {
    return undefined;
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

function isCenterHighlight(highlight: RoundAnalysisHighlight): boolean {
  return (
    highlight.kind === "missed_center_play" ||
    highlight.kind === "cycled_past_playable" ||
    highlight.kind === "beaten_to_center" ||
    highlight.kind === "round_end_available"
  );
}

function isPounceHelperHighlight(highlight: RoundAnalysisHighlight): boolean {
  return (
    highlight.kind === "missed_pounce_solitaire" ||
    highlight.kind === "missed_pounce_connector" ||
    highlight.kind === "missed_pounce_slot"
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
