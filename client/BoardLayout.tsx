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
const PLAYER_WIDTH = 480;
const PLAYER_HEIGHT = 225;
const COMPACT_BREAKPOINT = 700;
const COMPACT_PADDING = 12;
const COMPACT_TOP_PADDING = 42;
const COMPACT_GAP = 12;
const COMPACT_SMALL_GAP = 8;
const COMPACT_ACTIVE_LIFT = 24;

type Point = [number, number];

export type BoardLayoutMode = "standard" | "compact";
export type BoardLayoutArea =
  | { type: "field" }
  | { type: "player"; playerIndex: number };

type BoardLayout = {
  mode: BoardLayoutMode;
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
  zoom,
}: {
  activePlayerIndex: number;
  board: BoardState;
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
    () => createBoardLayout(playerCount, activePlayerIndex, viewport, zoom),
    [
      activePlayerIndex,
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
  viewport: Viewport,
  zoom: number
): BoardLayout {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return identityLayout;
  }

  const normalizedZoom = clamp(zoom, 0.5, 2);
  const shouldUseCompact =
    activePlayerIndex >= 0 &&
    viewport.width <= COMPACT_BREAKPOINT &&
    viewport.height > viewport.width;

  if (shouldUseCompact) {
    return createCompactLayout(
      playerCount,
      activePlayerIndex,
      viewport,
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
    mapPoint: ([x, y]) => [offsetX + x * scale, offsetY + y * scale],
    getScale: () => scale,
  };
}

function createCompactLayout(
  playerCount: number,
  activePlayerIndex: number,
  viewport: Viewport,
  zoom: number
): BoardLayout {
  const usableWidth = Math.max(1, viewport.width - COMPACT_PADDING * 2);
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
  const maxOpponentScale =
    opponents.length === 0
      ? 0
      : Math.min(0.32, opponentSlotWidth / PLAYER_WIDTH);
  const opponentScale = Math.min(maxOpponentScale, maxOpponentScale * zoom);
  const opponentRowHeight = PLAYER_HEIGHT * opponentScale;
  const opponentAreaHeight =
    opponentRows === 0
      ? 0
      : opponentRows * opponentRowHeight +
        (opponentRows - 1) * COMPACT_SMALL_GAP;

  const maxActiveScale = Math.min(0.68, usableWidth / PLAYER_WIDTH);
  const activeScale = Math.min(maxActiveScale, maxActiveScale * zoom);
  const activeHeight = PLAYER_HEIGHT * activeScale;
  const activeWidth = PLAYER_WIDTH * activeScale;
  const activeTop =
    viewport.height - COMPACT_PADDING - COMPACT_ACTIVE_LIFT - activeHeight;

  const topGap = opponentRows > 0 ? COMPACT_GAP : 0;
  const middleTop = COMPACT_TOP_PADDING + opponentAreaHeight + topGap;
  const middleHeight = activeTop - COMPACT_GAP - middleTop;
  const maxFieldScale = Math.min(
    1,
    usableWidth / FIELD_SIZE,
    Math.max(1, middleHeight) / FIELD_SIZE
  );
  const fieldScale = Math.max(
    0.1,
    Math.min(maxFieldScale, maxFieldScale * zoom)
  );
  const fieldSize = FIELD_SIZE * fieldScale;
  const fieldLeft = (viewport.width - fieldSize) / 2;
  const fieldTop = middleTop + Math.max(0, (middleHeight - fieldSize) / 2);

  const playerSlots = Array.from({ length: playerCount }, () => ({
    left: (viewport.width - activeWidth) / 2,
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
      rowCount * opponentSlotWidth + (rowCount - 1) * COMPACT_SMALL_GAP;
    const rowLeft = (viewport.width - rowWidth) / 2;
    const slotLeft = rowLeft + column * (opponentSlotWidth + COMPACT_SMALL_GAP);
    playerSlots[playerIndex] = {
      left: slotLeft + (opponentSlotWidth - PLAYER_WIDTH * opponentScale) / 2,
      top: COMPACT_TOP_PADDING + row * (opponentRowHeight + COMPACT_SMALL_GAP),
      scale: opponentScale,
    };
  });

  playerSlots[activePlayerIndex] = {
    left: (viewport.width - activeWidth) / 2,
    top: activeTop,
    scale: activeScale,
  };

  return {
    mode: "compact",
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
