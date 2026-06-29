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
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  getPlayerLocation,
} from "../shared/CardLocations";
import {
  FIELD_LEFT,
  FIELD_SIZE,
  FIELD_TOP,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  type BoardLayout,
  useBoardLayout,
} from "./BoardLayout";
import type { CardLocation, CardScreenGeometry } from "./cardGeometry";
import useIsomorphicLayoutEffect from "./useIsomorphicLayoutEffect";
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
  isAnimating?: boolean;
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

type RoundEndStageDefinition = {
  durationMs: number;
  stage: RoundEndPhase;
};

const ROUND_END_SEQUENCE_TIME_SCALE = 1.5;
const ROUND_END_MOTION_SPEED = 1;
const ROUND_END_STAGES = [
  { stage: "announce", durationMs: scaleSequenceMs(1000) },
  { stage: "pouncePenalty", durationMs: scaleSequenceMs(500) },
  { stage: "gatherCenter", durationMs: scaleSequenceMs(750) },
  { stage: "sortCenter", durationMs: scaleSequenceMs(2000) },
  { stage: "settled", durationMs: scaleSequenceMs(600) },
] as const satisfies readonly RoundEndStageDefinition[];
const TOTAL_SEQUENCE_MS = ROUND_END_STAGES.reduce(
  (total, stage) => total + stage.durationMs,
  0
);
const ANNOUNCE_MS = getStageDuration("announce");
const SORT_STAGE_DURATION = getStageDuration("sortCenter");
const POUNCE_STAGE_DURATION = getStageDuration("pouncePenalty");
const POUNCE_START_MS = getStartTime("pouncePenalty");
const GATHER_START_MS = getStartTime("gatherCenter");
const SORT_START_MS = getStartTime("sortCenter");
const SETTLE_START_MS = getStartTime("settled");
const NON_CEREMONY_FADE_MS = scaleMotionMs(260);
const POUNCE_MOVE_MS = scaleMotionMs(350);
const GATHER_MOVE_MS = scaleMotionMs(640);
const SORT_MOVE_MS = scaleMotionMs(760);
const POUNCE_TALLY_OFFSET_MS = Math.round(POUNCE_MOVE_MS * 0.8);
const CENTER_TALLY_OFFSET_MS = Math.round(SORT_MOVE_MS * 0.8);
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

  useIsomorphicLayoutEffect(() => {
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
    const isSorting = elapsedMs >= SORT_START_MS;
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
              transitionDurationMs: NON_CEREMONY_FADE_MS,
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
          transitionDurationMs: POUNCE_MOVE_MS,
          transitionEasing: "ease-in-out",
          zIndex: cardPlan.zIndex,
        };
      }

      if (location.type !== "field_stack" || elapsedMs < GATHER_START_MS) {
        return null;
      }

      const isSortingThisCard = elapsedMs >= SORT_START_MS +
                getSortDelayMs(cardPlan.sortOrder, cardPlan.playerIndex) + SORT_MOVE_MS * .2
      return {
        faceUp: false,
        geometry:
          isSorting || !cardPlan.gatherTarget
            ? cardPlan.finalTarget
            : cardPlan.gatherTarget,
        transitionDelayMs: isSorting
          ? getSortDelayMs(cardPlan.sortOrder, cardPlan.playerIndex)
          : getGatherDelayMs(cardPlan.sortOrder),
        transitionDurationMs: isSorting ? SORT_MOVE_MS : GATHER_MOVE_MS,
        transitionEasing: "ease-in-out",
        zIndex: cardPlan.zIndex + (isSorting ? 450 : 0) + (isSortingThisCard ? cardPlan.sortOrder * 2 : 0),
      };
    };

    return {
      getCardPresentation,
      isAnimating,
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
        <div
          className={styles.announcement}
          role="status"
          style={
            {
              "--round-end-announcement-duration": `${ANNOUNCE_MS}ms`,
            } as CSSProperties
          }
        >
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
        target: getPlayerTallyTarget(layout, playerIndex),
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
        zIndex: CEREMONY_CARD_Z_INDEX + 600 + -centerOrder,
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
  playerIndex: number
): ScreenTarget {
  const activePlayerIndex = layout.fullSizePlayerIndices[0] ?? playerIndex;
  const playerArea = { type: "player", playerIndex } as const;
  const [playerLeft, playerTop] = getPlayerLocation(
    playerIndex,
    activePlayerIndex
  );
  const localX = playerLeft + PLAYER_WIDTH / 2 - CARD_WIDTH / 2;
  const localY = playerTop + PLAYER_HEIGHT / 2 - CARD_HEIGHT / 2;
  const [x, y] = layout.mapPoint([localX, localY], playerArea);
  const [labelX, labelY] = layout.mapPoint(
    [localX + CARD_WIDTH / 2, localY - 14],
    playerArea
  );

  return {
    labelX,
    labelY,
    rotationDegrees: 0,
    screenScale: layout.getScale(playerArea),
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
  const radius = 10 + getHashUnit(hash, 8) * 100;
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
  target: ScreenTarget,
  stackIndex: number,
  cardKey: string,
  baseRotationDegrees: number
): CardVisualGeometry {
  const hash = hashString(`${cardKey}:${stackIndex}`);
  const cappedIndex = Math.min(stackIndex, 54);
  const offsetX = getSignedHashUnit(hash, 0) * 7 + cappedIndex * 0.05;
  const offsetY = getSignedHashUnit(hash, 8) * 5 + cappedIndex * 0.18;

  return {
    rotationDegrees: baseRotationDegrees + getSignedHashUnit(hash, 16) * 9,
    screenScale: target.screenScale,
    x: target.x + offsetX * target.screenScale,
    y: target.y + offsetY * target.screenScale,
  };
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
                POUNCE_START_MS +
                getPounceDelayMs(index) +
                POUNCE_TALLY_OFFSET_MS
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
                  CENTER_TALLY_OFFSET_MS
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

function getStageDuration(stageName: RoundEndPhase): number {
  return (
    ROUND_END_STAGES.find((stage) => stage.stage === stageName)?.durationMs ?? 0
  );
}

function getStartTime(stageName: RoundEndPhase): number {
  let elapsedMs = 0;
  for (const stage of ROUND_END_STAGES) {
    if (stage.stage === stageName) {
      return elapsedMs;
    }
    elapsedMs += stage.durationMs;
  }
  return elapsedMs;
}

function getPhase(elapsedMs: number): RoundEndPhase {
  let elapsedBeforeStage = 0;
  for (const stage of ROUND_END_STAGES) {
    if (elapsedMs < elapsedBeforeStage + stage.durationMs) {
      return stage.stage;
    }
    elapsedBeforeStage += stage.durationMs;
  }
  return "settled";
}

function getPounceDelayMs(order: number): number {
  return scaleMotionMs(Math.min(POUNCE_STAGE_DURATION * .9, order * 50));
}

function getGatherDelayMs(order: number): number {
  return scaleMotionMs(Math.min(380, order * 5));
}

function getSortDelayMs(order: number, playerIndex: number): number {
  return scaleMotionMs(Math.min(SORT_STAGE_DURATION * .9, order * 50 + playerIndex * 0));
}

function scaleSequenceMs(durationMs: number): number {
  return Math.round(durationMs * ROUND_END_SEQUENCE_TIME_SCALE);
}

function scaleMotionMs(durationMs: number): number {
  return Math.round(durationMs / ROUND_END_MOTION_SPEED);
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
