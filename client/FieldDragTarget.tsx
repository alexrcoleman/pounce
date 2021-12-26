import { CardDnDItem, FieldStackDnDItem } from "./CardDnDItem";
import { MutableRefObject, useRef } from "react";

import { useDrop } from "react-dnd";

type Props = {
  onDrop: (item: CardDnDItem, position: [number, number]) => void;
  onMoveFieldStack: (
    item: FieldStackDnDItem,
    position: [number, number]
  ) => void;
};
export default function FieldDragTarget({ onDrop, onMoveFieldStack }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: ["card", "field_stack"],
      drop: (item: CardDnDItem | FieldStackDnDItem, monitor) => {
        const loc = monitor.getClientOffset();
        let position: [number, number] = [0.5, 0.5];
        if (ref.current && loc) {
          const rect = ref.current.getBoundingClientRect();
          position = [
            (loc.x - rect.x) / rect.width,
            (loc.y - rect.y) / rect.height,
          ];
        }
        if ("card" in item) {
          onDrop(item, position);
        } else {
          onMoveFieldStack(item, position);
        }
      },
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
      }),
      canDrop: (item) => !("card" in item) || item.card.value === 1,
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
        backgroundColor: isOver && canDrop ? "rgba(255,255,0,.5)" : "",
        outline: canDrop ? "1px solid yellow" : "",
        borderRadius: 4,
      }}
      ref={(item) => {
        drop(item);
        (ref as MutableRefObject<HTMLDivElement | null>).current = item;
      }}
    />
  );
}
