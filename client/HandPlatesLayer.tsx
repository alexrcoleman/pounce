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
        const area = { type: "player", playerIndex } as const;
        const scale = layout.getScale(area);
        const [left, top] = layout.mapPoint(
          [HAND_PLATE_LEFT, playerTop + HAND_PLATE_TOP_OFFSET],
          area
        );
        const isActivePlayer = playerIndex === activePlayerIndex;

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
                height: HAND_PLATE_HEIGHT,
              } as CSSProperties
            }
          />
        );
      })}
    </>
  );
});
