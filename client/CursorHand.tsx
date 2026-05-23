import CardFace from "./CardFace";
import { CardState } from "../shared/GameUtils";
import styles from "./CursorHand.module.css";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";

type Props = {
  x: number;
  y: number;
  color: string;
  card: CardState | null | undefined;
  scale?: number;
};

const ITEM_APPEAR_DELAY_MS = 160;
const ITEM_APPEAR_MOVE_THRESHOLD_PX = 8;

export default observer(function CursorHand({
  x,
  y,
  color,
  card,
  scale = 1,
}: Props) {
  const [visibleCard, setVisibleCard] = useState(card);
  const previousRef = useRef({
    cardKey: getCursorCardKey(card),
    x,
    y,
  });
  const updateVersionRef = useRef(0);

  useEffect(() => {
    const updateVersion = ++updateVersionRef.current;
    const previous = previousRef.current;
    const cardKey = getCursorCardKey(card);
    const movedDistance = Math.hypot(x - previous.x, y - previous.y);
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (!card) {
      setVisibleCard(null);
    } else if (
      previous.cardKey == null &&
      movedDistance >= ITEM_APPEAR_MOVE_THRESHOLD_PX
    ) {
      setVisibleCard(null);
      timeout = setTimeout(() => {
        if (updateVersionRef.current === updateVersion) {
          setVisibleCard(card);
        }
      }, ITEM_APPEAR_DELAY_MS);
    } else {
      setVisibleCard(card);
    }

    previousRef.current = { cardKey, x, y };
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [card, x, y]);

  return (
    <div
      className={styles.root}
      style={{
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        color: color,
      }}
    >
      <div className={styles.cursor}>➤</div>
      {visibleCard && (
        <div className={styles.card}>
          <CardFace value={visibleCard.value} suit={visibleCard.suit} />
        </div>
      )}
    </div>
  );
});

function getCursorCardKey(card: CardState | null | undefined) {
  return card ? `${card.player}:${card.value}_${card.suit}` : null;
}
