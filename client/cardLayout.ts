import type { BoardLayoutArea, BoardLayoutMode } from "./BoardLayout";

export const CARD_BASE_SCALE = 1.1;
export const COMPACT_ACTIVE_CARD_SCALE = 1.2;

export function getCardScaleMultiplier({
  area,
  cardPlayer,
  fullSizePlayerIndices,
  isScaleDown,
  mode,
}: {
  area: BoardLayoutArea;
  cardPlayer: number;
  fullSizePlayerIndices: number[];
  isScaleDown: boolean;
  mode: BoardLayoutMode;
}) {
  const touchActiveScale =
    mode !== "standard" &&
    area.type === "player" &&
    fullSizePlayerIndices.includes(cardPlayer)
      ? COMPACT_ACTIVE_CARD_SCALE
      : 1;

  return (isScaleDown ? 0.9 : CARD_BASE_SCALE) * touchActiveScale;
}
