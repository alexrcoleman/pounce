import { useDragLayer } from "react-dnd";
import type { CSSProperties } from "react";

import CardFace from "./CardFace";
import { CARD_HEIGHT, CARD_WIDTH } from "../shared/CardLocations";
import { CardState } from "../shared/GameUtils";
import { useClientContext } from "./ClientContext";
import { CARD_BASE_SCALE } from "./cardLayout";
import styles from "./MobileDragPreviewLayer.module.css";

type Props = {
  enabled: boolean;
};

export default function MobileDragPreviewLayer({ enabled }: Props) {
  const { state } = useClientContext();
  const { item, itemType, isDragging, currentOffset } = useDragLayer(
    (monitor) => ({
      item: monitor.getItem(),
      itemType: monitor.getItemType(),
      isDragging: monitor.isDragging(),
      currentOffset: monitor.getClientOffset(),
    })
  );

  if (!enabled || !isDragging || !currentOffset) {
    return null;
  }

  const card = getPreviewCard(item, itemType, state.board?.piles);
  if (!card) {
    return null;
  }

  return (
    <div className={styles.layer}>
      <div
        className={styles.card}
        style={{
          "--card-width": `${CARD_WIDTH}px`,
          "--card-height": `${CARD_HEIGHT}px`,
          transform: `translate(${
            currentOffset.x - (CARD_WIDTH * CARD_BASE_SCALE) / 2
          }px, ${
            currentOffset.y - (CARD_HEIGHT * CARD_BASE_SCALE) / 2
          }px) scale(${CARD_BASE_SCALE})`,
        } as CSSProperties}
      >
        <CardFace suit={card.suit} value={card.value} />
      </div>
    </div>
  );
}

function getPreviewCard(
  item: unknown,
  itemType: unknown,
  piles: CardState[][] | undefined
) {
  if (isCardDragItem(item)) {
    return item.card;
  }

  if (itemType === "field_stack" && isFieldStackDragItem(item)) {
    const pile = piles?.[item.index];
    return pile?.[pile.length - 1] ?? null;
  }

  return null;
}

function isCardDragItem(item: unknown): item is { card: CardState } {
  return (
    typeof item === "object" &&
    item != null &&
    "card" in item &&
    typeof (item as { card?: unknown }).card === "object"
  );
}

function isFieldStackDragItem(item: unknown): item is { index: number } {
  return (
    typeof item === "object" &&
    item != null &&
    "index" in item &&
    typeof (item as { index?: unknown }).index === "number"
  );
}
