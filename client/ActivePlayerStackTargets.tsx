import { observer } from "mobx-react-lite";
import { getPlayerStackLocation } from "../shared/CardLocations";
import { CardState } from "../shared/GameUtils";
import { Move } from "../shared/MoveHandler";
import { CardDnDItem } from "./CardDnDItem";
import StackDragTarget from "./StackDragTarget";
import { useClientContext } from "./ClientContext";
import { useBoardLayout } from "./BoardLayout";
import { getCardScaleMultiplier } from "./cardLayout";

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
  const scale = layout.getScale(playerArea);
  const isFullSizeActivePlayer =
    layout.mode !== "compact" ||
    layout.fullSizePlayerIndices.includes(activePlayerIndex);
  const cardScale = getCardScaleMultiplier({
    area: playerArea,
    cardPlayer: activePlayerIndex,
    fullSizePlayerIndices: layout.fullSizePlayerIndices,
    isScaleDown: !isFullSizeActivePlayer,
    mode: layout.mode,
  });
  return (
    <>
      {stacks.map((stack, index) => {
        const [left, top] = layout.mapPoint(
          getPlayerStackLocation(activePlayerIndex, index, 0, activePlayerIndex),
          playerArea
        );
        return (
          <StackDragTarget
            onUpdateDragTarget={onUpdateDragHover}
            key={index}
            left={left}
            top={top}
            scale={scale}
            cardScale={cardScale}
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
