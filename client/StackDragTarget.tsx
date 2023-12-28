import { CardDnDItem } from "./CardDnDItem";
import { CardState } from "../shared/GameUtils";
import { useDrop } from "react-dnd";
import { computed, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { couldMatch, peek } from "../shared/CardUtils";
import { useClientContext } from "./ClientContext";

type Props = {
  stack: CardState[];
  onDrop: (source: CardDnDItem) => void;
  left: number;
  top: number;
  onUpdateDragTarget: (card: CardState) => void;
};

const buffer = 4;
const black = ["clubs", "spades"];

export default observer(function StackDragTarget({
  onDrop,
  stack,
  left,
  top,
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
      drop: (item: CardDnDItem) => onDrop(item),
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
      }),
      canDrop: (item) => {
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
          // Technically could tuck another solitaire pile, but gets tricky (not quite right)
          // (item.source.type === "solitaire" && item.source.slotIndex === 0)
        }
        return false;
      },
      hover: () => card && onUpdateDragTarget(card),
    }),
    [onDrop, JSON.stringify(card), JSON.stringify(highestCard), hasEmptyStack]
  );
  // if (!canDrop) {
  //   return null;
  // }
  return (
    <div
      style={
        {
          height: 77 + Math.max(stackHeight - 1, 0) * 15 + 2 * buffer,
          width: 55 + 2 * buffer,
          backgroundColor: isOver && canDrop ? "rgba(255,255,0,.5)" : "",
          outline: canDrop ? "1px solid yellow" : "",
          borderRadius: 4,
          position: "absolute",
          "--s": 1.1,
          transform: `translate(${left - buffer}px, ${
            top - buffer
          }px) rotate(${0}deg) scale(var(--s), var(--s))`,
          zIndex: canDrop ? 100 : undefined,
        } as any
      }
      ref={drop}
    />
  );
});
