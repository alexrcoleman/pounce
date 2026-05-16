import { observer } from "mobx-react-lite";
import { PlayerState } from "../shared/GameUtils";
import joinClasses from "./joinClasses";
import styles from "./Player.module.css";
import { getPlayerLocation } from "../shared/CardLocations";
import { useClientContext } from "./ClientContext";
import { useBoardLayout } from "./BoardLayout";

type Props = {
  player: PlayerState;
  playerIndex: number;
};

/**
 * Currently just shows the player's name and score on a badge, as well as pounce card count.
 */
export default observer(function PlayerArea({ player, playerIndex }: Props) {
  const { state } = useClientContext();
  const layout = useBoardLayout();
  const isStarted = state.board?.isActive ?? false;
  const [px, py] = getPlayerLocation(playerIndex, state.getActivePlayerIndex());
  const playerArea = { type: "player", playerIndex } as const;
  const scale = layout.getScale(playerArea);
  const [badgeLeft, badgeTop] = layout.mapPoint([5, py + 15], playerArea);
  const [countLeft, countTop] = layout.mapPoint([px - 60, py + 80], playerArea);
  return (
    <>
      <div
        className={styles.card}
        style={{
          borderColor: player.color,
          left: 0,
          top: 0,
          transform: `translate(${badgeLeft}px, ${badgeTop}px) scale(${scale})`,
          zIndex: 20000,
        }}
      >
        <div
          className={joinClasses(
            styles.connection,
            player.disconnected
              ? styles.disconnected
              : player.isSpectating && styles.spectating
          )}
          title={
            player.disconnected
              ? "Disconnected"
              : player.isSpectating
              ? "Spectating"
              : undefined
          }
        />
        <span>
          {player.name}
          {isStarted && ` (Current: ${player.currentPoints})`}
        </span>
      </div>

      {player.pounceDeck.length > 0 && (
        <div
          style={{
            zIndex: 10000,
            color: "white",
            fontSize: "12px",
            width: 55,
            textAlign: "center",
            position: "absolute",
            transform: `translate(${countLeft}px, ${countTop}px) scale(${scale})`,
            transformOrigin: "0% 0%",
          }}
        >
          {player.pounceDeck.length}
        </div>
      )}
    </>
  );
});
