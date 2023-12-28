import type { BoardState, CardState, CursorState } from "../shared/GameUtils";
import { useCallback, useEffect, useMemo, useState } from "react";

import Card from "./Card";
import { CardDnDItem } from "./CardDnDItem";
import CursorHand from "./CursorHand";
import { DndProvider } from "react-dnd";
import DragReporter from "./DragReporter";
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

import { observer } from "mobx-react-lite";
import SocketState from "./SocketState";
import CardsLayer from "./CardsLayer";
import HandsLayer from "./HandsLayer";
import FieldStackDragTargets from "./FieldStackDragTargets";
import ActivePlayerStackTargets from "./ActivePlayerStackTargets";
type Props = {
  state: SocketState;
  executeMove: (move: Move) => void;
  startGame: () => void;
  isHost: boolean;
  onUpdateHand: (card: CardState) => void;
  onUpdateGrabbedItem: (card: CardState | null) => void;
};
export default observer(function Board({
  isHost,
  executeMove,
  onUpdateGrabbedItem,
  onUpdateHand,
  startGame,
  state,
}: Props): JSX.Element {
  const board = state.board!;

  const [useTouch, setUseTouch] = useState(false);
  useEffect(() => {
    setUseTouch(isTouchDevice());
  }, []);

  // TODO: Make this tracked separately
  const onUpdateDragHover = onUpdateHand;

  const [grabbedItem, setGrabbedItem] = useState<CardState | null>(null);
  return (
    <DndProvider backend={useTouch ? TouchBackend : HTML5Backend}>
      <DragReporter
        onUpdateGrabbedItem={(item) => {
          onUpdateGrabbedItem(item);
          setGrabbedItem(item);
        }}
      />
      <div className={styles.root}>
        <div className={styles.rootInside}>
          <div className={styles.pileSection}>
            <div className={styles.pileSectionPattern} />
          </div>
          <ScoresTableTabOverlay board={board} />
          <ActivePlayerStackTargets
            state={state}
            executeMove={executeMove}
            onUpdateDragHover={onUpdateDragHover}
          />
          <FieldStackDragTargets
            state={state}
            grabbedItem={grabbedItem}
            onUpdateDragHover={onUpdateDragHover}
            executeMove={executeMove}
          />
          <CardsLayer
            state={state}
            executeMove={executeMove}
            onUpdateHand={onUpdateHand}
          />
          {board.players.map((p, i) => (
            <Player
              state={state}
              player={p}
              playerIndex={i}
              key={p.socketId ?? i}
            />
          ))}
          <HandsLayer state={state} />
          <VictoryOverlay board={board} startGame={startGame} isHost={isHost} />
        </div>
      </div>
    </DndProvider>
  );
});

function ScoresTableTabOverlay({ board }: { board: BoardState }) {
  const [showScores, setShowScores] = useState(false);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setShowScores(true);
        e.preventDefault();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setShowScores(false);
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, []);
  if (!showScores) {
    return null;
  }
  return (
    <div className={styles.scores}>
      <ScoresTable board={board} />
    </div>
  );
}
