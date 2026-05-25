import { observer } from "mobx-react-lite";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  PLAYER_STACK_CARD_GAP,
  getPlayerStackLocation,
} from "../shared/CardLocations";
import { CursorLocation } from "../shared/GameUtils";
import { Move } from "../shared/MoveHandler";
import { CardDnDItem } from "./CardDnDItem";
import StackDragTarget, {
  DropClientOffset,
  canDropOnSolitaireStack,
} from "./StackDragTarget";
import { useClientContext } from "./ClientContext";
import { useBoardLayout } from "./BoardLayout";
import { getCardScaleMultiplier } from "./cardLayout";

export default observer(function ActivePlayerStackTargets({
  onUpdateDragHover,
  executeMove,
}: {
  onUpdateDragHover: (location: CursorLocation) => void;
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
  const hasEmptyStack = stacks.some((stack) => stack.length === 0);
  const stackTargets = stacks.map((stack, index) => {
    const [left, top] = layout.mapPoint(
      getPlayerStackLocation(activePlayerIndex, index, 0, activePlayerIndex),
      playerArea
    );
    const visualWidth = CARD_WIDTH * cardScale * scale;
    const visualHeight =
      (CARD_HEIGHT * cardScale +
        Math.max(stack.length - 1, 0) * PLAYER_STACK_CARD_GAP) *
      scale;

    return {
      index,
      left,
      stack,
      centerX: left + visualWidth / 2,
      centerY: top + visualHeight / 2,
      top,
    };
  });
  const resolveDropStackIndex = (
    item: CardDnDItem,
    fallbackIndex: number,
    clientOffset?: DropClientOffset | null
  ): number => {
    if (!clientOffset) {
      return fallbackIndex;
    }

    const candidates = stackTargets.filter((target) =>
      canDropOnSolitaireStack(item, target.stack, hasEmptyStack)
    );
    if (candidates.length === 0) {
      return fallbackIndex;
    }

    return candidates.reduce((best, candidate) => {
      const bestDistance = getStackDropDistance(clientOffset, best);
      const candidateDistance = getStackDropDistance(clientOffset, candidate);
      return candidateDistance < bestDistance ? candidate : best;
    }, candidates[0]).index;
  };
  return (
    <>
      {stackTargets.map(({ stack, index, left, top }) => {
        return (
          <StackDragTarget
            onUpdateDragTarget={onUpdateDragHover}
            key={index}
            left={left}
            top={top}
            scale={scale}
            cardScale={cardScale}
            stack={stack}
            cursorLocation={{
              type: "solitaire_slot",
              player: activePlayerIndex,
              pileIndex: index,
            }}
            onDrop={(item: CardDnDItem, clientOffset) => {
              const dest = resolveDropStackIndex(item, index, clientOffset);
              if (item.source.type === "solitaire") {
                executeMove({
                  type: "s2s",
                  source: item.source.pileIndex,
                  dest,
                  count:
                    stacks[item.source.pileIndex].length -
                    item.source.slotIndex,
                });
              } else {
                executeMove({
                  type: "c2s",
                  source: item.source.type === "pounce" ? "pounce" : "deck",
                  dest,
                });
              }
            }}
          />
        );
      })}
    </>
  );
});

function getStackDropDistance(
  clientOffset: DropClientOffset,
  target: { centerX: number; centerY: number }
): number {
  const dx = clientOffset.x - target.centerX;
  const dy = clientOffset.y - target.centerY;
  return dx * dx + dy * dy;
}
