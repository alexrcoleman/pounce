import { useDragLayer } from "react-dnd";

import CardFace from "./CardFace";
import { CardState } from "../shared/GameUtils";
import { useClientContext } from "./ClientContext";
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
          transform: `translate(${currentOffset.x - 28}px, ${
            currentOffset.y - 42
          }px) scale(1.1)`,
        }}
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
