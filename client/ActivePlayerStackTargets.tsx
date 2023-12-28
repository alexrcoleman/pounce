import { observer } from "mobx-react-lite";
import { getPlayerLocation } from "../shared/CardLocations";
import { CardState } from "../shared/GameUtils";
import { Move } from "../shared/MoveHandler";
import { CardDnDItem } from "./CardDnDItem";
import SocketState from "./SocketState";
import StackDragTarget from "./StackDragTarget";

export default observer(function ActivePlayerStackTargets({
  state,
  onUpdateDragHover,
  executeMove,
}: {
  state: SocketState;
  onUpdateDragHover: (item: CardState) => void;
  executeMove: (move: Move) => void;
}) {
  const activePlayerIndex = state.getActivePlayerIndex();
  if (activePlayerIndex === -1) {
    return null;
  }
  const stacks = state.board!.players[activePlayerIndex].stacks;
  return (
    <>
      {stacks.map((stack, index) => {
        const [px, py] = getPlayerLocation(
          activePlayerIndex,
          activePlayerIndex
        );
        return (
          <StackDragTarget
            onUpdateDragTarget={onUpdateDragHover}
            key={index}
            left={px + index * 60}
            top={py + 50}
            rotate={0}
            card={stack[stack.length - 1]}
            stackHeight={stack.length}
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
