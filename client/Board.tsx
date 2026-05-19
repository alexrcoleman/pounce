import type { BoardState, CardState } from "../shared/GameUtils";
import { useEffect, useState } from "react";

import { DndProvider } from "react-dnd";
import DragReporter from "./DragReporter";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Move } from "../shared/MoveHandler";
import PlayerArea from "./PlayerArea";
import ScoresTable from "./ScoresTable";
import { TouchBackend } from "react-dnd-touch-backend";
import VictoryOverlay from "./VictoryOverlay";
import isTouchDevice from "./isTouchDevice";
import styles from "./Board.module.css";

import { observer } from "mobx-react-lite";
import CardsLayer from "./CardsLayer";
import HandsLayer from "./HandsLayer";
import HandPlatesLayer from "./HandPlatesLayer";
import FieldStackDragTargets from "./FieldStackDragTargets";
import ActivePlayerStackTargets from "./ActivePlayerStackTargets";
import MobileDragPreviewLayer from "./MobileDragPreviewLayer";
import { useClientContext } from "./ClientContext";
import { Button } from "antd";
import {
  BoardLayoutProvider,
  FIELD_LEFT,
  FIELD_SIZE,
  FIELD_TOP,
  useBoardLayout,
  useResponsiveBoardLayout,
} from "./BoardLayout";
type Props = {
  executeMove: (move: Move) => void;
  onUpdateHand: (card: CardState) => void;
  zoom: number;
};
export default observer(function Board({
  executeMove,
  onUpdateHand,
  zoom,
}: Props): JSX.Element | null {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const { layout, ref } = useResponsiveBoardLayout({
    activePlayerIndex: state.getActivePlayerIndex(),
    board,
    zoom,
  });

  const [useTouch, setUseTouch] = useState<boolean | null>(null);
  useEffect(() => {
    setUseTouch(isTouchDevice());
  }, []);

  // TODO: Make this tracked separately
  const onUpdateDragHover = onUpdateHand;

  const [grabbedItem, setGrabbedItem] = useState<CardState | null>(null);
  if (useTouch == null) {
    // Loading touch type still. Ideally we'd render still here, but
    // DnDProvider seems to struggle with backend changing
    return null;
  }
  return (
    <DndProvider
      backend={useTouch ? TouchBackend : HTML5Backend}
      key={String(useTouch)}
    >
      <DragReporter
        onUpdateGrabbedItem={(item) => {
          socket?.emit("update_hand", { item });
          setGrabbedItem(item);
        }}
      />
      <MobileDragPreviewLayer enabled={useTouch} />
      <div className={styles.root} data-layout-mode={layout.mode} ref={ref}>
        <BoardLayoutProvider value={layout}>
          <div className={styles.rootInside}>
            <PileSection />
            <ScoresTableTabOverlay board={board} />
            <HandPlatesLayer />
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
            <CardsLayer executeMove={executeMove} />
            {board.players.map((p, i) => (
              <PlayerArea player={p} playerIndex={i} key={p.socketId ?? i} />
            ))}
            <HandsLayer />
            <VictoryOverlay />
          </div>
        </BoardLayoutProvider>
      </div>
    </DndProvider>
  );
});

const PileSection = observer(function PileSection() {
  const { state, socket } = useClientContext();
  const layout = useBoardLayout();
  const fieldArea = { type: "field" } as const;
  const [left, top] = layout.mapPoint([FIELD_LEFT, FIELD_TOP], fieldArea);
  const scale = layout.getScale(fieldArea);

  return (
    <div
      className={styles.pileSection}
      style={{
        width: FIELD_SIZE,
        height: FIELD_SIZE,
        transform: `translate(${left}px, ${top}px) scale(${scale})`,
      }}
    >
      <div className={styles.pileSectionPattern} />
      {!state.board!.isActive && state.getIsHost() && (
        <Button
          className={styles.startButton}
          onClick={() => socket?.emit("start_game")}
        >
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
      <ScoresTable board={board} bufferRows={10} />
    </div>
  );
}
