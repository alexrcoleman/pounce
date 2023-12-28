import type { BoardState, CardState } from "../shared/GameUtils";
import { useEffect, useState } from "react";

import { DndProvider } from "react-dnd";
import DragReporter from "./DragReporter";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Move } from "../shared/MoveHandler";
import Player from "./Player";
import ScoresTable from "./ScoresTable";
import { TouchBackend } from "react-dnd-touch-backend";
import VictoryOverlay from "./VictoryOverlay";
import isTouchDevice from "./isTouchDevice";
import styles from "./Board.module.css";

import { observer } from "mobx-react-lite";
import CardsLayer from "./CardsLayer";
import HandsLayer from "./HandsLayer";
import FieldStackDragTargets from "./FieldStackDragTargets";
import ActivePlayerStackTargets from "./ActivePlayerStackTargets";
import { useClientContext } from "./ClientContext";
import { Button } from "antd";
type Props = {
  executeMove: (move: Move) => void;
  onUpdateHand: (card: CardState) => void;
};
export default observer(function Board({
  executeMove,
  onUpdateHand,
}: Props): JSX.Element {
  const { state, socket } = useClientContext();
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
          socket?.emit("update_hand", { item });
          setGrabbedItem(item);
        }}
      />
      <div className={styles.root}>
        <div className={styles.rootInside}>
          <PileSection />
          <ScoresTableTabOverlay board={board} />
          <ActivePlayerStackTargets
            executeMove={executeMove}
            onUpdateDragHover={onUpdateDragHover}
          />
          <FieldStackDragTargets
            state={state}
            grabbedItem={grabbedItem}
            onUpdateDragHover={onUpdateDragHover}
            executeMove={executeMove}
          />
          <CardsLayer />
          {board.players.map((p, i) => (
            <Player player={p} playerIndex={i} key={p.socketId ?? i} />
          ))}
          <HandsLayer />
          <VictoryOverlay />
        </div>
      </div>
    </DndProvider>
  );
});

const PileSection = observer(function PileSection() {
  const { state, socket } = useClientContext();

  return (
    <div className={styles.pileSection}>
      <div className={styles.pileSectionPattern} />
      {!state.board!.isActive && state.getIsHost() && (
        <Button type="primary" onClick={() => socket?.emit("start_game")}>
          Start Game
        </Button>
      )}
    </div>
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
