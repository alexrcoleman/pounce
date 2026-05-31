import { observer } from "mobx-react-lite";
import Card from "./Card";
import { useCallback, useEffect, useState } from "react";
import { Move } from "../shared/MoveHandler";
import {
  CardState,
  CursorState,
  getCursorItemCards,
} from "../shared/GameUtils";
import { useClientContext } from "./ClientContext";

export default observer(function CardsLayer({
  canInteract,
  isDeckCyclingBlocked = false,
  executeMove,
  onBlockedMove,
  visiblePlayerIndices,
}: {
  canInteract: boolean;
  isDeckCyclingBlocked?: boolean;
  executeMove: (move: Move) => void;
  onBlockedMove?: () => void;
  visiblePlayerIndices?: readonly number[];
}) {
  const { state } = useClientContext();
  const board = state.board!;
  const cycleDeck = useCallback(() => {
    executeMove({ type: "cycle" });
  }, [executeMove]);
  const flipDeck = useCallback(() => {
    executeMove({ type: "flip_deck" });
  }, [executeMove]);
  const onBlockedDeckClick = useCallback(() => {
    onBlockedMove?.();
  }, [onBlockedMove]);
  const activePlayerIndex = state.getActivePlayerIndex();
  const remoteDraggedCardKeys = getRemoteDraggedCardKeys(
    state.hands,
    activePlayerIndex
  );

  const [postGameStage, setPostGameStage] = useState(0);
  const shouldRunPostGameCleanup = !board.isActive && board.pouncer != null;
  useEffect(() => {
    let timeouts: NodeJS.Timeout[] = [];
    if (shouldRunPostGameCleanup) {
      for (let i = 1; i <= 3; i++) {
        timeouts.push(
          setTimeout(() => {
            setPostGameStage(i);
          }, i * 2000)
        );
      }
    } else {
      setPostGameStage(0);
    }
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [shouldRunPostGameCleanup]);
  const cards = board.piles
    .flatMap((pile, pileIndex) =>
      pile.map((card, index) => {
        return (
          <Card
            card={card}
            key={getCardKey(card)}
            canInteract={canInteract}
            location={stableObject({
              type: "field_stack",
              stackIndex: pileIndex,
              isTopCard: index === pile.length - 1,
              cardIndex: index,
            })}
            postGameStage={postGameStage}
            isHandTarget={canInteract}
            isRemoteCursorDragged={remoteDraggedCardKeys.has(
              getCardKey(card)
            )}
          />
        );
      })
    )
    .concat(
      board.players.flatMap((player, playerIndex) => {
        if (
          visiblePlayerIndices != null &&
          !visiblePlayerIndices.includes(playerIndex)
        ) {
          return [];
        }

        const isActivePlayer = playerIndex === activePlayerIndex;
        return [
          player.deck.map((card, index) => {
            const isTopCard = index === player.deck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                canInteract={canInteract}
                onClick={
                  canInteract && isActivePlayer && isTopCard
                    ? isDeckCyclingBlocked
                      ? onBlockedDeckClick
                      : cycleDeck
                    : undefined
                }
                isStockLocked={
                  isDeckCyclingBlocked && isActivePlayer && isTopCard
                }
                location={stableObject({ type: "deck", cardIndex: index })}
                isHandTarget={canInteract && isTopCard && isActivePlayer}
                isRemoteCursorDragged={remoteDraggedCardKeys.has(
                  getCardKey(card)
                )}
                postGameStage={postGameStage}
              />
            );
          }),
          player.flippedDeck.map((card, index) => {
            const isTopCard = index === player.flippedDeck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                canInteract={canInteract}
                location={stableObject({
                  type: "flippedDeck",
                  cardIndex: index,
                })}
                onClick={
                  canInteract && isActivePlayer && isTopCard
                    ? isDeckCyclingBlocked
                      ? onBlockedDeckClick
                      : flipDeck
                    : undefined
                }
                isHandTarget={canInteract && isTopCard && isActivePlayer}
                isRemoteCursorDragged={remoteDraggedCardKeys.has(
                  getCardKey(card)
                )}
                postGameStage={postGameStage}
              />
            );
          }),
          player.pounceDeck.map((card, index) => {
            const isTopCard = index === player.pounceDeck.length - 1;
            return (
              <Card
                card={card}
                key={getCardKey(card)}
                canInteract={canInteract}
                location={stableObject({
                  type: "pounce",
                  playerIndex,
                  cardIndex: index,
                })}
                isHandTarget={canInteract && isTopCard && isActivePlayer}
                isRemoteCursorDragged={remoteDraggedCardKeys.has(
                  getCardKey(card)
                )}
                postGameStage={postGameStage}
              />
            );
          }),
          player.stacks.flatMap((stack, stackIndex) =>
            stack.map((card, index) => {
              return (
                <Card
                  card={card}
                  key={getCardKey(card)}
                  canInteract={canInteract}
                  location={stableObject({
                    type: "solitaire",
                    pileIndex: stackIndex,
                    cardIndex: index,
                  })}
                  isHandTarget={canInteract && isActivePlayer}
                  isRemoteCursorDragged={remoteDraggedCardKeys.has(
                    getCardKey(card)
                  )}
                  postGameStage={postGameStage}
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

function getRemoteDraggedCardKeys(
  hands: CursorState[],
  activePlayerIndex: number
) {
  const keys = new Set<string>();
  hands.forEach((hand, index) => {
    if (index === activePlayerIndex) {
      return;
    }
    getCursorItemCards(hand).forEach((card) => keys.add(getCardKey(card)));
  });
  return keys;
}

const memo: Record<string, unknown> = {};
export function stableObject<T>(obj: T) {
  const key = JSON.stringify(obj);
  if (memo[key]) {
    return memo[key] as T;
  }
  return (memo[key] = obj);
}
