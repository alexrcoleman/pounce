import { observer } from "mobx-react-lite";
import { CardDnDItem, FieldStackDnDItem } from "./CardDnDItem";
import { MutableRefObject, useRef } from "react";

import { useDrop } from "react-dnd";
import { FIELD_SIZE } from "./BoardLayout";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FIELD_PILE_AREA_SIZE,
} from "../shared/CardLocations";
import { CARD_BASE_SCALE } from "./cardLayout";

type Props = {
  onDrop: (item: CardDnDItem, position: [number, number]) => void;
  onMoveFieldStack: (
    item: FieldStackDnDItem,
    position: [number, number]
  ) => void;
};
export default observer(function FieldDragTarget({
  onDrop,
  onMoveFieldStack,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: ["card", "field_stack"],
      drop: (item: CardDnDItem | FieldStackDnDItem, monitor) => {
        const loc = monitor.getClientOffset();
        let position: [number, number] = [0.5, 0.5];
        if (ref.current && loc) {
          position =
            "card" in item
              ? getCardDropPosition(ref.current, loc)
              : getStackDropPosition(
                  ref.current,
                  monitor.getSourceClientOffset() ?? loc
                );
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
    [onDrop, onMoveFieldStack]
  );
  if (!canDrop) {
    return null;
  }
  return (
    <div
      style={{
        height: FIELD_SIZE,
        width: FIELD_SIZE,
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
});

function getCardDropPosition(
  element: HTMLDivElement,
  loc: { x: number; y: number }
): [number, number] {
  return getFieldPilePosition(element, loc, [
    (CARD_WIDTH * CARD_BASE_SCALE) / 2,
    (CARD_HEIGHT * CARD_BASE_SCALE) / 2,
  ]);
}

function getStackDropPosition(
  element: HTMLDivElement,
  loc: { x: number; y: number }
): [number, number] {
  return getFieldPilePosition(element, loc, [0, 0]);
}

function getFieldPilePosition(
  element: HTMLDivElement,
  loc: { x: number; y: number },
  cardAnchorOffset: [number, number]
): [number, number] {
  const rect = element.getBoundingClientRect();
  const fieldScale = rect.width / FIELD_SIZE;
  return [
    clamp(
      ((loc.x - rect.x) / fieldScale - cardAnchorOffset[0]) /
        FIELD_PILE_AREA_SIZE
    ),
    clamp(
      ((loc.y - rect.y) / fieldScale - cardAnchorOffset[1]) /
        FIELD_PILE_AREA_SIZE
    ),
  ];
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
