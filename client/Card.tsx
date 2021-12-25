import type { BoardState, CardState, Suits, Values } from "../shared/GameUtils";
import { useEffect, useMemo, useRef, useState } from "react";

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

  const sourcePileIndex = source.type === "solitaire" ? source.pileIndex : null;
  const sourceSlotIndex = source.type === "solitaire" ? source.slotIndex : null;

  const sourceMemo = useMemo(
    () => source,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source.type, sourcePileIndex, sourceSlotIndex]
  );
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
  const suitColor = suit === "clubs" || suit === "spades" ? "black" : "red";
  const [isAnimating, setIsAnimating] = useState(false);
  const offset = useRef(Math.random() * 2 - 1);
  const rotationOffset = useRef(Math.random() * 2 - 1);
  const canDrag = source.type !== "other";
  const item = useMemo(() => ({ source, card }), [source, card]);
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: "card",
      item,
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging(),
      }),
      isDragging: (monitor) => {
        if (monitor.getItem() == item) {
          return true;
        }
        const dragItem = monitor.getItem();
        return (
          dragItem.source.type === "solitaire" &&
          item.source.type === "solitaire" &&
          dragItem.source.pileIndex === item.source.pileIndex &&
          dragItem.source.slotIndex < item.source.slotIndex
        );
      },
      canDrag: () => canDrag,
      // options: { dropEffect: "move" },
    }),
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
        canDrag && styles.draggable
      )}
      style={
        {
          zIndex: zIndex + (isAnimating ? 1000 : 0),
          color: suitColor,
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
      title={`${zIndex + 1} card(s)`}
      onClick={onClick}
      ref={drag}
    >
      <div
        className={styles.body}
        style={{
          transform: faceUp ? "rotateY(180deg)" : "",
        }}
      >
        <div
          className={styles.back}
          style={{
            backgroundColor: color,
          }}
        ></div>
        <CardFace suit={suit} value={value} />
      </div>
    </div>
  );
});

const CardFace = React.memo(function CardFace({
  value,
  suit,
}: {
  value: number;
  suit: string;
}) {
  const padding = 2;
  const valueText =
    value === 1
      ? "A"
      : value === 11
      ? "J"
      : value === 12
      ? "Q"
      : value === 13
      ? "K"
      : String(value);
  const icon = getIcon(suit);
  const gridRowCount =
    Math.max(cardPatterns[value][0], cardPatterns[value][1]) * 2 - 1;
  return (
    <div className={styles.front}>
      {["J", "Q", "K"].includes(valueText) ? (
        <div
          className={styles.frontGrid}
          style={{ gridTemplateRows: "33% 33% 33%" }}
        >
          <span style={{ gridRow: 1, gridColumn: 1 }}>{icon}</span>
          <b
            style={{ gridRow: 2, gridColumn: 2, fontSize: 25, marginLeft: -6 }}
          >
            {valueText === "Q" ? "♕" : valueText === "K" ? "♔" : valueText}
          </b>
          <span style={{ gridRow: 3, gridColumn: 3 }}>{icon}</span>
        </div>
      ) : value === 1 ? (
        <span style={{ fontSize: 30 }}>{icon}</span>
      ) : (
        <div
          className={styles.frontGrid}
          style={{
            gridTemplateRows: Array(gridRowCount)
              .fill(100 / gridRowCount + "%")
              .join(" "),
          }}
        >
          {cardPatterns[value].map((count, colIndex) =>
            Array(count)
              .fill(0)
              .map((_, index) => {
                const row =
                  index * (colIndex === 1 && value === 10 ? 4 : 2) +
                  1 +
                  (colIndex === 1
                    ? value === 5
                      ? 1
                      : value === 7
                      ? 1
                      : value === 8
                      ? 1
                      : value === 9
                      ? 3
                      : value === 10
                      ? 1
                      : 0
                    : 0);
                return (
                  <div
                    key={index}
                    style={{
                      gridColumn: colIndex + 1,
                      gridRow: row,
                      marginLeft: colIndex === 1 ? -5 : undefined,
                      transform:
                        row > gridRowCount / 2 + 1 ? "scale(1, -1)" : "",
                    }}
                  >
                    {icon}
                  </div>
                );
              })
          )}
        </div>
      )}
      <div
        style={{
          fontSize: 10,
          position: "absolute",
          left: padding,
          top: padding,
        }}
      >
        {valueText}
        <br />
        {icon}
      </div>
      <div
        style={{
          fontSize: 10,
          position: "absolute",
          right: padding,
          bottom: padding,
          transform: "rotate(180deg)",
        }}
      >
        {valueText}
        <br />
        {icon}
      </div>
    </div>
  );
});

function getIcon(type: string): string {
  if (type === "clubs") {
    return "♣";
  } else if (type === "diamonds") {
    return "♦";
  } else if (type === "hearts") {
    return "♥";
  } else {
    return "♠";
  }
}

const cardPatterns = [
  [],
  [0, 1, 0],
  [0, 2, 0],
  [0, 3, 0],
  [2, 0, 2],
  [2, 1, 2],
  [3, 0, 3],
  [3, 1, 3],
  [3, 2, 3],
  [4, 1, 4],
  [4, 2, 4],
  [],
  [],
  [],
];
