import type { BoardLayoutArea, BoardLayoutMode } from "./BoardLayout";

export const CARD_BASE_SCALE = 1.1;
export const COMPACT_ACTIVE_CARD_SCALE = 1.2;

export function getCardScaleMultiplier({
  area,
  cardPlayer,
  activePlayerIndex,
  isScaleDown,
  mode,
}: {
  area: BoardLayoutArea;
  cardPlayer: number;
  activePlayerIndex: number;
  isScaleDown: boolean;
  mode: BoardLayoutMode;
}) {
  const compactActiveScale =
    mode === "compact" &&
    area.type === "player" &&
    cardPlayer === activePlayerIndex
      ? COMPACT_ACTIVE_CARD_SCALE
      : 1;

  return (isScaleDown ? 0.9 : CARD_BASE_SCALE) * compactActiveScale;
}
