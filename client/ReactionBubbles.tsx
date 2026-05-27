import type { CSSProperties } from "react";
import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import type { BoardState } from "../shared/GameUtils";
import { getPlayerLocation } from "../shared/CardLocations";
import { getReactionOption, type PlayerReaction } from "../shared/Reactions";
import {
  FIELD_LEFT,
  FIELD_SIZE,
  FIELD_TOP,
  type BoardLayout,
  useBoardLayout,
} from "./BoardLayout";
import { useClientContext } from "./ClientContext";
import {
  ACTIVE_HAND_PLATE_HEIGHT,
  COMPACT_ACTIVE_HAND_PLATE_HEIGHT,
  COMPACT_ACTIVE_HAND_PLATE_TOP_OFFSET,
  HAND_PLATE_HEIGHT,
  HAND_PLATE_LEFT,
  HAND_PLATE_TOP_OFFSET,
  HAND_PLATE_WIDTH,
} from "./HandPlatesLayer";
import styles from "./ReactionBubbles.module.css";

const REACTION_BUBBLE_DURATION_MS = 4800;
const REACTION_PLATE_TOP_OFFSET = 24;
const REACTION_FIELD_EDGE_INSET = 46;

export default observer(function ReactionBubbles() {
  const { state } = useClientContext();
  const board = state.board;
  const layout = useBoardLayout();
  const activePlayerIndex = state.getActivePlayerIndex();

  if (!board || state.reactions.length === 0) {
    return null;
  }

  return (
    <div aria-hidden="true" className={styles.layer}>
      {state.reactions.map((reaction) => (
        <ReactionBubble
          activePlayerIndex={activePlayerIndex}
          board={board}
          key={reaction.eventId}
          layout={layout}
          reaction={reaction}
        />
      ))}
    </div>
  );
});

function ReactionBubble({
  activePlayerIndex,
  board,
  layout,
  reaction,
}: {
  activePlayerIndex: number;
  board: BoardState;
  layout: BoardLayout;
  reaction: PlayerReaction;
}) {
  const { state } = useClientContext();
  const option = getReactionOption(reaction.reactionId);
  const anchor = getBubbleAnchor({
    activePlayerIndex,
    board,
    layout,
    reaction,
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => state.removeReaction(reaction.eventId),
      REACTION_BUBBLE_DURATION_MS
    );
    return () => window.clearTimeout(timeoutId);
  }, [reaction.eventId, state]);

  if (!option || !anchor) {
    return null;
  }

  return (
    <span
      className={styles.bubble}
      style={
        {
          "--reaction-color": reaction.playerColor,
          "--reaction-arc-x": `${anchor.arcX}px`,
          "--reaction-arc-y": `${anchor.arcY}px`,
          "--reaction-rotation": `${anchor.rotation}deg`,
          "--reaction-travel-x": `${anchor.travelX}px`,
          "--reaction-travel-y": `${anchor.travelY}px`,
          "--reaction-x": `${anchor.x}px`,
          "--reaction-y": `${anchor.y}px`,
        } as CSSProperties
      }
      title={`${reaction.playerName}: ${option.label}`}
    >
      {option.emoji}
    </span>
  );
}

function getBubbleAnchor({
  activePlayerIndex,
  board,
  layout,
  reaction,
}: {
  activePlayerIndex: number;
  board: BoardState;
  layout: BoardLayout;
  reaction: PlayerReaction;
}) {
  const player = board.players[reaction.playerIndex];
  if (!player || player.isSpectating) {
    return null;
  }

  const hash = hashString(reaction.eventId);
  const playerArea = {
    type: "player",
    playerIndex: reaction.playerIndex,
  } as const;
  const scale = layout.getScale(playerArea);
  if (scale <= 0.05) {
    return null;
  }

  const [, playerTop] = getPlayerLocation(
    reaction.playerIndex,
    activePlayerIndex
  );
  const isActivePlayer = reaction.playerIndex === activePlayerIndex;
  const isTouchFullSizePlayer =
    layout.mode !== "standard" &&
    layout.fullSizePlayerIndices.includes(reaction.playerIndex);
  const plateTopOffset = isTouchFullSizePlayer
    ? COMPACT_ACTIVE_HAND_PLATE_TOP_OFFSET
    : HAND_PLATE_TOP_OFFSET;
  const plateHeight = isTouchFullSizePlayer
    ? COMPACT_ACTIVE_HAND_PLATE_HEIGHT
    : isActivePlayer
    ? ACTIVE_HAND_PLATE_HEIGHT
    : HAND_PLATE_HEIGHT;
  const xNudge = (hash >>> 5) % 22;
  const yNudge = (hash >>> 11) % 18;
  const plateY =
    playerTop +
    plateTopOffset +
    Math.min(plateHeight - 34, REACTION_PLATE_TOP_OFFSET + yNudge);
  const fieldArea = { type: "field" } as const;
  const fieldCenter = layout.mapPoint(
    [FIELD_LEFT + FIELD_SIZE / 2, FIELD_TOP + FIELD_SIZE / 2],
    fieldArea
  );
  const [x, y] = getNearestPlateLaunchPoint({
    fieldCenter,
    layout,
    playerArea,
    plateY,
    xNudge,
  });
  const fieldTarget = getNearestFieldEdgeTarget({
    layout,
    startX: x,
    startY: y,
  });
  const travelX = fieldTarget.x - x;
  const travelY = fieldTarget.y - y;
  const travelLength = Math.hypot(travelX, travelY);
  const arcDistance = 18 + ((hash >>> 17) % 22);
  const arcSign = (hash >>> 23) % 2 === 0 ? 1 : -1;
  const arcX =
    travelLength > 0 ? (-travelY / travelLength) * arcDistance * arcSign : 0;
  const arcY =
    (travelLength > 0
      ? (travelX / travelLength) * arcDistance * arcSign
      : -arcDistance) - 18;

  return {
    rotation: ((hash >>> 28) % 19) - 9,
    arcX,
    arcY,
    travelX,
    travelY,
    x,
    y,
  };
}

function getNearestPlateLaunchPoint({
  fieldCenter,
  layout,
  playerArea,
  plateY,
  xNudge,
}: {
  fieldCenter: [number, number];
  layout: BoardLayout;
  playerArea: { type: "player"; playerIndex: number };
  plateY: number;
  xNudge: number;
}) {
  const launchXs = [
    HAND_PLATE_LEFT + 58 + xNudge,
    HAND_PLATE_LEFT + HAND_PLATE_WIDTH / 2 + xNudge - 11,
    HAND_PLATE_LEFT + HAND_PLATE_WIDTH - 58 - xNudge,
  ];

  return launchXs
    .map((launchX) => layout.mapPoint([launchX, plateY], playerArea))
    .reduce((nearest, point) =>
      getDistanceSquared(point, fieldCenter) <
      getDistanceSquared(nearest, fieldCenter)
        ? point
        : nearest
    );
}

function getNearestFieldEdgeTarget({
  layout,
  startX,
  startY,
}: {
  layout: BoardLayout;
  startX: number;
  startY: number;
}) {
  const fieldArea = { type: "field" } as const;
  const fieldScale = layout.getScale(fieldArea);
  const inset = REACTION_FIELD_EDGE_INSET * fieldScale;
  const [fieldLeft, fieldTop] = layout.mapPoint(
    [FIELD_LEFT, FIELD_TOP],
    fieldArea
  );
  const [fieldRight, fieldBottom] = layout.mapPoint(
    [FIELD_LEFT + FIELD_SIZE, FIELD_TOP + FIELD_SIZE],
    fieldArea
  );
  const targetLeft = Math.min(fieldLeft, fieldRight) + inset;
  const targetRight = Math.max(fieldLeft, fieldRight) - inset;
  const targetTop = Math.min(fieldTop, fieldBottom) + inset;
  const targetBottom = Math.max(fieldTop, fieldBottom) - inset;
  const clampedX = clamp(startX, targetLeft, targetRight);
  const clampedY = clamp(startY, targetTop, targetBottom);
  const edgeCandidates = [
    { x: targetLeft, y: clampedY },
    { x: targetRight, y: clampedY },
    { x: clampedX, y: targetTop },
    { x: clampedX, y: targetBottom },
  ];

  return edgeCandidates.reduce((nearest, point) =>
    getDistanceSquared([point.x, point.y], [startX, startY]) <
    getDistanceSquared([nearest.x, nearest.y], [startX, startY])
      ? point
      : nearest
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDistanceSquared(a: [number, number], b: [number, number]) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
