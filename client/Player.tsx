import { PlayerState } from "../shared/GameUtils";
import styles from "./Player.module.css";

type Props = {
  player: PlayerState;
  index: number;
};

export default function Player({ player, index }: Props) {
  return (
    <div
      className={styles.card}
      style={{
        borderColor: player.color,
        top: index * 175 + 15,
      }}
    >
      {player.name}: {player.currentPoints} ({player.totalPoints} total)
    </div>
  );
}
