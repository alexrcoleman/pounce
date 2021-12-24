import type { BoardState, CardState } from "../shared/GameUtils";
import { RefObject, useCallback } from "react";

import Card from "./Card";
import { CardDnDItem } from "./CardDnDItem";
import { DndProvider } from "react-dnd";
import FieldDragTarget from "./FieldDragTarget";
import FieldStackDragTarget from "./FieldStackDragTarget";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Move } from "../shared/PlayerUtils";
import Player from "./Player";
import { Socket } from "socket.io-client";
import StackDragTarget from "./StackDragTarget";
import styles from "./Board.module.css";

type Props = {
  board: BoardState;
  executeMove: (move: Move) => void;
  playerIndex: number;
};
export default function Board({
  board,
  executeMove,
  playerIndex: activePlayerIndex,
}: Props): JSX.Element {
  const cycleDeck = useCallback(() => {
    executeMove({ type: "cycle" });
  }, [executeMove]);
  const executeMoveCardToCenter = useCallback(
    (item: CardDnDItem) => {
      executeMove({
        type: "c2c",
        source:
          item.source.type === "pounce"
            ? { type: "pounce" }
            : item.source.type === "flippedDeck"
            ? { type: "deck" }
            : item.source.type === "solitaire"
            ? { type: "solitaire", index: item.source.pileIndex }
            : { type: "deck" /* invalid */ },
      });
    },
    [executeMove]
  );
  const cards = board.piles
    .flatMap((pile, pileIndex) =>
      pile.map((card, index) => (
        <Card
          card={card}
          faceUp={index < 12}
          positionX={getBoardPilePosition(board, pileIndex)[0]}
          positionY={getBoardPilePosition(board, pileIndex)[1] + index * 0.2}
          key={getCardKey(card)}
          zIndex={index}
          boardState={board}
          rotation={board.pileLocs[pileIndex][2]}
          source={{ type: "other" }}
        />
      ))
    )
    .concat(
      board.players.flatMap((player, playerIndex) => {
        const [px, py] = getPlayerPosition(playerIndex);
        return [
          player.deck.map((card, index) => (
            <Card
              card={card}
              faceUp={false}
              positionX={px + 6 * 60}
              positionY={py + 50 + index * 0.2}
              key={getCardKey(card)}
              zIndex={index}
              boardState={board}
              onClick={
                playerIndex === activePlayerIndex ? cycleDeck : undefined
              }
              source={{ type: "other" }}
            />
          )),
          player.flippedDeck.map((card, index) => (
            <Card
              card={card}
              faceUp={true}
              positionX={px + 5 * 60}
              positionY={py + 50 + index * 0.1}
              key={getCardKey(card)}
              zIndex={index}
              boardState={board}
              source={
                playerIndex === activePlayerIndex &&
                index === player.flippedDeck.length - 1
                  ? { type: "flippedDeck" }
                  : { type: "other" }
              }
              onClick={
                playerIndex === activePlayerIndex && player.deck.length === 0
                  ? cycleDeck
                  : undefined
              }
            />
          )),
          player.pounceDeck.map((card, index) => (
            <Card
              card={card}
              faceUp={index === player.pounceDeck.length - 1}
              positionX={px - 60}
              positionY={py + 100 + index * 0.1}
              key={getCardKey(card)}
              zIndex={index}
              boardState={board}
              source={
                playerIndex === activePlayerIndex &&
                index === player.pounceDeck.length - 1
                  ? { type: "pounce" }
                  : { type: "other" }
              }
            />
          )),
          player.stacks.flatMap((stack, stackIndex) =>
            stack.map((card, index) => (
              <Card
                card={card}
                faceUp={true}
                positionX={px + stackIndex * 60}
                positionY={py + 50 + index * 10}
                key={getCardKey(card)}
                zIndex={index}
                boardState={board}
                source={
                  playerIndex === activePlayerIndex
                    ? {
                        type: "solitaire",
                        pileIndex: stackIndex,
                        slotIndex: index,
                      }
                    : { type: "other" }
                }
              />
            ))
          ),
        ].flat();
      })
    );

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={styles.root}>
        <div className={styles.rootInside}>
          <div className={styles.pileSection} />
          {cards.sort((a, b) => ((a.key ?? "") < (b.key ?? "") ? -1 : 1))}
          {activePlayerIndex != -1 &&
            board.players[activePlayerIndex].stacks.map((stack, index) => {
              const [px, py] = getPlayerPosition(activePlayerIndex);
              return (
                <div
                  style={{
                    position: "absolute",
                    left: px + index * 60,
                    top: py + 50,
                    zIndex: 10000,
                  }}
                  key={index}
                >
                  <StackDragTarget
                    card={stack[stack.length - 1]}
                    stackHeight={stack.length}
                    onDrop={(item: CardDnDItem) => {
                      if (item.source.type === "solitaire") {
                        executeMove({
                          type: "s2s",
                          source: item.source.pileIndex,
                          dest: index,
                          count:
                            board.players[activePlayerIndex].stacks[
                              item.source.pileIndex
                            ].length - item.source.slotIndex,
                        });
                      } else {
                        executeMove({
                          type: "c2s",
                          source:
                            item.source.type === "pounce" ? "pounce" : "deck",
                          dest: index,
                        });
                      }
                    }}
                  />
                </div>
              );
            })}
          <div style={{ position: "absolute", left: 600, top: 50 }}>
            <FieldDragTarget onDrop={executeMoveCardToCenter} />
          </div>
          {board.piles.map((pile, index) => (
            <div
              style={{
                position: "absolute",
                left: getBoardPilePosition(board, index)[0],
                top: getBoardPilePosition(board, index)[1],
                transform: `rotate(${board.pileLocs[index][2] * 360}deg)`,
                zIndex: 10000,
              }}
              key={index}
            >
              <FieldStackDragTarget
                card={pile[pile.length - 1]}
                stackHeight={pile.length}
                onDrop={executeMoveCardToCenter}
              />
            </div>
          ))}
          {board.players.map((p, i) => (
            <Player player={p} index={i} key={i} />
          ))}
          {board.pouncer != null && (
            <div
              style={{
                zIndex: 1000000,
                backgroundColor: "rgba(0,0,0,.5)",
                width: "100%",
                height: "100%",
                position: "absolute",
              }}
            >
              <div
                style={{
                  zIndex: 1000000,
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  borderRadius: 4,
                  padding: 20,
                  backgroundColor: "white",
                  border: "2px solid #ddd",
                }}
              >
                Pounce by {board.players[board.pouncer].name}
              </div>
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
}

function getBoardPilePosition(board: BoardState, index: number) {
  return [
    600 + board.pileLocs[index][0] * 500,
    50 + board.pileLocs[index][1] * 500,
  ];
}

function getPlayerPosition(index: number) {
  return [80, 175 * index];
}

function getCardKey(card: CardState) {
  return card.player + ":" + card.value + "_" + card.suit;
}
