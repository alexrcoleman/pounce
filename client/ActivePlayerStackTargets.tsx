import { observer } from "mobx-react-lite";
import { getPlayerLocation } from "../shared/CardLocations";
import { CardState } from "../shared/GameUtils";
import { Move } from "../shared/MoveHandler";
import { CardDnDItem } from "./CardDnDItem";
import StackDragTarget from "./StackDragTarget";
import { useClientContext } from "./ClientContext";
import { useBoardLayout } from "./BoardLayout";

export default observer(function ActivePlayerStackTargets({
  onUpdateDragHover,
  executeMove,
}: {
  onUpdateDragHover: (item: CardState) => void;
  executeMove: (move: Move) => void;
}) {
  const { state } = useClientContext();
  const layout = useBoardLayout();
  const activePlayerIndex = state.getActivePlayerIndex();
  if (activePlayerIndex === -1) {
    return null;
  }
  const stacks = state.board!.players[activePlayerIndex].stacks;
  const playerArea = { type: "player", playerIndex: activePlayerIndex } as const;
  const [px, py] = getPlayerLocation(activePlayerIndex, activePlayerIndex);
  const scale = layout.getScale(playerArea);
  return (
    <>
      {stacks.map((stack, index) => {
        const [left, top] = layout.mapPoint(
          [px + index * 60, py + 50],
          playerArea
        );
        return (
          <StackDragTarget
            onUpdateDragTarget={onUpdateDragHover}
            key={index}
            left={left}
            top={top}
            scale={scale}
            stack={stack}
            onDrop={(item: CardDnDItem) => {
              if (item.source.type === "solitaire") {
                executeMove({
                  type: "s2s",
                  source: item.source.pileIndex,
                  dest: index,
                  count:
                    stacks[item.source.pileIndex].length -
                    item.source.slotIndex,
                });
              } else {
                executeMove({
                  type: "c2s",
                  source: item.source.type === "pounce" ? "pounce" : "deck",
                  dest: index,
                });
              }
            }}
          />
        );
      })}
    </>
  );
});
