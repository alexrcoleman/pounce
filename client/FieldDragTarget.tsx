import { observer } from "mobx-react-lite";
import { CardDnDItem, FieldStackDnDItem } from "./CardDnDItem";
import { MutableRefObject, useRef } from "react";
import type { XYCoord } from "react-dnd";

import { useDrop } from "react-dnd";
import { FIELD_SIZE } from "./BoardLayout";
import { FIELD_PILE_AREA_SIZE } from "../shared/CardLocations";

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
              ? getCardDropPosition(
                  ref.current,
                  item,
                  monitor.getDifferenceFromInitialOffset(),
                  monitor.getSourceClientOffset() ?? loc
                )
              : getStackDropPosition(
                  ref.current,
                  item,
                  monitor.getDifferenceFromInitialOffset()
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
  item: CardDnDItem,
  dragDelta: XYCoord | null,
  fallbackLoc: XYCoord
): [number, number] {
  return getFieldPilePosition(
    element,
    getDraggedAnchorPosition(item.initialClientPosition, dragDelta, fallbackLoc)
  );
}

function getStackDropPosition(
  element: HTMLDivElement,
  item: FieldStackDnDItem,
  dragDelta: XYCoord | null
): [number, number] {
  if (!dragDelta) {
    return item.initialPosition;
  }

  const fieldScale = getFieldScale(element);
  return [
    item.initialPosition[0] +
      dragDelta.x / fieldScale / FIELD_PILE_AREA_SIZE,
    item.initialPosition[1] +
      dragDelta.y / fieldScale / FIELD_PILE_AREA_SIZE,
  ];
}

function getFieldPilePosition(
  element: HTMLDivElement,
  loc: XYCoord
): [number, number] {
  const rect = element.getBoundingClientRect();
  const fieldScale = getFieldScale(element);
  return [
    ((loc.x - rect.x) / fieldScale) / FIELD_PILE_AREA_SIZE,
    ((loc.y - rect.y) / fieldScale) / FIELD_PILE_AREA_SIZE,
  ];
}

function getDraggedAnchorPosition(
  initialPosition: [number, number],
  dragDelta: XYCoord | null,
  fallbackLoc: XYCoord
): XYCoord {
  if (!dragDelta) {
    return fallbackLoc;
  }
  return {
    x: initialPosition[0] + dragDelta.x,
    y: initialPosition[1] + dragDelta.y,
  };
}

function getFieldScale(element: HTMLDivElement) {
  return element.getBoundingClientRect().width / FIELD_SIZE;
}
