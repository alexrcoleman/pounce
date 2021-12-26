import type { BoardState, CardState } from "../shared/GameUtils";
import { useCallback, useEffect, useState } from "react";

import Card from "./Card";
import { CardDnDItem } from "./CardDnDItem";
import CursorHand from "./CursorHand";
import { DndProvider } from "react-dnd";
import FieldDragTarget from "./FieldDragTarget";
import FieldStackDragTarget from "./FieldStackDragTarget";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Move } from "../shared/MoveHandler";
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
  hands: { location: CardState | null }[];
  onUpdateHand: (card: CardState) => void;
};
export default function Board({
  board,
  isHost,
  executeMove,
  onUpdateHand,
  hands,
  startGame,
  playerIndex: activePlayerIndex,
}: Props): JSX.Element {
  const cycleDeck = useCallback(() => {
    executeMove({ type: "cycle" });
  }, [executeMove]);
  const flipDeck = useCallback(() => {
    executeMove({ type: "flip_deck" });
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
  const playerPositions = board.players.map((_, index) =>
    index == activePlayerIndex
      ? [80, 0]
      : [
          80,
          180 +
            165 *
              (((index - activePlayerIndex + board.players.length) %
                board.players.length) -
                1),
        ]
  );

  let cardLocs: Record<string, [number, number]> = {};
  const cards = board.piles
    .flatMap((pile, pileIndex) =>
      pile.map((card, index) => {
        const pile = getBoardPilePosition(board, pileIndex);
        const loc: [number, number] = [pile[0], pile[1] + index * 0.2];
        cardLocs[getCardKey(card)] = loc;
        return (
          <Card
            scaleDown={false}
            card={card}
            faceUp={index < 12}
            positionX={loc[0]}
            positionY={loc[1]}
            key={getCardKey(card)}
            zIndex={index}
            boardState={board}
            rotation={board.pileLocs[pileIndex][2]}
            source={{
              type: "field_stack",
              index: pileIndex,
              isTopCard: index === pile.length - 1,
            }}
            onHover={onUpdateHand}
          />
        );
      })
    )
    .concat(
      board.players.flatMap((player, playerIndex) => {
        const [px, py] = playerPositions[playerIndex];
        return [
          player.deck.map((card, index) => {
            const loc: [number, number] = [
              px + 5.5 * 60,
              py + 70 + index * 0.2,
            ];
            cardLocs[getCardKey(card)] = loc;
            return (
              <Card
                scaleDown={playerIndex !== activePlayerIndex}
                card={card}
                faceUp={false}
                positionX={loc[0]}
                positionY={loc[1]}
                key={getCardKey(card)}
                zIndex={index}
                boardState={board}
                onClick={
                  playerIndex === activePlayerIndex &&
                  index === player.deck.length - 1
                    ? cycleDeck
                    : undefined
                }
                source={{ type: "other" }}
                onHover={
                  playerIndex === activePlayerIndex &&
                  index === player.deck.length - 1
                    ? onUpdateHand
                    : undefined
                }
              />
            );
          }),
          player.flippedDeck.map((card, index) => {
            const loc: [number, number] = [
              px + 4.5 * 60,
              py + 70 + index * 0.1,
            ];
            cardLocs[getCardKey(card)] = loc;
            return (
              <Card
                scaleDown={playerIndex !== activePlayerIndex}
                card={card}
                faceUp={true}
                positionX={loc[0]}
                positionY={loc[1]}
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
                  playerIndex === activePlayerIndex &&
                  index === player.flippedDeck.length - 1
                    ? flipDeck
                    : undefined
                }
                onHover={
                  playerIndex === activePlayerIndex &&
                  index === player.flippedDeck.length - 1
                    ? onUpdateHand
                    : undefined
                }
              />
            );
          }),
          player.pounceDeck.map((card, index) => {
            const loc: [number, number] = [px - 60, py + 100 + index * 0.1];
            cardLocs[getCardKey(card)] = loc;
            return (
              <Card
                scaleDown={playerIndex !== activePlayerIndex}
                card={card}
                faceUp={index === player.pounceDeck.length - 1}
                positionX={loc[0]}
                positionY={loc[1]}
                key={getCardKey(card)}
                zIndex={index}
                boardState={board}
                source={
                  playerIndex === activePlayerIndex &&
                  index === player.pounceDeck.length - 1
                    ? { type: "pounce" }
                    : { type: "other" }
                }
                onHover={
                  playerIndex === activePlayerIndex &&
                  index === player.pounceDeck.length - 1
                    ? onUpdateHand
                    : undefined
                }
              />
            );
          }),
          player.stacks.flatMap((stack, stackIndex) =>
            stack.map((card, index) => {
              const loc: [number, number] = [
                px + stackIndex * 60,
                py + 50 + index * 15,
              ];
              cardLocs[getCardKey(card)] = loc;
              return (
                <Card
                  scaleDown={playerIndex !== activePlayerIndex}
                  card={card}
                  faceUp={true}
                  positionX={loc[0]}
                  positionY={loc[1]}
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
                  onHover={
                    playerIndex === activePlayerIndex ? onUpdateHand : undefined
                  }
                />
              );
            })
          ),
        ].flat();
      })
    );

  const firstOpenStack = board.piles.findIndex((pile) => pile.length === 0);
  const [useTouch, setUseTouch] = useState(false);
  useEffect(() => {
    setUseTouch(isTouchDevice());
  }, []);

  // TODO: Make this tracked separately
  const onUpdateDragHover = onUpdateHand;
  return (
    <DndProvider backend={useTouch ? TouchBackend : HTML5Backend}>
      <div className={styles.root}>
        <div className={styles.rootInside}>
          <div className={styles.pileSection} />
          <div className={styles.scores}>
            <ScoresTable board={board} />
          </div>
          <div style={{ position: "absolute", left: 550, top: 50 }}>
            <FieldDragTarget
              onDrop={(item, position) =>
                executeMoveCardToCenter(item, firstOpenStack, position)
              }
              onMoveFieldStack={(item, position) =>
                executeMove({
                  type: "move_field_stack",
                  index: item.index,
                  position,
                })
              }
            />
          </div>
          {activePlayerIndex != -1 &&
            board.players[activePlayerIndex].stacks.map((stack, index) => {
              const [px, py] = playerPositions[activePlayerIndex];
              return (
                <StackDragTarget
                  onUpdateDragTarget={onUpdateDragHover}
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
          {board.piles.map((pile, index) => (
            <FieldStackDragTarget
              key={index}
              card={pile[pile.length - 1]}
              stackHeight={pile.length}
              onUpdateDragTarget={onUpdateDragHover}
              onDrop={(item) => executeMoveCardToCenter(item, index)}
              left={getBoardPilePosition(board, index)[0]}
              top={getBoardPilePosition(board, index)[1]}
              rotate={board.pileLocs[index][2] * 360}
            />
          ))}
          {cards.sort((a, b) => ((a.key ?? "") < (b.key ?? "") ? -1 : 1))}
          {board.players.map((p, i) => (
            <Player player={p} index={i} key={i} top={playerPositions[i][1]} />
          ))}
          {hands.map((hand, index) => {
            if (!hand.location || index === activePlayerIndex) {
              return null;
            }
            const cardLoc = cardLocs[getCardKey(hand.location)];
            if (!cardLoc) {
              return null;
            }
            return (
              <CursorHand
                x={cardLoc[0] + 15}
                y={cardLoc[1]}
                color={board.players[index].color}
                key={index}
              />
            );
          })}
          {board.players.map(
            (player, index) =>
              player.pounceDeck.length > 0 && (
                <div
                  key={index}
                  style={{
                    zIndex: 10000,
                    color: "white",
                    fontSize: "12px",
                    width: 55,
                    textAlign: "center",
                    position: "absolute",
                    transform: `translate(${
                      playerPositions[index][0] - 60
                    }px, ${playerPositions[index][1] + 80}px)`,
                  }}
                >
                  {player.pounceDeck.length}
                </div>
              )
          )}
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

function getCardKey(card: CardState) {
  return card.player + ":" + card.value + "_" + card.suit;
}
