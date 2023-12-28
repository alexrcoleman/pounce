import { observer } from "mobx-react-lite";
import SocketState from "./SocketState";
import { useCallback, useMemo } from "react";
import { CardState } from "../shared/GameUtils";
import FieldStackDragTarget from "./FieldStackDragTarget";
import { Move } from "../shared/MoveHandler";
import { CardDnDItem } from "./CardDnDItem";
import { getBoardPileLocation } from "../shared/CardLocations";
import FieldDragTarget from "./FieldDragTarget";

export default observer(function FieldStackDragTargets({
  state,
  grabbedItem,
  executeMove,
  onUpdateDragHover,
}: {
  executeMove: (move: Move) => void;
  state: SocketState;
  grabbedItem: CardState | null;
  onUpdateDragHover: (item: CardState) => void;
}) {
  const executeMoveCardToCenter = useCallback(
    (item: CardDnDItem, targetPile: number, position?: [number, number]) => {
      executeMove({
        type: "c2c",
        source:
          item.source.type === "pounce"
            ? { type: "pounce" }
            : item.source.type === "flippedDeck"
            ? { type: "deck" }
            : item.source.type === "solitaire"
            ? { type: "solitaire", index: item.source.pileIndex }
            : { type: "deck" /* invalid */ },
        dest: targetPile,
        position,
      });
    },
    [executeMove]
  );
  const board = state.board!;
  const boardPiles = useMemo(() => {
    const indexedPiles = board.piles.map(
      (pile, index) => [pile, index] as const
    );
    // If a pile can be played on, sort it to the front
    if (grabbedItem) {
      const playablePiles = indexedPiles.filter(([pile]) => {
        const topCard = pile[pile.length - 1];
        if (
          topCard &&
          topCard.suit === grabbedItem.suit &&
          topCard.value === grabbedItem.value - 1
        ) {
          return true;
        }
        return false;
      });

      if (playablePiles.length >= 1) {
        const otherPiles = indexedPiles.filter(
          (pile) => !playablePiles.includes(pile)
        );
        return otherPiles.concat(playablePiles); //.concat(otherPiles);
      }
    }
    return indexedPiles;
  }, [board.piles.length, grabbedItem]);

  const firstOpenStack = board.piles.findIndex((pile) => pile.length === 0);
  const fieldDragTarget = (
    <div style={{ position: "absolute", left: 550, top: 50 }}>
      <FieldDragTarget
        onDrop={(item, position) =>
          executeMoveCardToCenter(item, firstOpenStack, position)
        }
        onMoveFieldStack={(item, position) =>
          executeMove({
            type: "move_field_stack",
            index: item.index,
            position,
          })
        }
      />
    </div>
  );
  const isDraggingAce = grabbedItem?.value === 1;
  // TODO: Handle dragging aces better
  return (
    <>
      {!isDraggingAce && fieldDragTarget}
      {boardPiles.map(([pile, index]) => (
        <FieldStackDragTarget
          key={index}
          card={pile[pile.length - 1]}
          stackHeight={pile.length}
          onUpdateDragTarget={onUpdateDragHover}
          onDrop={(item) => executeMoveCardToCenter(item, index)}
          left={getBoardPileLocation(board, index)[0]}
          top={getBoardPileLocation(board, index)[1]}
          rotate={board.pileLocs[index][2] * 360}
        />
      ))}
      {isDraggingAce && fieldDragTarget}
    </>
  );
});
