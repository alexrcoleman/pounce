import CardFace from "./CardFace";
import { CARD_HEIGHT } from "../shared/CardLocations";
import { CardState } from "../shared/GameUtils";
import styles from "./CursorHand.module.css";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type Props = {
  x: number;
  y: number;
  color: string;
  cards: CardState[];
  scale?: number;
};

const ITEM_APPEAR_DELAY_MS = 160;
const ITEM_APPEAR_MOVE_THRESHOLD_PX = 8;
const STACK_CARD_GAP = 18;

export default observer(function CursorHand({
  x,
  y,
  color,
  cards,
  scale = 1,
}: Props) {
  const [visibleCards, setVisibleCards] = useState(cards);
  const previousRef = useRef({
    cardKey: getCursorCardsKey(cards),
    x,
    y,
  });
  const updateVersionRef = useRef(0);

  useEffect(() => {
    const updateVersion = ++updateVersionRef.current;
    const previous = previousRef.current;
    const cardKey = getCursorCardsKey(cards);
    const movedDistance = Math.hypot(x - previous.x, y - previous.y);
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (cards.length === 0) {
      setVisibleCards([]);
    } else if (
      previous.cardKey == null &&
      movedDistance >= ITEM_APPEAR_MOVE_THRESHOLD_PX
    ) {
      setVisibleCards([]);
      timeout = setTimeout(() => {
        if (updateVersionRef.current === updateVersion) {
          setVisibleCards(cards);
        }
      }, ITEM_APPEAR_DELAY_MS);
    } else {
      setVisibleCards(cards);
    }

    previousRef.current = { cardKey, x, y };
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [cards, x, y]);

  return (
    <div
      className={styles.root}
      style={{
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        color: color,
      }}
    >
      <div className={styles.cursor}>➤</div>
      {visibleCards.length > 0 && (
        <div
          className={styles.cardStack}
          style={
            {
              "--cursor-stack-height": `${
                CARD_HEIGHT + (visibleCards.length - 1) * STACK_CARD_GAP
              }px`,
            } as CSSProperties
          }
        >
          {visibleCards.map((visibleCard, index) => (
            <div
              className={styles.card}
              key={getCursorCardKey(visibleCard)}
              style={
                {
                  "--cursor-card-top": `${index * STACK_CARD_GAP}px`,
                } as CSSProperties
              }
            >
              <CardFace value={visibleCard.value} suit={visibleCard.suit} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

function getCursorCardsKey(cards: CardState[]) {
  return cards.length > 0 ? cards.map(getCursorCardKey).join("|") : null;
}

function getCursorCardKey(card: CardState | null | undefined) {
  return card ? `${card.player}:${card.value}_${card.suit}` : null;
}
