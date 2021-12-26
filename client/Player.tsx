import { PlayerState } from "../shared/GameUtils";
import joinClasses from "./joinClasses";
import styles from "./Player.module.css";

type Props = {
  player: PlayerState;
  top: number;
  index: number;
};

export default function Player({ top, player, index }: Props) {
  return (
    <div
      className={styles.card}
      style={{
        borderColor: player.color,
        top: top + 15,
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
        {player.name} (Current: {player.currentPoints})
      </span>
    </div>
  );
}
