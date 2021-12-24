import { CardDnDItem } from "./CardDnDItem";
import { useDrop } from "react-dnd";

type Props = {
  onDrop: (item: CardDnDItem) => void;
};
export default function FieldDragTarget({ onDrop }: Props) {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: "card",
      drop: (item: CardDnDItem) => onDrop(item),
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
      }),
      canDrop: (item) => item.card.value === 1,
    }),
    [onDrop]
  );
  if (!canDrop) {
    return null;
  }
  return (
    <div
      style={{
        height: 577,
        width: 577,
        zIndex: 100000,
        backgroundColor: isOver && canDrop ? "rgba(255,255,0,.5)" : "",
        outline: canDrop ? "1px solid yellow" : "",
      }}
      ref={drop}
    />
  );
}
