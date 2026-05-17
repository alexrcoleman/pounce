import { CardDnDItem } from "./CardDnDItem";
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

const buffer = 30;

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
  const targetWidth = CARD_WIDTH * CARD_BASE_SCALE * scale + 2 * buffer;
  const targetHeight =
    (CARD_HEIGHT * CARD_BASE_SCALE +
      Math.max(stackHeight - 1, 0) * FIELD_STACK_CARD_GAP) *
      scale +
    2 * buffer;
  return (
    <div
      style={{
        height: targetHeight,
        width: targetWidth,
        backgroundColor: isOver && canDrop ? "rgba(255,255,0,.5)" : "",
        outline: canDrop || stackHeight === 0 ? "1px solid yellow" : "",
        borderRadius: 4,
        position: "absolute",
        transformOrigin: "0% 0%",
        transform: `translate(${left - buffer}px, ${
          top - buffer
        }px) rotate(${rotate}deg)`,
      }}
      ref={drop}
    />
  );
});
