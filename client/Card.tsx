import type { CardState } from "../shared/GameUtils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CardFace from "./CardFace";
import React from "react";
import { SourceType } from "./CardDnDItem";
import joinClasses from "./joinClasses";
import styles from "./Card.module.css";
import { useDrag } from "react-dnd";
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

type Props = {
  card: CardState;
  onClick?: () => void;
  location: CardLocation;
  isHandTarget?: boolean;
  postGameStage?: number;
};

/**
 * Renders a playing card at a given position.
 */
const CardContentMemo = observer(function CardContent({
  card,
  location,
  isHandTarget,
  onClick,
  postGameStage,
}: Props) {
  const { state, socket } = useClientContext();
  const layout = useBoardLayout();
  const updateCursorTarget = useCallback(
    (isClick = false) => {
      if (!isHandTarget) {
        return;
      }
      socket?.emit("update_hand", getCursorUpdate(card, location, isClick));
    },
    [card, isHandTarget, location, socket]
  );
  const handleClick = useCallback(() => {
    updateCursorTarget(true);
    onClick && onClick();
  }, [onClick, updateCursorTarget]);
  const board = state.board!;
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
      : [state.getActivePlayerIndex()];
  let scaleDown =
    location.type !== "field_stack" &&
    !fullSizePlayerIndices.includes(card.player);

  const source = useMemo(
    () => computed(() => getSource(card, state, location)),
    [card, state, location]
  ).get();

  let [positionX, positionY] = getPosition(card, state, location);
  let layoutArea: BoardLayoutArea = getCardLayoutArea(card, location);

  // Post-game animation:
  if (postGameStage) {
    const [px, py] = getPlayerLocation(
      card.player,
      state.getActivePlayerIndex()
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
    [source, JSON.stringify(toJS(card)), board.pileLocs, geometry.x, geometry.y]
  );
  const [{ isDragging, isDraggingOther, canDrag }, drag] = useDrag(
    () =>
      source.type === "field_stack"
        ? {
            type: "field_stack",
            item,
            collect: (monitor) => ({
              isDragging: !!monitor.isDragging(),
              canDrag: monitor.canDrag(),
              isDraggingOther:
                monitor.getItem() != null && monitor.getItem() !== item,
            }),
            isDragging: (monitor) => {
              const dragItem = monitor.getItem();
              if (dragItem == item) {
                return true;
              }
              return dragItem.index === item.index;
            },
            canDrag: () => source.type === "field_stack" && source.isTopCard,
          }
        : {
            type: "card",
            item,
            collect: (monitor) => ({
              isDragging: !!monitor.isDragging(),
              canDrag: monitor.canDrag(),
              isDraggingOther:
                monitor.getItem() != null && monitor.getItem() !== item,
              // TODO: Find a way to make this work, maybe a child component which
            }),
            isDragging: (monitor) => {
              if (monitor.getItem() == item) {
                return true;
              }
              const dragItem = monitor.getItem();
              if (dragItem.source == null || item.source == null) {
                return false;
              }
              return (
                dragItem.source.type === "solitaire" &&
                item.source.type === "solitaire" &&
                dragItem.source.pileIndex === item.source.pileIndex &&
                dragItem.source.slotIndex < item.source.slotIndex
              );
            },
            canDrag: () => source.type !== "other",
            // options: { dropEffect: "move" },
          },
    [source, item]
  );
  // So moving cards are "lifted" while moving
  useEffect(() => {
    setIsAnimating(true);
    const t = setTimeout(() => {
      setIsAnimating(false);
    }, 1000 + zIndex);
    return () => clearTimeout(t);
  }, [positionX, positionY, zIndex]);

  return (
    <div
      className={joinClasses(
        styles.root,
        onClick != null && styles.clickable,
        canDrag && styles.draggable
      )}
      style={
        {
          pointerEvents: isDraggingOther ? "none" : "",
          zIndex: zIndexBase + zIndex + (isAnimating ? 1000 : 0),
          "--c": color,
          "--r": geometry.rotationDegrees + "deg",
          "--x": geometry.x + "px",
          "--y": geometry.y + "px",
          "--s": geometry.screenScale,
          opacity: isDragging ? 0.25 : 1,
        } as any
      }
      onMouseEnter={updateCursorTarget}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") {
          updateCursorTarget();
        }
      }}
      onTouchStart={() => {
        if (!window.PointerEvent) {
          updateCursorTarget();
        }
      }}
      title={`${zIndex + 1} card(s)`}
      onClick={onClick ? handleClick : undefined}
      ref={drag}
    >
      <div className={styles.rotator}>
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
      };
  }
}
