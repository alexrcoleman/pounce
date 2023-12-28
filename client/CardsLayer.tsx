import { observer } from "mobx-react-lite";
import Card from "./Card";
import SocketState from "./SocketState";
import { useCallback } from "react";
import { Move } from "../shared/MoveHandler";
import { CardState } from "../shared/GameUtils";

export default observer(function CardsLayer({
  state,
  executeMove,
  onUpdateHand,
}: {
  state: SocketState;
  executeMove: (move: Move) => void;
  onUpdateHand: (card: CardState) => void;
}) {
  const board = state.board!;
  const cycleDeck = useCallback(() => {
    executeMove({ type: "cycle" });
  }, [executeMove]);
  const flipDeck = useCallback(() => {
    executeMove({ type: "flip_deck" });
  }, [executeMove]);
  const cards = board.piles
    .flatMap((pile, pileIndex) =>
      pile.map((card, index) => {
        return (
          <Card
            card={card}
            key={getCardKey(card)}
            state={state}
            location={stableObject({
              type: "field_stack",
              stackIndex: pileIndex,
              isTopCard: index === pile.length - 1,
              cardIndex: index,
            })}
            onHover={onUpdateHand}
          />
        );
      })
    )
    .concat(
      board.players.flatMap((player, playerIndex) => {
        const isActivePlayer = playerIndex === state.getActivePlayerIndex();
        const onHover = isActivePlayer ? onUpdateHand : undefined;
        return [
          player.deck.map((card, index) => {
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                state={state}
                onClick={
                  isActivePlayer && index === player.deck.length - 1
                    ? cycleDeck
                    : undefined
                }
                location={stableObject({ type: "deck", cardIndex: index })}
                onHover={index === player.deck.length - 1 ? onHover : undefined}
              />
            );
          }),
          player.flippedDeck.map((card, index) => {
            const isTopCard = index === player.flippedDeck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                state={state}
                location={stableObject({
                  type: "flippedDeck",
                  cardIndex: index,
                })}
                onClick={isActivePlayer && isTopCard ? flipDeck : undefined}
                onHover={isTopCard ? onHover : undefined}
              />
            );
          }),
          player.pounceDeck.map((card, index) => {
            const isTopCard = index === player.pounceDeck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                state={state}
                location={stableObject({
                  type: "pounce",
                  playerIndex,
                  cardIndex: index,
                })}
                onHover={isTopCard ? onHover : undefined}
              />
            );
          }),
          player.stacks.flatMap((stack, stackIndex) =>
            stack.map((card, index) => {
              return (
                <Card
                  card={card}
                  key={getCardKey(card)}
                  state={state}
                  location={stableObject({
                    type: "solitaire",
                    pileIndex: stackIndex,
                    cardIndex: index,
                  })}
                  onHover={onHover}
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
