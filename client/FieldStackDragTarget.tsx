import { CardDnDItem, isMultiCardSolitaireDrag } from "./CardDnDItem";
import { CardState, CursorLocation } from "../shared/GameUtils";
import { useDrop } from "react-dnd";
import { useRef } from "react";
import { observer } from "mobx-react-lite";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FIELD_STACK_CARD_GAP,
} from "../shared/CardLocations";
import { CARD_BASE_SCALE } from "./cardLayout";
import { getCenterPileRaceWinner } from "./centerPileRace";
import styles from "./Board.module.css";

type Props = {
  pile: CardState[];
  pileIndex: number;
  stackHeight: number;
  onDrop: (source: CardDnDItem) => void;
  left: number;
  top: number;
  scale?: number;
  rotate: number;
  onUpdateDragTarget: (location: CursorLocation) => void;
};

const buffer = 20;

export default observer(function FieldStackDragTarget({
  pile,
  pileIndex,
  onDrop,
  stackHeight,
  left,
  top,
  scale = 1,
  rotate,
  onUpdateDragTarget,
}: Props) {
  const lastUpdateRef = useRef(0);
  const card = pile[pile.length - 1] ?? null;
  const [{ isOver, canDrop, isDragging }, drop] = useDrop(
    () => ({
      accept: "card",
      drop: (item: CardDnDItem, monitor) => {
        if (!monitor.didDrop()) {
          onDrop(item);
        }
      },
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
        isDragging: monitor.getItemType() === "card",
      }),
      canDrop: (item) =>
        canHandleCardDrop(item, card, pile, pileIndex),
      hover: (item: CardDnDItem, monitor) => {
        if (
          canPlayCardOnPile(item, card) &&
          !item.rememberedCenterPileIndices?.includes(pileIndex)
        ) {
          (item.rememberedCenterPileIndices ??= []).push(pileIndex);
        }
        const handlerId = monitor.getHandlerId();
        if (
          handlerId &&
          canHandleCardDrop(item, card, pile, pileIndex)
        ) {
          item.centerPileTarget = { handlerId, pileIndex };
        } else if (item.centerPileTarget?.handlerId === handlerId) {
          delete item.centerPileTarget;
        }
        if (Date.now() >= lastUpdateRef.current + 1000) {
          lastUpdateRef.current = Date.now();
          card && onUpdateDragTarget(card);
        }
      },
    }),
    [onDrop, card, pile, pileIndex]
  );
  if (stackHeight === 0 || !isDragging) {
    return null;
  }
  const cardWidth = CARD_WIDTH * CARD_BASE_SCALE * scale;
  const cardHeight = CARD_HEIGHT * CARD_BASE_SCALE * scale;
  const stackGap = Math.max(stackHeight - 1, 0) * FIELD_STACK_CARD_GAP * scale;
  const targetWidth = cardWidth + 2 * buffer;
  const targetHeight = cardHeight + stackGap + 2 * buffer;
  return (
    <div
      className={styles.centerDragTarget}
      data-can-drop={canDrop ? "true" : "false"}
      data-is-over={isOver && canDrop ? "true" : "false"}
      style={{
        height: targetHeight,
        width: targetWidth,
        position: "absolute",
        transformOrigin: `${buffer + cardWidth / 2}px ${
          buffer + stackGap + cardHeight / 2
        }px`,
        transform: `translate(${left - buffer}px, ${
          top - buffer
        }px) rotate(${rotate}deg)`,
      }}
      ref={drop}
    />
  );
});

function canPlayCardOnPile(
  item: CardDnDItem,
  card: CardState | null
): boolean {
  return (
    card != null &&
    !isMultiCardSolitaireDrag(item) &&
    item.card.value === card.value + 1 &&
    item.card.suit === card.suit
  );
}

function canHandleCardDrop(
  item: CardDnDItem,
  card: CardState | null,
  pile: CardState[],
  pileIndex: number
): boolean {
  if (canPlayCardOnPile(item, card)) {
    return true;
  }

  return (
    !isMultiCardSolitaireDrag(item) &&
    item.rememberedCenterPileIndices?.includes(pileIndex) === true &&
    getCenterPileRaceWinner(pile, item.card, item.card.player) != null
  );
}
