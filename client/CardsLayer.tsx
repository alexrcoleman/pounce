import { observer } from "mobx-react-lite";
import Card from "./Card";
import SocketState from "./SocketState";
import { useCallback } from "react";
import { Move } from "../shared/MoveHandler";
import { CardState } from "../shared/GameUtils";
import { useClientContext } from "./ClientContext";

export default observer(function CardsLayer() {
  const { socket, state } = useClientContext();
  const board = state.board!;
  const cycleDeck = useCallback(() => {
    socket?.emit("move", { type: "cycle" });
  }, [socket]);
  const flipDeck = useCallback(() => {
    socket?.emit("move", { type: "flip_deck" });
  }, [socket]);
  const cards = board.piles
    .flatMap((pile, pileIndex) =>
      pile.map((card, index) => {
        return (
          <Card
            card={card}
            key={getCardKey(card)}
            location={stableObject({
              type: "field_stack",
              stackIndex: pileIndex,
              isTopCard: index === pile.length - 1,
              cardIndex: index,
            })}
            isHandTarget={true}
          />
        );
      })
    )
    .concat(
      board.players.flatMap((player, playerIndex) => {
        const isActivePlayer = playerIndex === state.getActivePlayerIndex();
        return [
          player.deck.map((card, index) => {
            const isTopCard = index === player.deck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                onClick={isActivePlayer && isTopCard ? cycleDeck : undefined}
                location={stableObject({ type: "deck", cardIndex: index })}
                isHandTarget={isTopCard && isActivePlayer}
              />
            );
          }),
          player.flippedDeck.map((card, index) => {
            const isTopCard = index === player.flippedDeck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                location={stableObject({
                  type: "flippedDeck",
                  cardIndex: index,
                })}
                onClick={isActivePlayer && isTopCard ? flipDeck : undefined}
                isHandTarget={isTopCard && isActivePlayer}
              />
            );
          }),
          player.pounceDeck.map((card, index) => {
            const isTopCard = index === player.pounceDeck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                location={stableObject({
                  type: "pounce",
                  playerIndex,
                  cardIndex: index,
                })}
                isHandTarget={isTopCard && isActivePlayer}
              />
            );
          }),
          player.stacks.flatMap((stack, stackIndex) =>
            stack.map((card, index) => {
              return (
                <Card
                  card={card}
                  key={getCardKey(card)}
                  location={stableObject({
                    type: "solitaire",
                    pileIndex: stackIndex,
                    cardIndex: index,
                  })}
                  isHandTarget={isActivePlayer}
                />
              );
            })
          ),
        ].flat();
      })
    );

  // Sort by key to keep them stable
  cards.sort((a, b) => ((a.key ?? "") < (b.key ?? "") ? -1 : 1));

  return <>{cards}</>;
});

export function getCardKey(card: CardState) {
  return card.player + ":" + card.value + "_" + card.suit;
}

const memo: Record<string, unknown> = {};
export function stableObject<T>(obj: T) {
  const key = JSON.stringify(obj);
  if (memo[key]) {
    return memo[key] as T;
  }
  return (memo[key] = obj);
}
