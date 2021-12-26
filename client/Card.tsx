import type { BoardState, CardState, Suits, Values } from "../shared/GameUtils";
import { useEffect, useMemo, useRef, useState } from "react";

import CardFace from "./CardFace";
import React from "react";
import { SourceType } from "./CardDnDItem";
import joinClasses from "./joinClasses";
import styles from "./Card.module.css";
import { useDrag } from "react-dnd";
import usePrevious from "./usePrevious";

type Props = {
  boardState: BoardState;
  card: CardState;
  positionX: number;
  positionY: number;
  zIndex: number;
  /**
   * Whether the face of the card is up
   */
  faceUp: boolean;
  /**
   * Rotation to apply to the card, 0 being normal, .5 being upside down
   */
  rotation?: number;
  onClick?: () => void;
  onHover?: (card: CardState) => void;
  onDrag?: (dest: CardState) => void;
  source: SourceType;
  scaleDown: boolean;
};

/**
 * Renders a playing card at a given position.
 */
export default function Card({
  boardState,
  card,
  source,
  ...otherProps
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cardMemo = useMemo(() => card, [card.player, card.suit, card.value]);

  const sourceMemo = useMemo(() => source, [JSON.stringify(source)]);
  return (
    <CardContentMemo
      color={boardState.players[card.player].color}
      source={sourceMemo}
      card={cardMemo}
      {...otherProps}
    />
  );
}

const CardContentMemo = React.memo(function CardContent({
  positionX,
  positionY,
  zIndex,
  faceUp,
  card,
  onClick,
  onHover,
  source,
  color,
  rotation = 0,
  scaleDown,
}: Omit<Props, "boardState"> & {
  color: string;
}) {
  const { suit, value } = card;
  const [isAnimating, setIsAnimating] = useState(false);
  const offset = useRef(Math.random() * 2 - 1);
  const rotationOffset = useRef(Math.random() * 2 - 1);
  const item = useMemo(
    () =>
      source.type === "field_stack"
        ? { index: source.index }
        : { source, card },
    [source, card]
  );
  const [{ isDragging, isDraggingOther, canDrag }, drag] = useDrag(
    () =>
      source.type === "field_stack"
        ? {
            type: "field_stack",
            item,
            collect: (monitor) => ({
              isDragging: !!monitor.isDragging(),
              canDrag: monitor.canDrag(),
              isDraggingOther:
                monitor.getItem() != null && monitor.getItem() !== item,
            }),
            isDragging: (monitor) => {
              const dragItem = monitor.getItem();
              if (dragItem == item) {
                return true;
              }
              return dragItem.index === item.index;
            },
            canDrag: () => source.type === "field_stack" && source.isTopCard,
          }
        : {
            type: "card",
            item,
            collect: (monitor) => ({
              isDragging: !!monitor.isDragging(),
              canDrag: monitor.canDrag(),
              isDraggingOther:
                monitor.getItem() != null && monitor.getItem() !== item,
            }),
            isDragging: (monitor) => {
              if (monitor.getItem() == item) {
                return true;
              }
              const dragItem = monitor.getItem();
              if (dragItem.source == null || item.source == null) {
                return false;
              }
              return (
                dragItem.source.type === "solitaire" &&
                item.source.type === "solitaire" &&
                dragItem.source.pileIndex === item.source.pileIndex &&
                dragItem.source.slotIndex < item.source.slotIndex
              );
            },
            canDrag: () => source.type !== "other",
            // options: { dropEffect: "move" },
          },
    [source, card, positionX, positionY]
  );
  // For variance:
  const lastPx = usePrevious(positionX);
  if (positionX != lastPx) {
    offset.current = Math.random() * 2 - 1;
    // setRotation(Math.random() * 2 - 1);
  }

  // So moving cards are "lifted" while moving
  useEffect(() => {
    setIsAnimating(true);
    const t = setTimeout(() => {
      setIsAnimating(false);
    }, 1000 + zIndex);
    return () => clearTimeout(t);
  }, [positionX, positionY, zIndex]);

  return (
    <div
      className={joinClasses(
        styles.root,
        onClick != null && styles.clickable,
        canDrag && styles.draggable,
        suit === "clubs" || suit === "spades"
          ? styles.blackCard
          : styles.redCard
      )}
      style={
        {
          pointerEvents: isDraggingOther ? "none" : "",
          zIndex: zIndex + (isAnimating ? 1000 : 0),
          "--c": color,
          "--r":
            rotation * 360 +
            rotationOffset.current * (rotation != 0 ? 10 : 2) +
            "deg",
          "--x": positionX + offset.current * 2 + "px",
          "--y": positionY + "px",
          "--s": scaleDown ? ".9" : "1.1",
          opacity: isDragging ? 0.4 : 1,
        } as any
      }
      onMouseOver={() => onHover && onHover(card)}
      onTouchStart={() => onHover && onHover(card)}
      title={`${zIndex + 1} card(s)`}
      onClick={onClick}
      ref={drag}
    >
      <div className={joinClasses(styles.body, faceUp && styles.bodyFaceUp)}>
        <div
          className={styles.back}
          style={{
            backgroundColor: color,
          }}
        />
        <div className={styles.front}>
          <CardFace suit={suit} value={value} />
        </div>
      </div>
    </div>
  );
});
