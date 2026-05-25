import { CardDnDItem } from "./CardDnDItem";
import { CardState, CursorLocation } from "../shared/GameUtils";
import { useDrop } from "react-dnd";
import { computed, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { couldMatch, peek } from "../shared/CardUtils";
import { useClientContext } from "./ClientContext";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  PLAYER_STACK_CARD_GAP,
} from "../shared/CardLocations";

type Props = {
  stack: CardState[];
  onDrop: (source: CardDnDItem, clientOffset?: DropClientOffset | null) => void;
  left: number;
  top: number;
  scale?: number;
  cardScale?: number;
  cursorLocation: CursorLocation;
  onUpdateDragTarget: (location: CursorLocation) => void;
};

const buffer = 4;

export type DropClientOffset = {
  x: number;
  y: number;
};

export function canDropOnSolitaireStack(
  item: CardDnDItem,
  stack: CardState[],
  hasEmptyStack: boolean
): boolean {
  const card = peek(stack);
  const highestCard = stack[0];
  if (card == null) {
    return true;
  }
  if (!couldMatch(item.card, card)) {
    return false;
  }
  if (item.card.value === card.value - 1) {
    return true;
  }
  if (item.card.value === highestCard.value + 1) {
    return hasEmptyStack;
  }
  return false;
}

export default observer(function StackDragTarget({
  onDrop,
  stack,
  left,
  top,
  scale = 1,
  cardScale = 1.1,
  cursorLocation,
  onUpdateDragTarget,
}: Props) {
  const card = toJS(peek(stack));
  const highestCard = toJS(stack[0]);
  const stackHeight = stack.length;
  const { state } = useClientContext();
  const hasEmptyStack = computed(() =>
    state.board!.players[state.getActivePlayerIndex()].stacks.some(
      (s) => s.length === 0
    )
  ).get();
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: "card",
      drop: (item: CardDnDItem, monitor) =>
        onDrop(item, monitor.getClientOffset()),
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
      }),
      canDrop: (item) => canDropOnSolitaireStack(item, stack, hasEmptyStack),
      hover: () => onUpdateDragTarget(card ?? cursorLocation),
    }),
    [
      onDrop,
      onUpdateDragTarget,
      JSON.stringify(cursorLocation),
      stack,
      JSON.stringify(card),
      JSON.stringify(highestCard),
      hasEmptyStack,
    ]
  );
  // if (!canDrop) {
  //   return null;
  // }
  const targetWidth = CARD_WIDTH * cardScale * scale + 2 * buffer;
  const targetHeight =
    (CARD_HEIGHT * cardScale +
      Math.max(stackHeight - 1, 0) * PLAYER_STACK_CARD_GAP) *
      scale +
    2 * buffer;
  return (
    <div
      style={
        {
          height: targetHeight,
          width: targetWidth,
          backgroundColor: isOver && canDrop ? "rgba(255,255,0,.5)" : "",
          outline: canDrop ? "1px solid yellow" : "",
          borderRadius: 4,
          position: "absolute",
          transform: `translate(${left - buffer}px, ${top - buffer}px)`,
          zIndex: canDrop ? 100 : undefined,
        } as any
      }
      ref={drop}
    />
  );
});
