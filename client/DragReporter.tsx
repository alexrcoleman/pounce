import React, { useEffect } from "react";

import { CardDnDItem } from "./CardDnDItem";
import { CardState } from "../shared/GameUtils";
import { useDragDropManager } from "react-dnd";

type Props = {
  onUpdateGrabbedItem: (item: CardState | null) => void;
};

export default function DragReporter({ onUpdateGrabbedItem }: Props) {
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
      if (item == null) {
        onUpdateGrabbedItem(null);
      } else if ("card" in item) {
        onUpdateGrabbedItem(item.card);
      }
    });
    return () => unsub();
  });
  return <React.Fragment />;
}
