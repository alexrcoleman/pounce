import React, { useEffect } from "react";

import { CardDnDItem } from "./CardDnDItem";
import { BoardState, CardState } from "../shared/GameUtils";
import { useDragDropManager } from "react-dnd";
import { useClientContext } from "./ClientContext";

type Props = {
  boardRootRef: React.RefObject<HTMLDivElement | null>;
  onUpdateGrabbedItem: (
    item: CardState | null,
    items: CardState[] | null
  ) => void;
};

export default function DragReporter({
  boardRootRef,
  onUpdateGrabbedItem,
}: Props) {
  const { state } = useClientContext();
  const manager = useDragDropManager();
  useEffect(() => {
    const monitor = manager.getMonitor();
    let lastItem: unknown = null;
    const unsub = monitor.subscribeToStateChange(() => {
      const item = monitor.getItem();
      if (lastItem == item) {
        return;
      }
      lastItem = item;
      setBoardCardDragState(
        boardRootRef.current,
        item != null && isCardDragItemType(monitor.getItemType())
      );
      setDocumentDragCursor(item != null);
      if (item == null) {
        onUpdateGrabbedItem(null, null);
      } else if ("card" in item) {
        onUpdateGrabbedItem(item.card, getDraggedCards(item, state.board));
      } else {
        onUpdateGrabbedItem(null, null);
      }
    });
    return () => {
      setDocumentDragCursor(false);
      setBoardCardDragState(boardRootRef.current, false);
      unsub();
    };
  }, [boardRootRef, manager, onUpdateGrabbedItem, state]);
  return <React.Fragment />;
}

function setDocumentDragCursor(isDragging: boolean) {
  if (isDragging) {
    document.body.dataset.pounceDragging = "true";
    return;
  }
  delete document.body.dataset.pounceDragging;
}

function setBoardCardDragState(
  boardRoot: HTMLDivElement | null,
  isDraggingCard: boolean
) {
  if (!boardRoot) {
    return;
  }
  if (isDraggingCard) {
    boardRoot.dataset.isDraggingCard = "true";
    return;
  }
  delete boardRoot.dataset.isDraggingCard;
}

function isCardDragItemType(itemType: unknown): boolean {
  return itemType === "card" || itemType === "field_stack";
}

function getDraggedCards(
  item: CardDnDItem,
  board: BoardState | null
): CardState[] {
  if (item.source.type === "solitaire") {
    return (
      board?.players[item.card.player]?.stacks[item.source.pileIndex]
        .slice(item.source.slotIndex)
        .map(cloneCard) ?? [item.card]
    );
  }

  return [cloneCard(item.card)];
}

function cloneCard(card: CardState): CardState {
  return {
    player: card.player,
    suit: card.suit,
    value: card.value,
  };
}
