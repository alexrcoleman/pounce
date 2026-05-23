import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { BoardState } from "../shared/GameUtils";
import { getPlayerLocation } from "../shared/CardLocations";

export const FIELD_LEFT = 550;
export const FIELD_TOP = 50;
export const FIELD_SIZE = 577;

const PLAYER_LEFT = 0;
export const PLAYER_WIDTH = 480;
export const PLAYER_HEIGHT = 225;
const COMPACT_BREAKPOINT = 700;
const TABLET_PORTRAIT_BREAKPOINT = 1024;
const COMPACT_LANDSCAPE_MAX_WIDTH = 1180;
const COMPACT_LANDSCAPE_MAX_HEIGHT = 820;
const COMPACT_PADDING = 12;
const COMPACT_TOP_PADDING = 42;
const COMPACT_GAP = 12;
const COMPACT_SMALL_GAP = 8;
const COMPACT_ACTIVE_LIFT = 49;
const PLAYER_VISUAL_LEFT = -20;
const PLAYER_VISUAL_WIDTH = 528;
const TOUCH_LANDSCAPE_PADDING = 12;
const TOUCH_LANDSCAPE_GAP = 12;
const TOUCH_LANDSCAPE_TOP_PADDING = 42;
const TOUCH_LANDSCAPE_SIDE_WIDTH_RATIO = 0.5;
const TOUCH_LANDSCAPE_MAX_ACTIVE_SCALE = 1;

type Point = [number, number];

export type BoardLayoutMode = "standard" | "compact" | "touchLandscape";
export type BoardLayoutArea =
  | { type: "field" }
  | { type: "player"; playerIndex: number };

export type BoardLayout = {
  mode: BoardLayoutMode;
  focusedPlayerIndex: number | null;
  fullSizePlayerIndices: number[];
  mapPoint: (point: Point, area: BoardLayoutArea) => Point;
  getScale: (area: BoardLayoutArea) => number;
};

type PlayerSlot = {
  left: number;
  top: number;
  scale: number;
};

type Viewport = {
  width: number;
  height: number;
};

const identityLayout: BoardLayout = {
  mode: "standard",
  focusedPlayerIndex: null,
  fullSizePlayerIndices: [],
  mapPoint: (point) => point,
  getScale: () => 1,
};

const BoardLayoutContext = createContext<BoardLayout>(identityLayout);

export function BoardLayoutProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: BoardLayout;
}) {
  return (
    <BoardLayoutContext.Provider value={value}>
      {children}
    </BoardLayoutContext.Provider>
  );
}

export function useBoardLayout() {
  return useContext(BoardLayoutContext);
}

export function useResponsiveBoardLayout({
  activePlayerIndex,
  board,
  focusedPlayerIndex,
  isLeftHanded,
  isTouchDevice,
  zoom,
}: {
  activePlayerIndex: number;
  board: BoardState;
  focusedPlayerIndex: number | null;
  isLeftHanded: boolean;
  isTouchDevice: boolean;
  zoom: number;
}) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const ref = useCallback((element: HTMLDivElement | null) => {
    setNode(element);
  }, []);

  useEffect(() => {
    if (!node) {
      return;
    }
    const updateViewport = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateViewport);
      resizeObserver.observe(node);
    }

    return () => {
      window.removeEventListener("resize", updateViewport);
      resizeObserver?.disconnect();
    };
  }, [node]);

  const playerCount = board.players.length;
  const layout = useMemo(
    () =>
      createBoardLayout(
        playerCount,
        activePlayerIndex,
        focusedPlayerIndex,
        viewport,
        isTouchDevice,
        isLeftHanded,
        zoom
      ),
    [
      activePlayerIndex,
      focusedPlayerIndex,
      isLeftHanded,
      isTouchDevice,
      playerCount,
      viewport.height,
      viewport.width,
      zoom,
    ]
  );

  return { layout, ref };
}

function createBoardLayout(
  playerCount: number,
  activePlayerIndex: number,
  focusedPlayerIndex: number | null,
  viewport: Viewport,
  isTouchDevice: boolean,
  isLeftHanded: boolean,
  zoom: number
): BoardLayout {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return identityLayout;
  }

  const normalizedZoom = clamp(zoom, 0.5, 2);
  const shouldUseCompact =
    activePlayerIndex >= 0 &&
    (isTouchDevice ||
      viewport.width <= COMPACT_BREAKPOINT ||
      viewport.width <= TABLET_PORTRAIT_BREAKPOINT) &&
    viewport.height > viewport.width;
  const shouldUseTouchCompactSizing =
    isTouchDevice || viewport.width > COMPACT_BREAKPOINT;
  const shouldUseTouchLandscape =
    activePlayerIndex >= 0 &&
    viewport.width > viewport.height &&
    (isTouchDevice ||
      (viewport.width <= COMPACT_LANDSCAPE_MAX_WIDTH &&
        viewport.height <= COMPACT_LANDSCAPE_MAX_HEIGHT));

  if (shouldUseCompact) {
    return createCompactLayout(
      playerCount,
      activePlayerIndex,
      focusedPlayerIndex,
      viewport,
      shouldUseTouchCompactSizing,
      normalizedZoom
    );
  }

  if (shouldUseTouchLandscape) {
    return createTouchLandscapeLayout(
      playerCount,
      activePlayerIndex,
      viewport,
      isLeftHanded,
      normalizedZoom
    );
  }

  return createStandardLayout(
    playerCount,
    activePlayerIndex,
    viewport,
    normalizedZoom
  );
}

function createStandardLayout(
  playerCount: number,
  activePlayerIndex: number,
  viewport: Viewport,
  zoom: number
): BoardLayout {
  const bounds = getStandardBounds(playerCount, activePlayerIndex);
  const fitScale = Math.min(
    viewport.width / bounds.width,
    viewport.height / bounds.height
  );
  const baseScale = Math.min(1, fitScale);
  const scale = Math.max(0.1, Math.min(fitScale, baseScale * zoom));
  const offsetX =
    scale < 1 ? Math.max(0, (viewport.width - bounds.width * scale) / 2) : 0;
  const offsetY =
    scale < 1 ? Math.max(0, (viewport.height - bounds.height * scale) / 2) : 0;

  return {
    mode: "standard",
    focusedPlayerIndex: null,
    fullSizePlayerIndices:
      activePlayerIndex >= 0 ? [activePlayerIndex] : [],
    mapPoint: ([x, y]) => [offsetX + x * scale, offsetY + y * scale],
    getScale: () => scale,
  };
}

function createCompactLayout(
  playerCount: number,
  activePlayerIndex: number,
  focusedPlayerIndex: number | null,
  viewport: Viewport,
  useTouchSizing: boolean,
  zoom: number
): BoardLayout {
  const usableWidth = Math.max(1, viewport.width - COMPACT_PADDING * 2);
  const compactFocusPlayerIndex =
    focusedPlayerIndex != null &&
    focusedPlayerIndex >= 0 &&
    focusedPlayerIndex < playerCount &&
    focusedPlayerIndex !== activePlayerIndex
      ? focusedPlayerIndex
      : null;
  const opponents = Array.from({ length: playerCount }, (_, index) => index)
    .filter((index) => index !== activePlayerIndex);

  const opponentColumns =
    opponents.length >= 3
      ? Math.min(3, Math.ceil(opponents.length / 2))
      : Math.max(1, opponents.length);
  const opponentRows =
    opponents.length === 0 ? 0 : Math.ceil(opponents.length / opponentColumns);
  const opponentSlotWidth =
    opponents.length === 0
      ? 0
      : (usableWidth - COMPACT_SMALL_GAP * (opponentColumns - 1)) /
        opponentColumns;
  const zoomToFit = Math.min(zoom, 1);
  const activeScaleTarget = useTouchSizing
    ? (usableWidth / PLAYER_VISUAL_WIDTH) * zoomToFit
    : Math.min(0.68, usableWidth / PLAYER_WIDTH) * zoomToFit;
  const opponentScaleTarget =
    opponents.length === 0
      ? 0
      : useTouchSizing
      ? (opponentSlotWidth / PLAYER_VISUAL_WIDTH) * zoomToFit
      : Math.min(0.32, opponentSlotWidth / PLAYER_WIDTH) * zoomToFit;
  const fieldScaleTarget =
    (useTouchSizing
      ? usableWidth / FIELD_SIZE
      : Math.min(1, usableWidth / FIELD_SIZE)) * zoomToFit;
  const topGap = opponents.length > 0 ? COMPACT_GAP : 0;
  const opponentRowGap =
    opponentRows > 0 ? (opponentRows - 1) * COMPACT_SMALL_GAP : 0;
  const compactFixedHeight =
    COMPACT_TOP_PADDING +
    topGap +
    COMPACT_GAP +
    COMPACT_PADDING +
    COMPACT_ACTIVE_LIFT +
    opponentRowGap;
  const scaledTargetHeight =
    (compactFocusPlayerIndex != null
      ? PLAYER_HEIGHT * activeScaleTarget
      : opponentRows * PLAYER_HEIGHT * opponentScaleTarget) +
    FIELD_SIZE * fieldScaleTarget +
    PLAYER_HEIGHT * activeScaleTarget;
  const verticalScale =
    useTouchSizing && scaledTargetHeight > 0
      ? Math.min(
          1,
          Math.max(0.1, (viewport.height - compactFixedHeight) / scaledTargetHeight)
        )
      : 1;
  const activeScale = Math.max(0.1, activeScaleTarget * verticalScale);
  const activeHeight = PLAYER_HEIGHT * activeScale;
  const activeTop =
    viewport.height - COMPACT_PADDING - COMPACT_ACTIVE_LIFT - activeHeight;

  const opponentScale = Math.max(0, opponentScaleTarget * verticalScale);
  const opponentRowHeight = PLAYER_HEIGHT * opponentScale;
  const opponentAreaHeight =
    compactFocusPlayerIndex != null
      ? activeHeight
      : opponentRows === 0
      ? 0
      : opponentRows * opponentRowHeight +
        (opponentRows - 1) * COMPACT_SMALL_GAP;

  const middleTop = COMPACT_TOP_PADDING + opponentAreaHeight + topGap;
  const middleHeight = activeTop - COMPACT_GAP - middleTop;
  const maxFieldScale = Math.min(
    fieldScaleTarget * verticalScale,
    Math.max(1, middleHeight) / FIELD_SIZE
  );
  const fieldScale = Math.max(0.1, maxFieldScale);
  const fieldSize = FIELD_SIZE * fieldScale;
  const fieldLeft = (viewport.width - fieldSize) / 2;
  const fieldTop = middleTop + Math.max(0, (middleHeight - fieldSize) / 2);

  const playerSlots = Array.from({ length: playerCount }, () => ({
    left: getCenteredPlayerSlotLeft(0, viewport.width, activeScale),
    top: activeTop,
    scale: activeScale,
  }));

  if (compactFocusPlayerIndex != null) {
    opponents.forEach((playerIndex) => {
      const isFocusedPlayer = playerIndex === compactFocusPlayerIndex;
      playerSlots[playerIndex] = {
        left: isFocusedPlayer
          ? getCenteredPlayerSlotLeft(0, viewport.width, activeScale)
          : viewport.width / 2,
        top: isFocusedPlayer
          ? COMPACT_TOP_PADDING
          : COMPACT_TOP_PADDING + activeHeight / 2,
        scale: isFocusedPlayer ? activeScale : 0,
      };
    });
  } else {
    opponents.forEach((playerIndex, order) => {
      const row = Math.floor(order / opponentColumns);
      const column = order % opponentColumns;
      const rowCount =
        row === opponentRows - 1
          ? opponents.length - row * opponentColumns
          : opponentColumns;
      const rowWidth =
        rowCount * opponentSlotWidth + (rowCount - 1) * COMPACT_SMALL_GAP;
      const rowLeft = (viewport.width - rowWidth) / 2;
      const slotLeft =
        rowLeft + column * (opponentSlotWidth + COMPACT_SMALL_GAP);
      playerSlots[playerIndex] = {
        left: getCenteredPlayerSlotLeft(
          slotLeft,
          opponentSlotWidth,
          opponentScale
        ),
        top:
          COMPACT_TOP_PADDING + row * (opponentRowHeight + COMPACT_SMALL_GAP),
        scale: opponentScale,
      };
    });
  }

  playerSlots[activePlayerIndex] = {
    left: getCenteredPlayerSlotLeft(0, viewport.width, activeScale),
    top: activeTop,
    scale: activeScale,
  };

  return {
    mode: "compact",
    focusedPlayerIndex: compactFocusPlayerIndex,
    fullSizePlayerIndices:
      compactFocusPlayerIndex != null
        ? [activePlayerIndex, compactFocusPlayerIndex]
        : [activePlayerIndex],
    mapPoint: ([x, y], area) => {
      if (area.type === "field") {
        return [
          fieldLeft + (x - FIELD_LEFT) * fieldScale,
          fieldTop + (y - FIELD_TOP) * fieldScale,
        ];
      }

      const slot =
        playerSlots[area.playerIndex] ?? playerSlots[activePlayerIndex];
      const [, playerTop] = getPlayerLocation(
        area.playerIndex,
        activePlayerIndex
      );
      return [
        slot.left + (x - PLAYER_LEFT) * slot.scale,
        slot.top + (y - playerTop) * slot.scale,
      ];
    },
    getScale: (area) =>
      area.type === "field"
        ? fieldScale
        : (playerSlots[area.playerIndex] ?? playerSlots[activePlayerIndex])
            .scale,
  };
}

function createTouchLandscapeLayout(
  playerCount: number,
  activePlayerIndex: number,
  viewport: Viewport,
  isLeftHanded: boolean,
  zoom: number
): BoardLayout {
  const usableHeight = Math.max(1, viewport.height - TOUCH_LANDSCAPE_PADDING * 2);
  const sideWidth = Math.max(
    1,
    Math.min(
      viewport.width * TOUCH_LANDSCAPE_SIDE_WIDTH_RATIO,
      viewport.width - TOUCH_LANDSCAPE_PADDING * 2
    )
  );
  const zoomToFit = Math.min(zoom, 1);
  const activeScale = Math.max(
    0.1,
    Math.min(
      TOUCH_LANDSCAPE_MAX_ACTIVE_SCALE,
      sideWidth / PLAYER_VISUAL_WIDTH,
      (usableHeight * 0.58) / PLAYER_HEIGHT
    ) * zoomToFit
  );
  const activeVisualWidth = PLAYER_VISUAL_WIDTH * activeScale;
  const dockVisualLeft = isLeftHanded
    ? TOUCH_LANDSCAPE_PADDING
    : viewport.width - TOUCH_LANDSCAPE_PADDING - activeVisualWidth;
  const activeTop =
    viewport.height - TOUCH_LANDSCAPE_PADDING - PLAYER_HEIGHT * activeScale;
  const fieldRegionLeft = isLeftHanded
    ? dockVisualLeft + activeVisualWidth + TOUCH_LANDSCAPE_GAP
    : TOUCH_LANDSCAPE_PADDING;
  const fieldRegionRight = isLeftHanded
    ? viewport.width - TOUCH_LANDSCAPE_PADDING
    : dockVisualLeft - TOUCH_LANDSCAPE_GAP;
  const fieldRegionWidth = Math.max(1, fieldRegionRight - fieldRegionLeft);
  const fieldScale = Math.max(
    0.1,
    Math.min(fieldRegionWidth / FIELD_SIZE, usableHeight / FIELD_SIZE)
  );
  const fieldSize = FIELD_SIZE * fieldScale;
  const fieldLeft =
    fieldRegionLeft + Math.max(0, (fieldRegionWidth - fieldSize) / 2);
  const fieldTop =
    TOUCH_LANDSCAPE_PADDING + Math.max(0, (usableHeight - fieldSize) / 2);
  const opponents = Array.from({ length: playerCount }, (_, index) => index)
    .filter((index) => index !== activePlayerIndex);
  const useVerticalOpponentList = opponents.length <= 3;
  const opponentColumns = useVerticalOpponentList ? 1 : 2;
  const opponentRows =
    opponents.length === 0 ? 0 : Math.ceil(opponents.length / opponentColumns);
  const opponentSlotWidth =
    opponents.length === 0
      ? 0
      : (activeVisualWidth - TOUCH_LANDSCAPE_GAP * (opponentColumns - 1)) /
        opponentColumns;
  const opponentAreaHeight = Math.max(
    1,
    activeTop - TOUCH_LANDSCAPE_TOP_PADDING - TOUCH_LANDSCAPE_GAP
  );
  const opponentScale =
    opponents.length === 0
      ? 0
      : Math.max(
          0.1,
          Math.min(
            opponentSlotWidth / PLAYER_VISUAL_WIDTH,
            (opponentAreaHeight -
              Math.max(0, opponentRows - 1) * TOUCH_LANDSCAPE_GAP) /
              (opponentRows * PLAYER_HEIGHT),
            useVerticalOpponentList ? activeScale : activeScale * 0.58
          )
        );
  const opponentRowHeight = PLAYER_HEIGHT * opponentScale;
  const playerSlots = Array.from({ length: playerCount }, () => ({
    left: dockVisualLeft - PLAYER_VISUAL_LEFT * activeScale,
    top: activeTop,
    scale: activeScale,
  }));

  opponents.forEach((playerIndex, order) => {
    const row = Math.floor(order / opponentColumns);
    const column = order % opponentColumns;
    const rowCount =
      row === opponentRows - 1
        ? opponents.length - row * opponentColumns
        : opponentColumns;
    const rowWidth =
      rowCount * opponentSlotWidth + (rowCount - 1) * TOUCH_LANDSCAPE_GAP;
    const rowLeft = dockVisualLeft + (activeVisualWidth - rowWidth) / 2;
    const slotLeft = rowLeft + column * (opponentSlotWidth + TOUCH_LANDSCAPE_GAP);
    playerSlots[playerIndex] = {
      left: getCenteredPlayerSlotLeft(slotLeft, opponentSlotWidth, opponentScale),
      top:
        TOUCH_LANDSCAPE_TOP_PADDING +
        row * (opponentRowHeight + TOUCH_LANDSCAPE_GAP),
      scale: opponentScale,
    };
  });

  return {
    mode: "touchLandscape",
    focusedPlayerIndex: null,
    fullSizePlayerIndices: [activePlayerIndex],
    mapPoint: ([x, y], area) => {
      if (area.type === "field") {
        return [
          fieldLeft + (x - FIELD_LEFT) * fieldScale,
          fieldTop + (y - FIELD_TOP) * fieldScale,
        ];
      }

      const slot =
        playerSlots[area.playerIndex] ?? playerSlots[activePlayerIndex];
      const [, playerTop] = getPlayerLocation(
        area.playerIndex,
        activePlayerIndex
      );
      return [
        slot.left + (x - PLAYER_LEFT) * slot.scale,
        slot.top + (y - playerTop) * slot.scale,
      ];
    },
    getScale: (area) =>
      area.type === "field"
        ? fieldScale
        : (playerSlots[area.playerIndex] ?? playerSlots[activePlayerIndex])
            .scale,
  };
}

function getStandardBounds(playerCount: number, activePlayerIndex: number) {
  const relativeActivePlayerIndex =
    activePlayerIndex >= 0 ? activePlayerIndex : 0;
  let playerBottom = 0;
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    const [, y] = getPlayerLocation(playerIndex, relativeActivePlayerIndex);
    playerBottom = Math.max(playerBottom, y + PLAYER_HEIGHT + 20);
  }

  return {
    width: Math.max(FIELD_LEFT + FIELD_SIZE + 90, PLAYER_LEFT + PLAYER_WIDTH),
    height: Math.max(FIELD_TOP + FIELD_SIZE + 90, playerBottom),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getCenteredPlayerSlotLeft(
  regionLeft: number,
  regionWidth: number,
  scale: number
) {
  return (
    regionLeft +
    (regionWidth - PLAYER_VISUAL_WIDTH * scale) / 2 -
    PLAYER_VISUAL_LEFT * scale
  );
}
