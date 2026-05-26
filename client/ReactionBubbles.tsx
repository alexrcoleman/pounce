import type { CSSProperties } from "react";
import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import type { BoardState } from "../shared/GameUtils";
import { getPlayerLocation } from "../shared/CardLocations";
import { getReactionOption, type PlayerReaction } from "../shared/Reactions";
import type { BoardLayout } from "./BoardLayout";
import { useBoardLayout } from "./BoardLayout";
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
          "--reaction-drift": `${anchor.drift}px`,
          "--reaction-rise": `${anchor.rise}px`,
          "--reaction-rotation": `${anchor.rotation}deg`,
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
  const area = { type: "player", playerIndex: reaction.playerIndex } as const;
  const scale = layout.getScale(area);
  if (scale <= 0.05) {
    return null;
  };

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
  const xNudge = ((hash >>> 5) % 89) - 44;
  const yNudge = (hash >>> 11) % 18;
  const [x, y] = layout.mapPoint(
    [
      HAND_PLATE_LEFT + HAND_PLATE_WIDTH / 2 + xNudge,
      playerTop +
        plateTopOffset +
        Math.min(plateHeight - 34, REACTION_PLATE_TOP_OFFSET + yNudge),
    ],
    area
  );

  return {
    drift: ((hash >>> 17) % 53) - 26,
    rise: 180 + ((hash >>> 23) % 80),
    rotation: ((hash >>> 28) % 19) - 9,
    x,
    y,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
