import { CardDnDItem } from "./CardDnDItem";
import { CardState } from "../shared/GameUtils";
import { useDrop } from "react-dnd";

type Props = {
  card: CardState | null;
  onDrop: (source: CardDnDItem) => void;
  stackHeight: number;
  left: number;
  top: number;
  rotate: number;
};

const buffer = 4;
const black = ["clubs", "spades"];

export default function StackDragTarget({
  card,
  onDrop,
  stackHeight,
  left,
  top,
  rotate,
}: Props) {
  const [{ isOver, canDrop, isDragging }, drop] = useDrop(
    () => ({
      accept: "card",
      drop: (item: CardDnDItem) => onDrop(item),
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
        isDragging: monitor.getItem() != null,
      }),
      canDrop: (item) =>
        card == null ||
        (item.card.value === card.value - 1 &&
          black.includes(item.card.suit) !== black.includes(card.suit)),
    }),
    [onDrop]
  );
  if (!canDrop) {
    return null;
  }
  return (
    <div
      style={{
        height: 77 + (stackHeight - 1) * 10 + 2 * buffer,
        width: 55 + 2 * buffer,
        zIndex: 1000000,
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
