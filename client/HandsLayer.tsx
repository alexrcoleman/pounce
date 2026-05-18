import { observer } from "mobx-react-lite";
import CursorHand from "./CursorHand";
import { getCardKey, stableObject } from "./CardsLayer";
import { CardState } from "../shared/GameUtils";
import { useClientContext } from "./ClientContext";
import { useBoardLayout } from "./BoardLayout";
import {
  type CardLocation,
  type CardScreenGeometry,
  getCardRotationDegrees,
  getCardScreenGeometry,
  getPosition,
} from "./cardGeometry";

type CardWithLocation = { card: CardState; location: CardLocation };
export default observer(function HandsLayer() {
  const { state } = useClientContext();
  const layout = useBoardLayout();
  const hands = state.hands;
  const activePlayerIndex = state.getActivePlayerIndex();
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

  const cardLocs = new Map<string, CardScreenGeometry>();
  cardsWithLocation.forEach((cardWithLoc) => {
    const card = cardWithLoc.card;
    const location = cardWithLoc.location;
    const isScaleDown =
      location.type !== "field_stack" && card.player !== activePlayerIndex;
    cardLocs.set(
      getCardKey(card),
      getCardScreenGeometry({
        activePlayerIndex,
        card,
        isScaleDown,
        layout,
        location,
        position: getPosition(card, state, location),
        rotationDegrees: getCardRotationDegrees(board, card, location),
      })
    );
  });
  return (
    <>
      {hands.map((hand, index) => {
        if (!hand.location || index === activePlayerIndex) {
          return null;
        }
        const cardLoc = cardLocs.get(getCardKey(hand.location));
        if (!cardLoc) {
          return null;
        }
        return (
          <CursorHand
            card={hand.item}
            x={cardLoc.centerX}
            y={cardLoc.centerY}
            scale={cardLoc.layoutScale}
            color={state.board!.players[index].color}
            key={index}
          />
        );
      })}
    </>
  );
});
