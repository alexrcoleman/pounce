import { CardDnDItem } from "./CardDnDItem";
import { CardState } from "../shared/GameUtils";
import { useDrop } from "react-dnd";
import { useRef } from "react";

type Props = {
  card: CardState | null;
  stackHeight: number;
  onDrop: (source: CardDnDItem) => void;
  left: number;
  top: number;
  rotate: number;
  onUpdateDragTarget: (card: CardState) => void;
};

const buffer = 15;

export default function FieldStackDragTarget({
  card,
  onDrop,
  stackHeight,
  left,
  top,
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
  return (
    <div
      style={{
        height: 77 + stackHeight * 0.2 + 2 * buffer,
        width: 55 + 2 * buffer,
        backgroundColor: isOver && canDrop ? "rgba(255,255,0,.5)" : "",
        outline: canDrop ? "1px solid yellow" : "",
        borderRadius: 4,
        position: "absolute",
        transform: `translate(${left - buffer}px, ${
          top - buffer
        }px) rotate(${rotate}deg)`,
      }}
      ref={drop}
    />
  );
}
