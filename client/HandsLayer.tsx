import { observer } from "mobx-react-lite";
import CursorHand from "./CursorHand";
import { getCardKey, stableObject } from "./CardsLayer";
import {
  CardState,
  CursorLocation,
  getCursorItemCards,
  isCardCursorLocation,
} from "../shared/GameUtils";
import { useClientContext } from "./ClientContext";
import { FIELD_LEFT, FIELD_TOP, useBoardLayout } from "./BoardLayout";
import { CARD_BASE_SCALE, getCardScaleMultiplier } from "./cardLayout";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FIELD_PILE_AREA_SIZE,
  PLAYER_STACK_CARD_GAP,
  getPlayerStackLocation,
} from "../shared/CardLocations";
import {
  type CardLocation,
  type CardScreenGeometry,
  getCardRotationDegrees,
  getCardScreenGeometry,
  getPosition,
} from "./cardGeometry";

type CardWithLocation = { card: CardState; location: CardLocation };
type CursorGeometry = Pick<
  CardScreenGeometry,
  "centerX" | "centerY" | "layoutScale"
>;
type CardCursorTarget = {
  geometry: CardScreenGeometry;
  location: CardLocation;
};
export default observer(function HandsLayer() {
  const { state } = useClientContext();
  const layout = useBoardLayout();
  const hands = state.hands;
  const activePlayerIndex = state.getActivePlayerIndex();
  const fullSizePlayerIndices =
    layout.mode === "compact"
      ? layout.fullSizePlayerIndices
      : [activePlayerIndex];
  const board = state.board!;
  const cardsWithLocation: CardWithLocation[] = [
    ...board.piles.flatMap<CardWithLocation>((pile, pileIndex) =>
      pile.map((card, index) => {
        return {
          card,
          location: {
            type: "field_stack",
            stackIndex: pileIndex,
            isTopCard: index === pile.length - 1,
            cardIndex: index,
          },
        };
      })
    ),
    ...board.players.flatMap<CardWithLocation>((player, playerIndex) => {
      return [
        ...player.deck.map<CardWithLocation>((card, index) => {
          return {
            card,
            location: stableObject({ type: "deck", cardIndex: index }),
          };
        }),
        ...player.flippedDeck.map<CardWithLocation>((card, index) => {
          return {
            card,
            location: stableObject({
              type: "flippedDeck",
              cardIndex: index,
            }),
          };
        }),
        ...player.pounceDeck.map<CardWithLocation>((card, index) => {
          return {
            card,
            location: stableObject({
              type: "pounce",
              playerIndex,
              cardIndex: index,
            }),
          };
        }),
        ...player.stacks.flatMap<CardWithLocation>((stack, stackIndex) =>
          stack.map((card, index) => {
            return {
              card,
              location: stableObject({
                type: "solitaire",
                pileIndex: stackIndex,
                cardIndex: index,
              }),
            };
          })
        ),
      ];
    }),
  ];

  const cardLocs = new Map<string, CardCursorTarget>();
  cardsWithLocation.forEach((cardWithLoc) => {
    const card = cardWithLoc.card;
    const location = cardWithLoc.location;
    const isScaleDown =
      location.type !== "field_stack" &&
      !fullSizePlayerIndices.includes(card.player);
    cardLocs.set(getCardKey(card), {
      geometry: getCardScreenGeometry({
        card,
        isScaleDown,
        layout,
        location,
        position: getPosition(card, state, location),
        rotationDegrees: getCardRotationDegrees(board, card, location),
      }),
      location,
    });
  });
  const getCursorGeometry = (
    location: CursorLocation
  ): CursorGeometry | null => {
    if (isCardCursorLocation(location)) {
      const target = cardLocs.get(getCardKey(location));
      if (!target) {
        return null;
      }
      if (target.location.type !== "solitaire") {
        return target.geometry;
      }
      return {
        ...target.geometry,
        centerY:
          target.geometry.centerY +
          PLAYER_STACK_CARD_GAP * target.geometry.layoutScale,
      };
    }

    if (location.type === "field_slot") {
      const fieldArea = { type: "field" } as const;
      const layoutScale = layout.getScale(fieldArea);
      const [x, y] = layout.mapPoint(
        [
          FIELD_LEFT + location.position[0] * FIELD_PILE_AREA_SIZE,
          FIELD_TOP + location.position[1] * FIELD_PILE_AREA_SIZE,
        ],
        fieldArea
      );
      return {
        centerX: x + (CARD_WIDTH * CARD_BASE_SCALE * layoutScale) / 2,
        centerY: y + (CARD_HEIGHT * CARD_BASE_SCALE * layoutScale) / 2,
        layoutScale,
      };
    }

    if (!board.players[location.player]) {
      return null;
    }

    const playerArea = {
      type: "player",
      playerIndex: location.player,
    } as const;
    const layoutScale = layout.getScale(playerArea);
    const cardScale = getCardScaleMultiplier({
      area: playerArea,
      cardPlayer: location.player,
      fullSizePlayerIndices,
      isScaleDown: !fullSizePlayerIndices.includes(location.player),
      mode: layout.mode,
    });
    const [x, y] = layout.mapPoint(
      getPlayerStackLocation(
        location.player,
        location.pileIndex,
        0,
        activePlayerIndex
      ),
      playerArea
    );
    return {
      centerX: x + (CARD_WIDTH * cardScale * layoutScale) / 2,
      centerY: y + (CARD_HEIGHT * cardScale * layoutScale) / 2,
      layoutScale,
    };
  };
  return (
    <>
      {hands.map((hand, index) => {
        if (!hand.location || index === activePlayerIndex) {
          return null;
        }
        const cursorGeometry = getCursorGeometry(hand.location);
        if (!cursorGeometry) {
          return null;
        }
        return (
          <CursorHand
            cards={getCursorItemCards(hand)}
            x={cursorGeometry.centerX}
            y={cursorGeometry.centerY}
            scale={cursorGeometry.layoutScale}
            color={state.board!.players[index].color}
            key={index}
          />
        );
      })}
    </>
  );
});
