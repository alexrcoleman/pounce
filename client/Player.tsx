import { PlayerState } from "../shared/GameUtils";
import joinClasses from "./joinClasses";
import styles from "./Player.module.css";

type Props = {
  player: PlayerState;
  top: number;
  index: number;
};

export default function Player({ top, player, index }: Props) {
  console.log(player);
  return (
    <div
      className={styles.card}
      style={{
        borderColor: player.color,
        top: top + 15,
      }}
    >
      <div
        className={joinClasses(
          styles.connection,
          player.disconnected && styles.disconnected
        )}
      />
      <span>
        {player.name}: {player.currentPoints} ({player.totalPoints} total)
      </span>
    </div>
  );
}
