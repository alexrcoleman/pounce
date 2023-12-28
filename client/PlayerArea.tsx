import { observer } from "mobx-react-lite";
import { PlayerState } from "../shared/GameUtils";
import joinClasses from "./joinClasses";
import styles from "./Player.module.css";
import SocketState from "./SocketState";
import { getPlayerLocation } from "../shared/CardLocations";
import { useClientContext } from "./ClientContext";

type Props = {
  player: PlayerState;
  playerIndex: number;
};

/**
 * Currently just shows the player's name and score on a badge, as well as pounce card count.
 */
export default observer(function PlayerArea({ player, playerIndex }: Props) {
  const { state } = useClientContext();
  const isStarted = state.board?.isActive ?? false;
  const [px, py] = getPlayerLocation(playerIndex, state.getActivePlayerIndex());
  return (
    <>
      <div
        className={styles.card}
        style={{
          borderColor: player.color,
          top: py + 15,
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
            transform: `translate(${px - 60}px, ${py + 80}px)`,
          }}
        >
          {player.pounceDeck.length}
        </div>
      )}
    </>
  );
});
