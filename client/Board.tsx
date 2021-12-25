import type { BoardState, CardState } from "../shared/GameUtils";
import { useCallback, useEffect, useState } from "react";

import Card from "./Card";
import { CardDnDItem } from "./CardDnDItem";
import { DndProvider } from "react-dnd";
import FieldDragTarget from "./FieldDragTarget";
import FieldStackDragTarget from "./FieldStackDragTarget";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Move } from "../shared/PlayerUtils";
import Player from "./Player";
import ScoresTable from "./ScoresTable";
import StackDragTarget from "./StackDragTarget";
import { TouchBackend } from "react-dnd-touch-backend";
import VictoryOverlay from "./VictoryOverlay";
import isTouchDevice from "./isTouchDevice";
import styles from "./Board.module.css";

type Props = {
  board: BoardState;
  executeMove: (move: Move) => void;
  playerIndex: number;
  startGame: () => void;
  isHost: boolean;
};
export default function Board({
  board,
  isHost,
  executeMove,
  startGame,
  playerIndex: activePlayerIndex,
}: Props): JSX.Element {
  const cycleDeck = useCallback(() => {
    executeMove({ type: "cycle" });
  }, [executeMove]);
  const executeMoveCardToCenter = useCallback(
    (item: CardDnDItem, targetPile: number, position?: [number, number]) => {
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
        dest: targetPile,
        position,
      });
    },
    [executeMove]
  );
  const cards = board.piles
    .flatMap((pile, pileIndex) =>
      pile.map((card, index) => (
        <Card
          scaleDown={false}
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
        const [px, py] = getPlayerPosition(
          activePlayerIndex,
          board.players.length,
          playerIndex
        );
        return [
          player.deck.map((card, index) => (
            <Card
              scaleDown={player.index !== activePlayerIndex}
              card={card}
              faceUp={false}
              positionX={px + 5.5 * 60}
              positionY={py + 70 + index * 0.2}
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
              scaleDown={player.index !== activePlayerIndex}
              card={card}
              faceUp={true}
              positionX={px + 4.5 * 60}
              positionY={py + 70 + index * 0.1}
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
              scaleDown={player.index !== activePlayerIndex}
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
                scaleDown={player.index !== activePlayerIndex}
                card={card}
                faceUp={true}
                positionX={px + stackIndex * 60}
                positionY={py + 50 + index * 15}
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

  const firstOpenStack = board.piles.findIndex((pile) => pile.length === 0);
  const [useTouch, setUseTouch] = useState(false);
  useEffect(() => {
    setUseTouch(isTouchDevice());
  }, []);
  return (
    <DndProvider backend={useTouch ? TouchBackend : HTML5Backend}>
      <div className={styles.root}>
        <div className={styles.rootInside}>
          <div className={styles.pileSection} />
          <div className={styles.scores}>
            <ScoresTable board={board} />
          </div>
          {cards.sort((a, b) => ((a.key ?? "") < (b.key ?? "") ? -1 : 1))}
          {activePlayerIndex != -1 &&
            board.players[activePlayerIndex].stacks.map((stack, index) => {
              const [px, py] = getPlayerPosition(
                activePlayerIndex,
                board.players.length,
                activePlayerIndex
              );
              return (
                <StackDragTarget
                  key={index}
                  left={px + index * 60}
                  top={py + 50}
                  rotate={0}
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
              );
            })}
          <div style={{ position: "absolute", left: 550, top: 50 }}>
            <FieldDragTarget
              onDrop={(item, position) =>
                executeMoveCardToCenter(item, firstOpenStack, position)
              }
            />
          </div>
          {board.piles.map((pile, index) => (
            <FieldStackDragTarget
              key={index}
              card={pile[pile.length - 1]}
              stackHeight={pile.length}
              onDrop={(item) => executeMoveCardToCenter(item, index)}
              left={getBoardPilePosition(board, index)[0]}
              top={getBoardPilePosition(board, index)[1]}
              rotate={board.pileLocs[index][2] * 360}
            />
          ))}
          {board.players.map((p, i) => (
            <Player
              player={p}
              index={i}
              key={i}
              top={
                getPlayerPosition(activePlayerIndex, board.players.length, i)[1]
              }
            />
          ))}
          <VictoryOverlay board={board} startGame={startGame} isHost={isHost} />
        </div>
      </div>
    </DndProvider>
  );
}

function getBoardPilePosition(board: BoardState, index: number) {
  return [
    550 + board.pileLocs[index][0] * 500,
    50 + board.pileLocs[index][1] * 500,
  ];
}

function getPlayerPosition(
  activeIndex: number,
  playerCount: number,
  index: number
) {
  if (index == activeIndex) {
    return [80, 0];
  }
  return [
    80,
    180 + 165 * (((index - activeIndex + playerCount) % playerCount) - 1),
  ];
}

function getCardKey(card: CardState) {
  return card.player + ":" + card.value + "_" + card.suit;
}
