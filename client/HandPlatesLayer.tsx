import { observer } from "mobx-react-lite";
import type { CSSProperties } from "react";

import { getPlayerLocation } from "../shared/CardLocations";
import joinClasses from "./joinClasses";
import { useBoardLayout } from "./BoardLayout";
import { useClientContext } from "./ClientContext";
import styles from "./HandPlatesLayer.module.css";

const HAND_PLATE_LEFT = -20;
const HAND_PLATE_TOP_OFFSET = 36;
const HAND_PLATE_WIDTH = 528;
const HAND_PLATE_HEIGHT = 168;
const COMPACT_ACTIVE_HAND_PLATE_TOP_OFFSET = 24;
const COMPACT_ACTIVE_HAND_PLATE_HEIGHT = 196;

export default observer(function HandPlatesLayer() {
  const { state } = useClientContext();
  const board = state.board!;
  const layout = useBoardLayout();
  const activePlayerIndex = state.getActivePlayerIndex();

  return (
    <>
      {board.players.map((player, playerIndex) => {
        if (player.isSpectating) {
          return null;
        }

        const [, playerTop] = getPlayerLocation(
          playerIndex,
          activePlayerIndex
        );
        const isActivePlayer = playerIndex === activePlayerIndex;
        const isCompactActivePlayer =
          layout.mode === "compact" && isActivePlayer;
        const plateTopOffset = isCompactActivePlayer
          ? COMPACT_ACTIVE_HAND_PLATE_TOP_OFFSET
          : HAND_PLATE_TOP_OFFSET;
        const plateHeight = isCompactActivePlayer
          ? COMPACT_ACTIVE_HAND_PLATE_HEIGHT
          : HAND_PLATE_HEIGHT;
        const area = { type: "player", playerIndex } as const;
        const scale = layout.getScale(area);
        const [left, top] = layout.mapPoint(
          [HAND_PLATE_LEFT, playerTop + plateTopOffset],
          area
        );

        return (
          <div
            className={joinClasses(
              styles.plate,
              isActivePlayer && styles.activePlate
            )}
            key={player.socketId ?? playerIndex}
            style={
              {
                "--player-color": player.color,
                borderColor: player.color,
                transform: `translate(${left}px, ${top}px) scale(${scale})`,
                width: HAND_PLATE_WIDTH,
                height: plateHeight,
              } as CSSProperties
            }
          />
        );
      })}
    </>
  );
});
