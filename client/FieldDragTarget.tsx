import { MutableRefObject, useRef } from "react";

import { CardDnDItem } from "./CardDnDItem";
import { useDrop } from "react-dnd";

type Props = {
  onDrop: (item: CardDnDItem, position?: [number, number]) => void;
};
export default function FieldDragTarget({ onDrop }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: "card",
      drop: (item: CardDnDItem, monitor) => {
        const loc = monitor.getClientOffset();
        if (ref.current && loc) {
          const rect = ref.current.getBoundingClientRect();
          onDrop(item, [
            (loc.x - rect.x) / rect.width,
            (loc.y - rect.y) / rect.height,
          ]);
        } else {
          onDrop(item);
        }
      },
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
        borderRadius: 4,
      }}
      ref={(item) => {
        drop(item);
        (ref as MutableRefObject<HTMLDivElement | null>).current = item;
      }}
    />
  );
}
