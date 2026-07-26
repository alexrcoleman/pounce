import { observer } from "mobx-react-lite";
import SocketState from "./SocketState";
import { useCallback, useMemo } from "react";
import { CardState, CursorLocation } from "../shared/GameUtils";
import FieldStackDragTarget from "./FieldStackDragTarget";
import { Move } from "../shared/MoveHandler";
import { CardDnDItem } from "./CardDnDItem";
import { getBoardPileLocation } from "../shared/CardLocations";
import FieldDragTarget from "./FieldDragTarget";
import { FIELD_LEFT, FIELD_TOP, useBoardLayout } from "./BoardLayout";
import { getFieldCardRotationDegrees } from "./cardGeometry";
import { getCenterPileRaceWinner } from "./centerPileRace";
import { toastRejectedMove } from "./moveRejectionToast";

export default observer(function FieldStackDragTargets({
  state,
  grabbedItem,
  executeMove,
  onUpdateDragHover,
}: {
  executeMove: (move: Move) => void;
  state: SocketState;
  grabbedItem: CardState | null;
  onUpdateDragHover: (location: CursorLocation) => void;
}) {
  const executeMoveCardToCenter = useCallback(
    (item: CardDnDItem, targetPile: number, position?: [number, number]) => {
      executeMove(createCardToCenterMove(item, targetPile, position));
    },
    [executeMove]
  );
  const board = state.board!;
  const layout = useBoardLayout();
  const fieldArea = { type: "field" } as const;
  const fieldScale = layout.getScale(fieldArea);
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
  const [fieldLeft, fieldTop] = layout.mapPoint(
    [FIELD_LEFT, FIELD_TOP],
    fieldArea
  );
  const fieldDragTarget = (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate(${fieldLeft}px, ${fieldTop}px) scale(${fieldScale})`,
        transformOrigin: "0% 0%",
      }}
    >
      <FieldDragTarget
        onUpdateDragTarget={onUpdateDragHover}
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
      {boardPiles.map(([pile, index]) => {
        const [left, top] = layout.mapPoint(
          getBoardPileLocation(board, index),
          fieldArea
        );
        const topCard = pile[pile.length - 1];
        return (
          <FieldStackDragTarget
            key={index}
            pile={pile}
            pileIndex={index}
            stackHeight={pile.length}
            onUpdateDragTarget={onUpdateDragHover}
            onDrop={(item) => {
              const move = createCardToCenterMove(item, index);
              const playerIndex = state.getActivePlayerIndex();
              const winner = getCenterPileRaceWinner(
                pile,
                item.card,
                playerIndex
              );
              if (winner) {
                toastRejectedMove({
                  attemptedCard: item.card,
                  board,
                  confirmedCenterPileRace: true,
                  move,
                  playerIndex,
                });
                return;
              }
              executeMove(move);
            }}
            left={left}
            top={top}
            scale={fieldScale}
            rotate={
              topCard
                ? getFieldCardRotationDegrees(board, topCard, index)
                : board.pileLocs[index][2] * 360
            }
          />
        );
      })}
      {isDraggingAce && fieldDragTarget}
    </>
  );
});

function createCardToCenterMove(
  item: CardDnDItem,
  targetPile: number,
  position?: [number, number]
): Extract<Move, { type: "c2c" }> {
  return {
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
  };
}
