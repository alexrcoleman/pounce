import type { CardState } from "../shared/GameUtils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CardFace from "./CardFace";
import React from "react";
import { CardDnDItem, SourceType } from "./CardDnDItem";
import joinClasses from "./joinClasses";
import styles from "./Card.module.css";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";
import { observer } from "mobx-react-lite";
import SocketState from "./SocketState";
import { getPlayerLocation } from "../shared/CardLocations";
import { computed, toJS } from "mobx";
import { useClientContext } from "./ClientContext";
import { type BoardLayoutArea, useBoardLayout } from "./BoardLayout";
import {
  type CardLocation,
  getCardLayoutArea,
  getCardRotationDegrees,
  getCardScreenGeometry,
  getPosition,
} from "./cardGeometry";

const CLICK_DRAG_SUPPRESSION_DISTANCE_PX = 8;

type ClickStartPosition = {
  x: number;
  y: number;
};

type Props = {
  card: CardState;
  canInteract?: boolean;
  onClick?: () => void;
  location: CardLocation;
  isHandTarget?: boolean;
  isRemoteCursorDragged?: boolean;
  postGameStage?: number;
};

/**
 * Renders a playing card at a given position.
 */
const CardContentMemo = observer(function CardContent({
  card,
  canInteract = true,
  location,
  isHandTarget,
  isRemoteCursorDragged = false,
  onClick,
  postGameStage,
}: Props) {
  const { state, socket } = useClientContext();
  const layout = useBoardLayout();
  const updateCursorTarget = useCallback(
    (isClick = false) => {
      if (!canInteract || !isHandTarget) {
        return;
      }
      socket?.emit("update_hand", getCursorUpdate(card, location, isClick));
    },
    [canInteract, card, isHandTarget, location, socket]
  );
  const clickStartRef = useRef<ClickStartPosition | null>(null);
  const rememberClickStart = useCallback((x: number, y: number) => {
    clickStartRef.current = { x, y };
  }, []);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!canInteract) {
        return;
      }
      const shouldSuppressClick = didPointerMoveTooFar(
        clickStartRef.current,
        event
      );
      clickStartRef.current = null;
      if (shouldSuppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      updateCursorTarget(true);
      onClick && onClick();
    },
    [canInteract, onClick, updateCursorTarget]
  );
  const board = state.board!;
  const activePlayerIndex = state.getActivePlayerIndex();
  const player = board.players[card.player];

  const pile =
    location.type === "field_stack"
      ? board.piles[location.stackIndex]
      : location.type === "pounce"
      ? player.pounceDeck
      : location.type === "flippedDeck"
      ? player.flippedDeck
      : location.type === "solitaire"
      ? player.stacks[location.pileIndex]
      : player.deck;
  const zIndex = location.cardIndex;

  let faceUp = computed(() => {
    return (
      location.type === "flippedDeck" ||
      (location.type === "pounce" && zIndex === pile.length - 1) ||
      (location.type === "field_stack" && zIndex < 12) ||
      location.type === "solitaire"
    );
  }).get();

  const fullSizePlayerIndices =
    layout.mode !== "standard"
      ? layout.fullSizePlayerIndices
      : [activePlayerIndex];
  let scaleDown =
    location.type !== "field_stack" &&
    !fullSizePlayerIndices.includes(card.player);

  const nextSource = computed(() => getSource(card, state, location)).get();
  const sourceKey = getSourceKey(nextSource);
  const source = useMemo(() => nextSource, [sourceKey]);
  const isDraggable = canInteract && canDragSource(source);

  let [positionX, positionY] = getPosition(card, state, location);
  let layoutArea: BoardLayoutArea = getCardLayoutArea(card, location);

  // Post-game animation:
  if (postGameStage) {
    const [px, py] = getPlayerLocation(
      card.player,
      activePlayerIndex
    );
    if (
      (postGameStage === 1 || postGameStage === 2) &&
      location.type === "field_stack"
    ) {
      faceUp = false;
      if (postGameStage === 2) {
        [positionX, positionY] = [px + 400, py + 100];
        layoutArea = { type: "player", playerIndex: card.player };
      }
    }
    if (postGameStage === 3) {
      faceUp = false;
      [positionX, positionY] = [px + 400, py + 100];
      layoutArea = { type: "player", playerIndex: card.player };
      scaleDown = false;
    }
  }
  const color = board.players[card.player].color;
  const { suit, value } = card;
  const [isAnimating, setIsAnimating] = useState(false);
  const rotationOffset = useRef(Math.random() * 2 - 1);
  let cardRotation = getCardRotationDegrees(
    board,
    card,
    location,
    rotationOffset.current * 2
  );
  if (postGameStage === 3) {
    cardRotation = 0;
  }

  const geometry = getCardScreenGeometry({
    area: layoutArea,
    card,
    isScaleDown: scaleDown,
    layout,
    location,
    position: [positionX, positionY],
    rotationDegrees: cardRotation,
  });
  const zIndexBase =
    geometry.area.type === "player" &&
    layout.fullSizePlayerIndices.includes(card.player)
      ? 5000
      : 0;

  const item = useMemo(
    () =>
      source.type === "field_stack"
        ? {
            index: source.index,
            initialPosition: [
              board.pileLocs[source.index][0],
              board.pileLocs[source.index][1],
            ] as [number, number],
            initialClientPosition: [geometry.x, geometry.y] as [
              number,
              number
            ],
          }
        : {
            source,
            card: toJS(card),
            initialClientPosition: [geometry.x, geometry.y] as [
              number,
              number
            ],
          },
    [
      source,
      JSON.stringify(toJS(card)),
      getFieldStackInitialPositionKey(board, source),
      geometry.x,
      geometry.y,
    ]
  );
  const [{ isDragging }, drag, preview] = useDrag(
    () =>
      source.type === "field_stack"
        ? {
            type: "field_stack",
            item,
            collect: (monitor) => ({
              isDragging: !!monitor.isDragging(),
            }),
            isDragging: (monitor) => {
              const dragItem = monitor.getItem();
              if (dragItem == item) {
                return true;
              }
              return dragItem.index === item.index;
            },
            canDrag: () => isDraggable,
          }
        : {
            type: "card",
            item,
            collect: (monitor) => ({
              isDragging: !!monitor.isDragging(),
              // TODO: Find a way to make this work, maybe a child component which
            }),
            isDragging: (monitor) => {
              if (monitor.getItem() == item) {
                return true;
              }
              const dragItem = monitor.getItem();
              if (!isCardDnDItem(dragItem) || !isCardDnDItem(item)) {
                return false;
              }
              if (isSameSingleCardDrag(dragItem, item)) {
                return true;
              }
              return (
                dragItem.source.type === "solitaire" &&
                item.source.type === "solitaire" &&
                dragItem.source.pileIndex === item.source.pileIndex &&
                dragItem.source.slotIndex < item.source.slotIndex
              );
            },
            canDrag: () => isDraggable,
          },
    [isDraggable, sourceKey, item]
  );
  useEffect(() => {
    // React DnD clears the preview connection when the source handler changes,
    // which happens when a card becomes a draggable center field stack.
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview, source.type]);
  // So moving cards are "lifted" while moving
  useEffect(() => {
    setIsAnimating(true);
    const t = setTimeout(() => {
      setIsAnimating(false);
    }, 1000 + zIndex);
    return () => clearTimeout(t);
  }, [positionX, positionY, zIndex]);

  const canClick = canInteract && onClick != null;
  return (
    <div
      className={joinClasses(
        styles.root,
        canClick && styles.clickable,
        isDraggable && styles.draggable
      )}
      data-is-dragging-this-card={isDragging ? "true" : undefined}
      style={
        {
          zIndex: zIndexBase + zIndex + (isAnimating ? 1000 : 0),
          "--c": color,
          "--r": geometry.rotationDegrees + "deg",
          "--x": geometry.x + "px",
          "--y": geometry.y + "px",
          "--s": geometry.screenScale,
          opacity: isDragging || isRemoteCursorDragged ? 0.25 : 1,
        } as any
      }
      onMouseEnter={updateCursorTarget}
      onPointerDown={(event) => {
        rememberClickStart(event.clientX, event.clientY);
        if (event.pointerType !== "mouse") {
          updateCursorTarget();
        }
      }}
      onTouchStart={(event) => {
        if (!window.PointerEvent) {
          const touch = event.touches[0];
          if (touch) {
            rememberClickStart(touch.clientX, touch.clientY);
          }
          updateCursorTarget();
        }
      }}
      title={`${zIndex + 1} card(s)`}
      onClick={canClick ? handleClick : undefined}
      ref={drag}
    >
      <div className={joinClasses(styles.body, faceUp && styles.bodyFaceUp)}>
        <div
          className={styles.back}
          style={
            {
              "--hr": colors[color] ?? "0deg",
            } as any
          }
        />
        <div className={styles.front}>
          <CardFace suit={suit} value={value} />
        </div>
      </div>
    </div>
  );
});

const colors: Record<string, string | undefined> = {
  red: "200deg",
  blue: "80deg",
  green: "320deg",
  orange: "245deg",
  yellow: "280deg",
  pink: "151deg",
};
// ["red", "blue", "green", "orange", "yellow", "pink"];
export default CardContentMemo;

function getCursorUpdate(
  card: CardState,
  location: CardLocation,
  isClick: boolean
) {
  if (isClick || location.type === "deck") {
    return { location: card, item: null };
  }
  if (location.type === "solitaire") {
    return { location: card };
  }
  return { location: card, item: card };
}

function getSource(
  card: CardState,
  state: SocketState,
  location: CardLocation
): SourceType {
  if (location.type === "field_stack") {
    const stackHeight = state.board!.piles[location.stackIndex].length;
    return {
      type: "field_stack",
      index: location.stackIndex,
      isTopCard: location.cardIndex === stackHeight - 1,
    };
  }
  if (
    location.type === "deck" ||
    card.player !== state.getActivePlayerIndex()
  ) {
    return { type: "other" };
  }
  const player = state.board!.players[card.player];
  switch (location.type) {
    case "flippedDeck":
      if (location.cardIndex !== player.flippedDeck.length - 1) {
        return { type: "other" };
      }
      return { type: "flippedDeck" };
    case "pounce":
      if (location.cardIndex !== player.pounceDeck.length - 1) {
        return { type: "other" };
      }
      return { type: "pounce" };
    case "solitaire":
      return {
        type: "solitaire",
        pileIndex: location.pileIndex,
        slotIndex: location.cardIndex,
        isTopCard:
          location.cardIndex === player.stacks[location.pileIndex].length - 1,
      };
  }
}

function getSourceKey(source: SourceType): string {
  switch (source.type) {
    case "field_stack":
      return `field_stack:${source.index}:${source.isTopCard ? 1 : 0}`;
    case "solitaire":
      return `solitaire:${source.pileIndex}:${source.slotIndex}:${
        source.isTopCard ? 1 : 0
      }`;
    case "flippedDeck":
    case "other":
    case "pounce":
      return source.type;
  }
}

function getFieldStackInitialPositionKey(
  board: { pileLocs: [number, number, number][] },
  source: SourceType
): string {
  if (source.type !== "field_stack") {
    return "";
  }

  return board.pileLocs[source.index]?.join(":") ?? "";
}

function canDragSource(source: SourceType): boolean {
  if (source.type === "field_stack") {
    return source.isTopCard;
  }

  return source.type !== "other";
}

function didPointerMoveTooFar(
  start: ClickStartPosition | null,
  event: React.MouseEvent<HTMLDivElement>
): boolean {
  if (start == null) {
    return false;
  }

  const deltaX = event.clientX - start.x;
  const deltaY = event.clientY - start.y;
  return (
    deltaX * deltaX + deltaY * deltaY >
    CLICK_DRAG_SUPPRESSION_DISTANCE_PX * CLICK_DRAG_SUPPRESSION_DISTANCE_PX
  );
}

function isCardDnDItem(item: unknown): item is CardDnDItem {
  return (
    typeof item === "object" &&
    item != null &&
    "source" in item &&
    "card" in item
  );
}

function isSameSingleCardDrag(
  dragItem: CardDnDItem,
  item: CardDnDItem
): boolean {
  if (!cardsEqual(dragItem.card, item.card)) {
    return false;
  }
  if (dragItem.source.type !== item.source.type) {
    return false;
  }

  switch (item.source.type) {
    case "flippedDeck":
    case "pounce":
      return true;
    case "solitaire":
      return (
        dragItem.source.type === "solitaire" &&
        dragItem.source.pileIndex === item.source.pileIndex &&
        dragItem.source.slotIndex === item.source.slotIndex
      );
    case "field_stack":
    case "other":
      return false;
  }
}

function cardsEqual(
  a: CardState | null | undefined,
  b: CardState | null | undefined
): boolean {
  return (
    a?.player === b?.player && a?.suit === b?.suit && a?.value === b?.value
  );
}
