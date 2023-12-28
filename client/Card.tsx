import type { BoardState, CardState, Suits, Values } from "../shared/GameUtils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CardFace from "./CardFace";
import React from "react";
import { SourceType } from "./CardDnDItem";
import joinClasses from "./joinClasses";
import styles from "./Card.module.css";
import { useDrag } from "react-dnd";
import usePrevious from "./usePrevious";
import { observer } from "mobx-react-lite";
import SocketState from "./SocketState";
import {
  getBoardPileCardLocation,
  getPlayerDeckLocation,
  getPlayerFlippedDeckLocation,
  getPlayerPounceCardLocation,
  getPlayerStackLocation,
} from "../shared/CardLocations";
import { computed, toJS } from "mobx";
import { useClientContext } from "./ClientContext";

type Props = {
  card: CardState;
  onClick?: () => void;
  location: CardLocation;
  isHandTarget?: boolean;
};

/**
 * Renders a playing card at a given position.
 */
const CardContentMemo = observer(function CardContent({
  card,
  location,
  isHandTarget,
  onClick,
}: Props) {
  const { state, socket } = useClientContext();
  const onUpdateHand = useCallback(
    (card: CardState) => {
      socket?.emit("update_hand", { item: card });
    },
    [socket]
  );
  const onHover = isHandTarget ? onUpdateHand : undefined;
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

  const faceUp = computed(() => {
    return (
      location.type === "flippedDeck" ||
      (location.type === "pounce" && zIndex === pile.length - 1) ||
      (location.type === "field_stack" && zIndex < 12) ||
      location.type === "solitaire"
    );
  }).get();

  const scaleDown =
    location.type !== "field_stack" &&
    card.player !== state.getActivePlayerIndex();

  const rotation =
    location.type === "field_stack"
      ? board.pileLocs[location.stackIndex][2]
      : 0;

  const source = useMemo(
    () => computed(() => getSource(card, state, location)),
    [card, state, location]
  ).get();

  const [positionX, positionY] = getPosition(card, state, location);
  const color = board.players[card.player].color;
  const { suit, value } = card;
  const [isAnimating, setIsAnimating] = useState(false);
  const offset = useRef(Math.random() * 2 - 1);
  const rotationOffset = useRef(Math.random() * 2 - 1);
  const item = useMemo(
    () =>
      source.type === "field_stack"
        ? { index: source.index }
        : { source, card: toJS(card) },
    [source, JSON.stringify(toJS(card))]
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
    [source, card, positionX, positionY]
  );
  // For variance:
  const lastPx = usePrevious(positionX);
  if (positionX != lastPx) {
    offset.current = Math.random() * 2 - 1;
    // setRotation(Math.random() * 2 - 1);
  }

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
          zIndex: zIndex + (isAnimating ? 1000 : 0),
          "--c": color,
          "--r":
            rotation * 360 +
            rotationOffset.current * (rotation != 0 ? 10 : 2) +
            "deg",
          "--x": positionX + offset.current * 2 + "px",
          "--y": positionY + "px",
          "--s": scaleDown ? ".9" : "1.1",
          opacity: isDragging ? 0.4 : 1,
        } as any
      }
      onMouseEnter={() => onHover && onHover(card)}
      onTouchStart={() => onHover && onHover(card)}
      title={`${zIndex + 1} card(s)`}
      onClick={onClick}
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

export type CardLocation =
  | { type: "pounce"; cardIndex: number }
  | {
      type: "solitaire";
      pileIndex: number;
      cardIndex: number;
    }
  | { type: "flippedDeck"; cardIndex: number }
  | { type: "field_stack"; stackIndex: number; cardIndex: number }
  | { type: "deck"; cardIndex: number };

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
export function getPosition(
  card: CardState,
  state: SocketState,
  location: CardLocation
): [number, number] {
  const playerIndex = card.player;
  switch (location.type) {
    case "field_stack":
      return getBoardPileCardLocation(
        state.board!,
        location.stackIndex,
        location.cardIndex
      );
    case "flippedDeck":
      return getPlayerFlippedDeckLocation(
        playerIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
    case "deck":
      return getPlayerDeckLocation(
        playerIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
    case "pounce":
      return getPlayerPounceCardLocation(
        playerIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
    case "solitaire":
      return getPlayerStackLocation(
        playerIndex,
        location.pileIndex,
        location.cardIndex,
        state.getActivePlayerIndex()
      );
  }
}
