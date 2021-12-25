import { PlayerState } from "../shared/GameUtils";
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
      }}
    >
      {player.name}: {player.currentPoints} ({player.totalPoints} total)
    </div>
  );
}
