import { observer } from "mobx-react-lite";
import CursorHand from "./CursorHand";
import { getCardKey, stableObject } from "./CardsLayer";
import { CardState } from "../shared/GameUtils";
import { CardLocation, getPosition } from "./Card";
import { useClientContext } from "./ClientContext";
import { type BoardLayoutArea, useBoardLayout } from "./BoardLayout";

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

  const cardLocs = new Map<string, [number, number, number]>();
  cardsWithLocation.forEach((cardWithLoc) => {
    const card = cardWithLoc.card;
    const location = cardWithLoc.location;
    const [x, y] = getPosition(card, state, location);
    const layoutArea: BoardLayoutArea =
      location.type === "field_stack"
        ? { type: "field" }
        : { type: "player", playerIndex: card.player };
    const [mappedX, mappedY] = layout.mapPoint([x, y], layoutArea);
    cardLocs.set(getCardKey(card), [
      mappedX,
      mappedY,
      layout.getScale(layoutArea),
    ]);
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
            x={cardLoc[0] + 15 * cardLoc[2]}
            y={cardLoc[1]}
            scale={cardLoc[2]}
            color={state.board!.players[index].color}
            key={index}
          />
        );
      })}
    </>
  );
});
