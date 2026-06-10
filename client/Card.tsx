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
import { useRoundEndCardPresentation } from "./RoundEndSequence";

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
  isHinted?: boolean;
  isRemoteCursorDragged?: boolean;
  isStockLocked?: boolean;
};

/**
 * Renders a playing card at a given position.
 */
const CardContentMemo = observer(function CardContent({
  card,
  canInteract = true,
  location,
  isHandTarget,
  isHinted = false,
  isRemoteCursorDragged = false,
  isStockLocked = false,
  onClick,
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
  const scaleDown =
    location.type !== "field_stack" &&
    !fullSizePlayerIndices.includes(card.player);

  const nextSource = computed(() => getSource(card, state, location)).get();
  const sourceKey = getSourceKey(nextSource);
  const source = useMemo(() => nextSource, [sourceKey]);
  const isDraggable = canInteract && canDragSource(source);

  const [positionX, positionY] = getPosition(card, state, location);
  const layoutArea: BoardLayoutArea = getCardLayoutArea(card, location);

  const color = board.players[card.player].color;
  const { suit, value } = card;
  const [isAnimating, setIsAnimating] = useState(false);
  const rotationOffset = useRef(Math.random() * 2 - 1);
  const cardRotation = getCardRotationDegrees(
    board,
    card,
    location,
    rotationOffset.current * 2
  );

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
  const roundEndPresentation = useRoundEndCardPresentation({
    card,
    location,
    naturalGeometry: geometry,
  });
  const visualGeometry = roundEndPresentation?.geometry ?? geometry;
  const visualFaceUp = roundEndPresentation?.faceUp ?? faceUp;
  const visualZIndex =
    roundEndPresentation?.zIndex ??
    zIndexBase + zIndex + (isAnimating ? 1000 : 0);
  const shouldAnimateFlip = getShouldAnimateFlip({
    activePlayerIndex,
    card,
    isRoundEndPresented: roundEndPresentation != null,
    location,
    pileLength: pile.length,
    zIndex,
  });

  const item = useMemo(
    () =>
      source.type === "field_stack"
        ? {
            index: source.index,
            initialPosition: [
              board.pileLocs[source.index][0],
              board.pileLocs[source.index][1],
            ] as [number, number],
            initialClientPosition: [visualGeometry.x, visualGeometry.y] as [
              number,
              number
            ],
          }
        : {
            source,
            card: toJS(card),
            initialClientPosition: [visualGeometry.x, visualGeometry.y] as [
              number,
              number
            ],
          },
    [
      source,
      JSON.stringify(toJS(card)),
      getFieldStackInitialPositionKey(board, source),
      visualGeometry.x,
      visualGeometry.y,
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
  const visualOpacity =
    roundEndPresentation?.opacity ??
    (isDragging || isRemoteCursorDragged ? 0.25 : 1);
  useEffect(() => {
    // React DnD clears the preview connection when the source handler changes,
    // which happens when a card becomes a draggable center field stack.
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview, source.type]);
  // So moving cards are "lifted" while moving
  const animationResetDelayMs =
    120 +
    (roundEndPresentation?.transitionDelayMs ?? 0) +
    (roundEndPresentation?.transitionDurationMs ?? 500);
  useEffect(() => {
    setIsAnimating(true);
    const t = setTimeout(() => {
      setIsAnimating(false);
    }, animationResetDelayMs);
    return () => clearTimeout(t);
  }, [
    animationResetDelayMs,
    roundEndPresentation?.transitionDelayMs,
    roundEndPresentation?.transitionDurationMs,
    visualGeometry.rotationDegrees,
    visualGeometry.screenScale,
    visualGeometry.x,
    visualGeometry.y,
  ]);

  const canClick = canInteract && onClick != null;
  return (
    <div
      className={joinClasses(
        styles.root,
        shouldAnimateFlip && styles.rootAnimatedFlip,
        canClick && styles.clickable,
        isDraggable && styles.draggable,
        isHinted && styles.hinted
      )}
      data-is-dragging-this-card={isDragging ? "true" : undefined}
      data-stock-locked={isStockLocked ? "true" : undefined}
      style={
        {
          zIndex: visualZIndex,
          "--c": color,
          "--card-transition-delay": `${
            roundEndPresentation?.transitionDelayMs ?? 0
          }ms`,
          "--card-transition-duration": `${
            roundEndPresentation?.transitionDurationMs ?? 500
          }ms`,
          "--card-transition-easing":
            roundEndPresentation?.transitionEasing ?? "ease-in-out",
          "--r": visualGeometry.rotationDegrees + "deg",
          "--x": visualGeometry.x + "px",
          "--y": visualGeometry.y + "px",
          "--s": visualGeometry.screenScale,
          opacity: visualOpacity,
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
      <div
        className={joinClasses(
          styles.body,
          shouldAnimateFlip && styles.bodyAnimatedFlip,
          visualFaceUp && styles.bodyFaceUp
        )}
      >
        {shouldAnimateFlip || !visualFaceUp ? (
          <div
            className={styles.back}
            style={
              {
                "--hr": colors[color] ?? "0deg",
              } as any
            }
          />
        ) : null}
        {shouldAnimateFlip || visualFaceUp ? (
          <div className={styles.front}>
            <CardFace suit={suit} value={value} />
          </div>
        ) : null}
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

function getShouldAnimateFlip({
  activePlayerIndex,
  card,
  isRoundEndPresented,
  location,
  pileLength,
  zIndex,
}: {
  activePlayerIndex: number;
  card: CardState;
  isRoundEndPresented: boolean;
  location: CardLocation;
  pileLength: number;
  zIndex: number;
}): boolean {
  if (isRoundEndPresented || card.player !== activePlayerIndex) {
    return false;
  }
  if (location.type === "deck" || location.type === "flippedDeck") {
    return true;
  }
  if (location.type === "pounce") {
    return zIndex >= pileLength - 2;
  }
  return false;
}

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
