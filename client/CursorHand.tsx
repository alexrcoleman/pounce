import CardFace from "./CardFace";
import { CardState } from "../shared/GameUtils";
import styles from "./CursorHand.module.css";
type Props = {
  x: number;
  y: number;
  color: string;
  card: CardState | null | undefined;
};
export default function CursorHand({ x, y, color, card }: Props) {
  return (
    <div
      className={styles.root}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        color: color,
      }}
    >
      <div className={styles.cursor}>➤</div>
      {card && (
        <div className={styles.card}>
          <CardFace value={card.value} suit={card.suit} />
        </div>
      )}
    </div>
  );
}
