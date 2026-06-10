import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CSSProperties } from "react";

import type { BoardState, CardState, PlayerState } from "../shared/GameUtils";
import { CARD_HEIGHT, CARD_WIDTH } from "../shared/CardLocations";
import {
  FIELD_LEFT,
  FIELD_SIZE,
  FIELD_TOP,
  type BoardLayout,
  useBoardLayout,
} from "./BoardLayout";
import type { CardLocation, CardScreenGeometry } from "./cardGeometry";
import styles from "./RoundEndSequence.module.css";

export type RoundEndAnimationMode = "auto" | "play" | "skip";

type RoundEndPhase =
  | "announce"
  | "pouncePenalty"
  | "gatherCenter"
  | "sortCenter"
  | "settled";

type CardVisualGeometry = Pick<
  CardScreenGeometry,
  "rotationDegrees" | "screenScale" | "x" | "y"
>;

export type RoundEndCardPresentation = {
  faceUp?: boolean;
  geometry?: CardVisualGeometry;
  opacity?: number;
  transitionDelayMs?: number;
  transitionDurationMs?: number;
  transitionEasing?: string;
  zIndex?: number;
};

type RoundEndCardInput = {
  card: CardState;
  location: CardLocation;
  naturalGeometry: CardScreenGeometry;
};

type RoundEndOverlayState = {
  phase: RoundEndPhase;
  pouncerName: string;
  tallies: RoundEndTallyView[];
};

type RoundEndTallyView = {
  color: string;
  name: string;
  playerIndex: number;
  score: number;
  x: number;
  y: number;
};

type RoundEndSequenceContextValue = {
  getCardPresentation: (
    input: RoundEndCardInput
  ) => RoundEndCardPresentation | null;
  isScoreboardVisible: boolean;
  overlay: RoundEndOverlayState | null;
  wasScoreboardDelayed: boolean;
};

type RoundEndSequenceState = {
  roundKey: string;
  shouldAnimate: boolean;
  startedAt: number;
};

type ScreenTarget = CardVisualGeometry & {
  labelX: number;
  labelY: number;
};

type PlayerTallyPlan = {
  centerCardKeys: string[];
  color: string;
  finalScore: number;
  name: string;
  playerIndex: number;
  pounceCardKeys: string[];
  target: ScreenTarget;
};

type CardPlan = {
  finalTarget: CardVisualGeometry;
  gatherTarget?: CardVisualGeometry;
  kind: "center" | "pounce";
  playerIndex: number;
  sortOrder: number;
  zIndex: number;
};

type RoundEndPlan = {
  cardPlans: Record<string, CardPlan>;
  playerPlans: PlayerTallyPlan[];
  pouncerName: string;
  roundKey: string;
};

const ANNOUNCE_MS = 1000;
const POUNCE_PENALTY_MS = 800;
const GATHER_CENTER_MS = 850;
const SORT_CENTER_MS = 1300;
const SETTLE_MS = 600;
const TOTAL_SEQUENCE_MS =
  ANNOUNCE_MS +
  POUNCE_PENALTY_MS +
  GATHER_CENTER_MS +
  SORT_CENTER_MS +
  SETTLE_MS;
const POUNCE_START_MS = ANNOUNCE_MS;
const GATHER_START_MS = POUNCE_START_MS + POUNCE_PENALTY_MS;
const SORT_START_MS = GATHER_START_MS + GATHER_CENTER_MS;
const SETTLE_START_MS = SORT_START_MS + SORT_CENTER_MS;
const CEREMONY_CARD_Z_INDEX = 70000;
const FIELD_AREA = { type: "field" } as const;

const defaultContext: RoundEndSequenceContextValue = {
  getCardPresentation: () => null,
  isScoreboardVisible: true,
  overlay: null,
  wasScoreboardDelayed: false,
};

const RoundEndSequenceContext =
  createContext<RoundEndSequenceContextValue>(defaultContext);

export function RoundEndSequenceProvider({
  board,
  children,
  mode = "auto",
}: {
  board: BoardState;
  children: ReactNode;
  mode?: RoundEndAnimationMode;
}) {
  const layout = useBoardLayout();
  const roundKey = getRoundKey(board);
  const prefersReducedMotion = usePrefersReducedMotion();
  const previousBoardWasActiveRef = useRef(board.isActive);
  const [sequence, setSequence] = useState<RoundEndSequenceState | null>(() => {
    const initialRoundKey = getRoundKey(board);
    if (initialRoundKey == null) {
      return null;
    }
    return {
      roundKey: initialRoundKey,
      shouldAnimate: mode === "play",
      startedAt: getAnimationNow(),
    };
  });
  const [now, setNow] = useState(getAnimationNow);

  useEffect(() => {
    const previousBoardWasActive = previousBoardWasActiveRef.current;
    previousBoardWasActiveRef.current = board.isActive;

    if (roundKey == null) {
      setSequence(null);
      return;
    }

    setSequence((current) => {
      if (current?.roundKey === roundKey) {
        return current;
      }

      return {
        roundKey,
        shouldAnimate:
          mode === "skip"
            ? false
            : mode === "play" || (mode === "auto" && previousBoardWasActive),
        startedAt: getAnimationNow(),
      };
    });
  }, [board.isActive, mode, roundKey]);

  const shouldRunAnimation =
    sequence?.shouldAnimate === true &&
    (mode === "play" || !prefersReducedMotion) &&
    roundKey != null;
  const elapsedMs =
    shouldRunAnimation && sequence ? now - sequence.startedAt : 0;
  const isAnimating = shouldRunAnimation && elapsedMs < TOTAL_SEQUENCE_MS;

  useEffect(() => {
    if (!shouldRunAnimation || sequence == null) {
      return;
    }

    let frameId = 0;
    const tick = () => {
      const nextNow = getAnimationNow();
      setNow(nextNow);
      if (nextNow - sequence.startedAt < TOTAL_SEQUENCE_MS) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    setNow(getAnimationNow());
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [sequence?.roundKey, sequence?.startedAt, shouldRunAnimation]);

  const plan = useMemo(
    () =>
      roundKey == null
        ? null
        : createRoundEndPlan({
            board,
            layout,
            roundKey,
          }),
    [board, layout, roundKey]
  );

  const value = useMemo<RoundEndSequenceContextValue>(() => {
    const getCardPresentation = ({
      card,
      location,
      naturalGeometry,
    }: RoundEndCardInput): RoundEndCardPresentation | null => {
      if (!isAnimating || plan == null) {
        return null;
      }

      const cardKey = getCardKey(card);
      const cardPlan = plan.cardPlans[cardKey];
      if (!cardPlan) {
        return elapsedMs >= POUNCE_START_MS
          ? {
              opacity: 0.24,
              transitionDurationMs: 260,
            }
          : null;
      }

      if (cardPlan.kind === "pounce") {
        if (elapsedMs < POUNCE_START_MS) {
          return null;
        }
        return {
          faceUp: false,
          geometry: cardPlan.finalTarget,
          transitionDelayMs: getPounceDelayMs(cardPlan.sortOrder),
          transitionDurationMs: 620,
          transitionEasing: "cubic-bezier(0.18, 0.82, 0.25, 1)",
          zIndex: cardPlan.zIndex,
        };
      }

      if (location.type !== "field_stack" || elapsedMs < GATHER_START_MS) {
        return null;
      }

      const isSorting = elapsedMs >= SORT_START_MS;
      return {
        faceUp: false,
        geometry:
          isSorting || !cardPlan.gatherTarget
            ? cardPlan.finalTarget
            : cardPlan.gatherTarget,
        transitionDelayMs: isSorting
          ? getSortDelayMs(cardPlan.sortOrder, cardPlan.playerIndex)
          : getGatherDelayMs(cardPlan.sortOrder),
        transitionDurationMs: isSorting ? 760 : 640,
        transitionEasing: isSorting
          ? "cubic-bezier(0.22, 0.76, 0.25, 1)"
          : "cubic-bezier(0.18, 0.84, 0.22, 1)",
        zIndex: cardPlan.zIndex + (isSorting ? 450 : 0),
      };
    };

    return {
      getCardPresentation,
      isScoreboardVisible: !shouldRunAnimation || elapsedMs >= TOTAL_SEQUENCE_MS,
      overlay:
        isAnimating && plan != null
          ? {
              phase: getPhase(elapsedMs),
              pouncerName: plan.pouncerName,
              tallies: getTallyViews(plan, elapsedMs),
            }
          : null,
      wasScoreboardDelayed:
        shouldRunAnimation && elapsedMs >= TOTAL_SEQUENCE_MS,
    };
  }, [elapsedMs, isAnimating, plan, shouldRunAnimation]);

  return (
    <RoundEndSequenceContext.Provider value={value}>
      {children}
    </RoundEndSequenceContext.Provider>
  );
}

export function useRoundEndSequence() {
  return useContext(RoundEndSequenceContext);
}

export function useRoundEndCardPresentation(
  input: RoundEndCardInput
): RoundEndCardPresentation | null {
  return useRoundEndSequence().getCardPresentation(input);
}

export function RoundEndSequenceOverlay() {
  const { overlay } = useRoundEndSequence();

  if (!overlay) {
    return null;
  }

  return (
    <div className={styles.layer} data-phase={overlay.phase}>
      {overlay.phase === "announce" ? (
        <div className={styles.announcement} role="status">
          <span className={styles.announcementText}>Pounce!</span>
          <span className={styles.announcementName}>
            {overlay.pouncerName}
          </span>
        </div>
      ) : null}
      {overlay.tallies.map((tally) => (
        <div
          aria-hidden="true"
          className={styles.tally}
          data-score={getScoreKind(tally.score)}
          key={tally.playerIndex}
          style={
            {
              "--player-color": tally.color,
              left: `${tally.x}px`,
              top: `${tally.y}px`,
            } as CSSProperties
          }
        >
          <span className={styles.tallyScore}>{formatScore(tally.score)}</span>
          <span className={styles.tallyName}>{tally.name}</span>
        </div>
      ))}
    </div>
  );
}

function createRoundEndPlan({
  board,
  layout,
  roundKey,
}: {
  board: BoardState;
  layout: BoardLayout;
  roundKey: string;
}): RoundEndPlan {
  const activePlayers = board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => player.isSpectating !== true);
  const playerPlans: PlayerTallyPlan[] = activePlayers.map(
    ({ player, playerIndex }, order) => {
      return {
        centerCardKeys: [],
        color: player.color,
        finalScore: getFinalRoundScore(player),
        name: player.name,
        playerIndex,
        pounceCardKeys: player.pounceDeck.map(getCardKey),
        target: getPlayerTallyTarget(layout, order, activePlayers.length),
      };
    }
  );
  const playerPlanByIndex = new Map(
    playerPlans.map((playerPlan) => [playerPlan.playerIndex, playerPlan])
  );
  const cardPlans: Record<string, CardPlan> = {};

  playerPlans.forEach((playerPlan) => {
    playerPlan.pounceCardKeys.forEach((cardKey, cardIndex) => {
      cardPlans[cardKey] = {
        finalTarget: getStackedTarget(
          layout,
          playerPlan.target,
          cardIndex,
          cardKey,
          0
        ),
        kind: "pounce",
        playerIndex: playerPlan.playerIndex,
        sortOrder: cardIndex,
        zIndex: CEREMONY_CARD_Z_INDEX + cardIndex,
      };
    });
  });

  let centerOrder = 0;
  board.piles.forEach((pile, pileIndex) => {
    pile.forEach((card, cardIndex) => {
      const playerPlan = playerPlanByIndex.get(card.player);
      if (!playerPlan) {
        return;
      }

      const cardKey = getCardKey(card);
      const sortOrder = playerPlan.centerCardKeys.length;
      playerPlan.centerCardKeys.push(cardKey);
      cardPlans[cardKey] = {
        finalTarget: getStackedTarget(
          layout,
          playerPlan.target,
          playerPlan.pounceCardKeys.length + sortOrder,
          cardKey,
          0
        ),
        gatherTarget: getGatherTarget(
          layout,
          cardKey,
          pileIndex * 32 + cardIndex
        ),
        kind: "center",
        playerIndex: card.player,
        sortOrder: centerOrder,
        zIndex: CEREMONY_CARD_Z_INDEX + 600 + centerOrder,
      };
      centerOrder += 1;
    });
  });

  const pouncer =
    board.pouncer != null ? board.players[board.pouncer] : undefined;
  return {
    cardPlans,
    playerPlans,
    pouncerName: pouncer?.name ?? "Player",
    roundKey,
  };
}

function getPlayerTallyTarget(
  layout: BoardLayout,
  order: number,
  playerCount: number
): ScreenTarget {
  const centerX = FIELD_LEFT + FIELD_SIZE / 2;
  const centerY = FIELD_TOP + FIELD_SIZE / 2;
  const angle = getTallyAngle(order, playerCount);
  const radiusX = FIELD_SIZE * (playerCount <= 3 ? 0.31 : 0.35);
  const radiusY = FIELD_SIZE * (playerCount <= 3 ? 0.25 : 0.3);
  const fieldX = centerX + Math.cos(angle) * radiusX - CARD_WIDTH / 2;
  const fieldY = centerY + Math.sin(angle) * radiusY - CARD_HEIGHT / 2;
  const [x, y] = layout.mapPoint([fieldX, fieldY], FIELD_AREA);
  const [labelX, labelY] = layout.mapPoint(
    [fieldX + CARD_WIDTH / 2, fieldY - 14],
    FIELD_AREA
  );

  return {
    labelX,
    labelY,
    rotationDegrees: 0,
    screenScale: layout.getScale(FIELD_AREA),
    x,
    y,
  };
}

function getGatherTarget(
  layout: BoardLayout,
  cardKey: string,
  order: number
): CardVisualGeometry {
  const hash = hashString(cardKey);
  const angle = getHashUnit(hash, 0) * Math.PI * 2;
  const radius = 10 + getHashUnit(hash, 8) * 48;
  const fieldX =
    FIELD_LEFT +
    FIELD_SIZE / 2 -
    CARD_WIDTH / 2 +
    Math.cos(angle) * radius;
  const fieldY =
    FIELD_TOP +
    FIELD_SIZE / 2 -
    CARD_HEIGHT / 2 +
    Math.sin(angle) * radius;
  const [x, y] = layout.mapPoint([fieldX, fieldY], FIELD_AREA);

  return {
    rotationDegrees: getSignedHashUnit(hash, 16) * 24 + (order % 7) - 3,
    screenScale: layout.getScale(FIELD_AREA),
    x,
    y,
  };
}

function getStackedTarget(
  layout: BoardLayout,
  target: ScreenTarget,
  stackIndex: number,
  cardKey: string,
  baseRotationDegrees: number
): CardVisualGeometry {
  const hash = hashString(`${cardKey}:${stackIndex}`);
  const fieldTarget = unmapApproximateFieldPoint(layout, target.x, target.y);
  const cappedIndex = Math.min(stackIndex, 54);
  const offsetX = getSignedHashUnit(hash, 0) * 7 + cappedIndex * 0.05;
  const offsetY = getSignedHashUnit(hash, 8) * 5 + cappedIndex * 0.18;
  const [x, y] = layout.mapPoint(
    [fieldTarget[0] + offsetX, fieldTarget[1] + offsetY],
    FIELD_AREA
  );

  return {
    rotationDegrees: baseRotationDegrees + getSignedHashUnit(hash, 16) * 9,
    screenScale: layout.getScale(FIELD_AREA),
    x,
    y,
  };
}

function unmapApproximateFieldPoint(
  layout: BoardLayout,
  screenX: number,
  screenY: number
): [number, number] {
  const scale = layout.getScale(FIELD_AREA);
  if (scale <= 0) {
    return [FIELD_LEFT + FIELD_SIZE / 2, FIELD_TOP + FIELD_SIZE / 2];
  }
  const [fieldLeft, fieldTop] = layout.mapPoint(
    [FIELD_LEFT, FIELD_TOP],
    FIELD_AREA
  );
  return [
    FIELD_LEFT + (screenX - fieldLeft) / scale,
    FIELD_TOP + (screenY - fieldTop) / scale,
  ];
}

function getTallyViews(
  plan: RoundEndPlan,
  elapsedMs: number
): RoundEndTallyView[] {
  if (elapsedMs < POUNCE_START_MS) {
    return [];
  }

  return plan.playerPlans.map((playerPlan) => {
    const pounceCardsTallied =
      elapsedMs >= SETTLE_START_MS
        ? playerPlan.pounceCardKeys.length
        : playerPlan.pounceCardKeys.filter((cardKey, index) => {
            return (
              elapsedMs >=
              POUNCE_START_MS + getPounceDelayMs(index) + 360
            );
          }).length;
    const centerCardsTallied =
      elapsedMs >= SETTLE_START_MS
        ? playerPlan.centerCardKeys.length
        : playerPlan.centerCardKeys.filter((cardKey, index) => {
            const cardPlan = plan.cardPlans[cardKey];
            return (
              cardPlan != null &&
              elapsedMs >=
                SORT_START_MS +
                  getSortDelayMs(cardPlan.sortOrder, cardPlan.playerIndex) +
                  560
            );
          }).length;
    const displayedScore =
      elapsedMs >= SETTLE_START_MS
        ? playerPlan.finalScore
        : centerCardsTallied - pounceCardsTallied * 2;

    return {
      color: playerPlan.color,
      name: playerPlan.name,
      playerIndex: playerPlan.playerIndex,
      score: displayedScore,
      x: playerPlan.target.labelX,
      y: playerPlan.target.labelY,
    };
  });
}

function getFinalRoundScore(player: PlayerState): number {
  for (let index = player.scores.length - 1; index >= 0; index--) {
    const score = player.scores[index];
    if (typeof score === "number" && Number.isFinite(score)) {
      return score;
    }
  }
  return 0;
}

function getRoundKey(board: BoardState): string | null {
  if (board.pouncer == null) {
    return null;
  }
  return [
    board.pouncer,
    board.players.map((player) => player.scores.length).join("."),
  ].join(":");
}

function getPhase(elapsedMs: number): RoundEndPhase {
  if (elapsedMs < POUNCE_START_MS) {
    return "announce";
  }
  if (elapsedMs < GATHER_START_MS) {
    return "pouncePenalty";
  }
  if (elapsedMs < SORT_START_MS) {
    return "gatherCenter";
  }
  if (elapsedMs < SETTLE_START_MS) {
    return "sortCenter";
  }
  return "settled";
}

function getTallyAngle(order: number, playerCount: number): number {
  if (playerCount <= 1) {
    return -Math.PI / 2;
  }
  if (playerCount === 2) {
    return Math.PI + order * Math.PI;
  }
  return -Math.PI / 2 + (order / playerCount) * Math.PI * 2;
}

function getPounceDelayMs(order: number): number {
  return Math.min(320, order * 34);
}

function getGatherDelayMs(order: number): number {
  return Math.min(380, order * 5);
}

function getSortDelayMs(order: number, playerIndex: number): number {
  return Math.min(560, order * 16 + playerIndex * 22);
}

function getCardKey(card: CardState): string {
  return `${card.player}:${card.value}_${card.suit}`;
}

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function getScoreKind(score: number): "negative" | "positive" | "zero" {
  if (score > 0) {
    return "positive";
  }
  if (score < 0) {
    return "negative";
  }
  return "zero";
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return prefersReducedMotion;
}

function getAnimationNow(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getHashUnit(hash: number, shift: number): number {
  return ((hash >>> shift) & 0xff) / 255;
}

function getSignedHashUnit(hash: number, shift: number): number {
  return getHashUnit(hash, shift) * 2 - 1;
}
