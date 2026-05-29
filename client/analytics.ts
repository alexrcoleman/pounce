import { useCallback, useEffect, useRef } from "react";
import { useStatsigClient } from "@statsig/react-bindings";

import type { BoardState } from "../shared/GameUtils";

export const STATSIG_CLIENT_KEY =
  process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY ||
  "client-FPo2EJFHpq8eJVCwcMxbif9A4m50dAo810coWawscmT";

export const STATSIG_USER = {
  custom: {
    app: "pounce",
  },
};

export const STATSIG_OPTIONS = {
  environment: {
    tier: process.env.NODE_ENV,
  },
  includeCurrentPageUrlWithEvents: false,
};

type StatsigLogEvent = (
  eventName: string,
  value?: string | number,
  metadata?: Record<string, string>
) => void;

export type AnalyticsMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

export type RoomEntryKind = "create" | "join" | "invite" | "offline";

export type PendingRoomEntry = {
  kind: RoomEntryKind;
  roomId: string;
  createdAt: number;
};

const PENDING_ROOM_ENTRY_STORAGE_KEY = "pounce::pendingRoomEntry";
const PENDING_ROOM_ENTRY_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_METADATA_VALUE_LENGTH = 1000;

export function useStatsigLogger() {
  const { logEvent } = useStatsigClient();
  const logEventRef = useRef(logEvent);

  useEffect(() => {
    logEventRef.current = logEvent;
  }, [logEvent]);

  return useCallback(
    (
      eventName: string,
      metadata?: AnalyticsMetadata,
      value?: string | number
    ) => {
      logStatsigEvent(logEventRef.current, eventName, metadata, value);
    },
    []
  );
}

export function logStatsigEvent(
  logEvent: StatsigLogEvent,
  eventName: string,
  metadata?: AnalyticsMetadata,
  value?: string | number
) {
  try {
    logEvent(eventName, value, normalizeAnalyticsMetadata(metadata));
  } catch (error) {
    console.warn("Unable to log Statsig event", eventName, error);
  }
}

export function markPendingRoomEntry(
  kind: RoomEntryKind,
  roomId: string
): void {
  if (typeof window === "undefined") {
    return;
  }

  const entry: PendingRoomEntry = {
    kind,
    roomId: normalizeRoomId(roomId),
    createdAt: Date.now(),
  };

  try {
    window.sessionStorage.setItem(
      PENDING_ROOM_ENTRY_STORAGE_KEY,
      JSON.stringify(entry)
    );
  } catch (error) {
    console.warn("Unable to remember pending room entry", error);
  }
}

export function takePendingRoomEntry(
  roomId: string | null | undefined
): PendingRoomEntry | null {
  if (typeof window === "undefined" || !roomId) {
    return null;
  }

  const entry = readPendingRoomEntry();
  if (!entry) {
    return null;
  }

  const isExpired = Date.now() - entry.createdAt > PENDING_ROOM_ENTRY_MAX_AGE_MS;
  const isRoomMatch = entry.roomId === normalizeRoomId(roomId);
  if (isExpired || isRoomMatch) {
    clearPendingRoomEntry();
  }

  return !isExpired && isRoomMatch ? entry : null;
}

export function getRouteAnalyticsMetadata(
  route: string,
  asPath: string
): AnalyticsMetadata {
  const [pathWithoutHash] = asPath.split("#");
  const [pathWithoutQuery, query = ""] = pathWithoutHash.split("?");
  const queryKeys = getQueryKeys(query);

  return {
    route,
    path: route.includes("[") ? route : pathWithoutQuery || route,
    has_query: queryKeys.length > 0,
    query_keys: queryKeys.join(","),
  };
}

export function getRoomAnalyticsMetadata(
  roomId: string | null | undefined,
  board: BoardState | null | undefined,
  extra?: AnalyticsMetadata
): AnalyticsMetadata {
  return {
    room_id: roomId ?? "unknown",
    is_offline: roomId?.toLowerCase() === "offline",
    ...getBoardAnalyticsMetadata(board),
    ...extra,
  };
}

export function truncateAnalyticsValue(
  value: string | null | undefined,
  maxLength = MAX_METADATA_VALUE_LENGTH
): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

function normalizeAnalyticsMetadata(
  metadata?: AnalyticsMetadata
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (value == null) {
      return;
    }

    normalized[key] = truncateAnalyticsValue(String(value)) ?? "";
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function getBoardAnalyticsMetadata(
  board: BoardState | null | undefined
): AnalyticsMetadata {
  if (!board) {
    return {};
  }

  const activePlayers = board.players.filter(
    (player) => player.isSpectating !== true
  );
  const humanPlayers = activePlayers.filter((player) => player.socketId != null);
  const connectedHumanPlayers = humanPlayers.filter(
    (player) => player.disconnected !== true
  );
  const aiPlayers = activePlayers.filter((player) => player.socketId == null);
  const roundNumber = board.players.reduce(
    (max, player) => Math.max(max, player.scores.length),
    0
  );

  return {
    player_count: board.players.length,
    active_player_count: activePlayers.length,
    human_player_count: humanPlayers.length,
    connected_human_player_count: connectedHumanPlayers.length,
    ai_player_count: aiPlayers.length,
    spectator_count: board.players.length - activePlayers.length,
    disconnected_player_count: board.players.filter(
      (player) => player.disconnected === true
    ).length,
    round_number: roundNumber,
    is_active: board.isActive,
    is_dealt: board.isDealt,
    is_paused: board.isPaused,
    starts_with_countdown: board.roundStartsAt != null,
  };
}

function readPendingRoomEntry(): PendingRoomEntry | null {
  try {
    const rawEntry = window.sessionStorage.getItem(
      PENDING_ROOM_ENTRY_STORAGE_KEY
    );
    if (!rawEntry) {
      return null;
    }

    const entry = JSON.parse(rawEntry) as Partial<PendingRoomEntry>;
    if (
      !isRoomEntryKind(entry.kind) ||
      typeof entry.roomId !== "string" ||
      typeof entry.createdAt !== "number"
    ) {
      clearPendingRoomEntry();
      return null;
    }

    return {
      kind: entry.kind,
      roomId: normalizeRoomId(entry.roomId),
      createdAt: entry.createdAt,
    };
  } catch (error) {
    console.warn("Unable to read pending room entry", error);
    clearPendingRoomEntry();
    return null;
  }
}

function clearPendingRoomEntry(): void {
  try {
    window.sessionStorage.removeItem(PENDING_ROOM_ENTRY_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear pending room entry", error);
  }
}

function isRoomEntryKind(kind: unknown): kind is RoomEntryKind {
  return (
    kind === "create" ||
    kind === "join" ||
    kind === "invite" ||
    kind === "offline"
  );
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase();
}

function getQueryKeys(query: string): string[] {
  if (!query) {
    return [];
  }

  const params = new URLSearchParams(query);
  const keys: string[] = [];
  params.forEach((_value, key) => {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  });
  return keys.sort();
}
