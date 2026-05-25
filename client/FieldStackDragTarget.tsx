import { CardDnDItem, isMultiCardSolitaireDrag } from "./CardDnDItem";
import { CardState } from "../shared/GameUtils";
import { useDrop } from "react-dnd";
import { useRef } from "react";
import { observer } from "mobx-react-lite";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FIELD_STACK_CARD_GAP,
} from "../shared/CardLocations";
import { CARD_BASE_SCALE } from "./cardLayout";
import styles from "./Board.module.css";

type Props = {
  card: CardState | null;
  stackHeight: number;
  onDrop: (source: CardDnDItem) => void;
  left: number;
  top: number;
  scale?: number;
  rotate: number;
  onUpdateDragTarget: (card: CardState) => void;
};

const buffer = 20;

export default observer(function FieldStackDragTarget({
  card,
  onDrop,
  stackHeight,
  left,
  top,
  scale = 1,
  rotate,
  onUpdateDragTarget,
}: Props) {
  const lastUpdateRef = useRef(0);
  const [{ isOver, canDrop, isDragging }, drop] = useDrop(
    () => ({
      accept: "card",
      drop: (item: CardDnDItem) => onDrop(item),
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
        isDragging: monitor.getItemType() === "card",
      }),
      canDrop: (item) =>
        card != null &&
        !isMultiCardSolitaireDrag(item) &&
        item.card.value === card.value + 1 &&
        item.card.suit === card.suit,
      hover: () => {
        if (Date.now() >= lastUpdateRef.current + 1000) {
          lastUpdateRef.current = Date.now();
          card && onUpdateDragTarget(card);
        }
      },
    }),
    [onDrop, card]
  );
  if (stackHeight === 0 || !isDragging) {
    return null;
  }
  const cardWidth = CARD_WIDTH * CARD_BASE_SCALE * scale;
  const cardHeight = CARD_HEIGHT * CARD_BASE_SCALE * scale;
  const stackGap = Math.max(stackHeight - 1, 0) * FIELD_STACK_CARD_GAP * scale;
  const targetWidth = cardWidth + 2 * buffer;
  const targetHeight = cardHeight + stackGap + 2 * buffer;
  return (
    <div
      className={styles.centerDragTarget}
      data-can-drop={canDrop ? "true" : "false"}
      data-is-over={isOver && canDrop ? "true" : "false"}
      style={{
        height: targetHeight,
        width: targetWidth,
        position: "absolute",
        transformOrigin: `${buffer + cardWidth / 2}px ${
          buffer + stackGap + cardHeight / 2
        }px`,
        transform: `translate(${left - buffer}px, ${
          top - buffer
        }px) rotate(${rotate}deg)`,
      }}
      ref={drop}
    />
  );
});
