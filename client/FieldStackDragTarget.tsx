import { CardDnDItem } from "./CardDnDItem";
import { CardState } from "../shared/GameUtils";
import { useDrop } from "react-dnd";

type Props = {
  card: CardState | null;
  stackHeight: number;
  onDrop: (source: CardDnDItem) => void;
};

const buffer = 4;

export default function FieldStackDragTarget({
  card,
  onDrop,
  stackHeight,
}: Props) {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: "card",
      drop: (item: CardDnDItem) => onDrop(item),
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
      }),
      canDrop: (item) =>
        card != null &&
        item.card.value === card.value + 1 &&
        item.card.suit === card.suit,
    }),
    [onDrop, card]
  );
  if (!canDrop) {
    return null;
  }
  return (
    <div
      style={{
        height: 77 + stackHeight * 0.2 + 2 * buffer,
        width: 55 + 2 * buffer,
        zIndex: 1000000,
        backgroundColor: isOver && canDrop ? "rgba(255,255,0,.5)" : "",
        outline: canDrop ? "1px solid yellow" : "",
        marginTop: -buffer,
        borderRadius: 2,
        marginLeft: -buffer,
      }}
      ref={drop}
    />
  );
}
