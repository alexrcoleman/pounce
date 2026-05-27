import { useDragDropManager, useDragLayer } from "react-dnd";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { CardDnDItem } from "./CardDnDItem";
import CardFace from "./CardFace";
import { CARD_HEIGHT, CARD_WIDTH } from "../shared/CardLocations";
import { CardState, PlayerState } from "../shared/GameUtils";
import { useClientContext } from "./ClientContext";
import { CARD_BASE_SCALE } from "./cardLayout";
import styles from "./MobileDragPreviewLayer.module.css";

type Props = {
  easyReadCards: boolean;
  enabled: boolean;
};
const STACK_CARD_GAP = 18;

export default function MobileDragPreviewLayer({
  easyReadCards,
  enabled,
}: Props) {
  const { state } = useClientContext();
  const manager = useDragDropManager();
  const cardStackRef = useRef<HTMLDivElement | null>(null);
  const { item, itemType, isDragging } = useDragLayer(
    (monitor) => ({
      item: monitor.getItem(),
      itemType: monitor.getItemType(),
      isDragging: monitor.isDragging(),
    })
  );

  useEffect(() => {
    if (!enabled || !isDragging) {
      return;
    }

    const monitor = manager.getMonitor();
    let frameId: number | null = null;

    const updatePreviewPosition = () => {
      frameId = null;
      const node = cardStackRef.current;
      const offset = monitor.getClientOffset();
      if (!node || !offset) {
        return;
      }

      node.style.transform = getPreviewTransform(offset.x, offset.y);
      node.style.visibility = "visible";
    };

    const schedulePreviewPositionUpdate = () => {
      if (frameId != null) {
        return;
      }
      frameId = window.requestAnimationFrame(updatePreviewPosition);
    };

    updatePreviewPosition();
    const unsubscribe = monitor.subscribeToOffsetChange(
      schedulePreviewPositionUpdate
    );

    return () => {
      unsubscribe();
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [enabled, isDragging, manager]);

  if (!enabled || !isDragging) {
    return null;
  }

  const cards = getPreviewCards(
    item,
    itemType,
    state.board?.players,
    state.board?.piles
  );
  if (cards.length === 0) {
    return null;
  }
  const stackHeight = CARD_HEIGHT + (cards.length - 1) * STACK_CARD_GAP;

  return (
    <div
      className={styles.layer}
      data-card-readability={easyReadCards ? "easy" : "standard"}
    >
      <div
        ref={cardStackRef}
        className={styles.cardStack}
        style={{
          "--card-width": `${CARD_WIDTH}px`,
          "--card-height": `${CARD_HEIGHT}px`,
          "--stack-height": `${stackHeight}px`,
          "--preview-scale": `${CARD_BASE_SCALE}`,
        } as CSSProperties}
      >
        {cards.map((card, index) => (
          <div
            className={styles.card}
            key={`${card.player}:${card.suit}:${card.value}`}
            style={
              {
                "--card-top": `${index * STACK_CARD_GAP}px`,
                "--card-z-index": `${index}`,
              } as CSSProperties
            }
          >
            <CardFace suit={card.suit} value={card.value} />
          </div>
        ))}
      </div>
    </div>
  );
}

function getPreviewTransform(x: number, y: number): string {
  return `translate3d(${x - (CARD_WIDTH * CARD_BASE_SCALE) / 2}px, ${
    y - (CARD_HEIGHT * CARD_BASE_SCALE) / 2
  }px, 0) scale(${CARD_BASE_SCALE})`;
}

function getPreviewCards(
  item: unknown,
  itemType: unknown,
  players: PlayerState[] | undefined,
  piles: CardState[][] | undefined
): CardState[] {
  if (isCardDragItem(item)) {
    if (item.source.type === "solitaire") {
      return (
        players?.[item.card.player]?.stacks[item.source.pileIndex].slice(
          item.source.slotIndex
        ) ?? [item.card]
      );
    }
    return [item.card];
  }

  if (itemType === "field_stack" && isFieldStackDragItem(item)) {
    const pile = piles?.[item.index];
    const card = pile?.[pile.length - 1];
    return card ? [card] : [];
  }

  return [];
}

function isCardDragItem(item: unknown): item is CardDnDItem {
  return (
    typeof item === "object" &&
    item != null &&
    "card" in item &&
    typeof (item as { card?: unknown }).card === "object" &&
    "source" in item &&
    typeof (item as { source?: unknown }).source === "object"
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
