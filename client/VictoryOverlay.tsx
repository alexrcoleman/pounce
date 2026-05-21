import Confetti from "react-confetti";
import ScoresTable from "./ScoresTable";
import { observer } from "mobx-react-lite";
import { useClientContext } from "./ClientContext";
import { Button, Flex } from "antd";
import Link from "next/link";
import styles from "./VictoryOverlay.module.css";
import RoundAnalysisPanel from "./RoundAnalysisPanel";
import { useEffect, useState } from "react";

export default observer(function VictoryOverlay() {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const isHost = state.getIsHost();
  const pouncer = board.pouncer != null ? board.players[board.pouncer] : null;
  const activePlayerIndex = state.getActivePlayerIndex();
  const [isAnalysisOpen, setAnalysisOpen] = useState(false);

  useEffect(() => {
    setAnalysisOpen(false);
  }, [board.pouncer]);

  return pouncer != null ? (
    <div className={styles.overlay}>
      <div
        className={
          isAnalysisOpen
            ? `${styles.dialog} ${styles.analysisDialog}`
            : styles.dialog
        }
      >
        {isAnalysisOpen ? (
          <>
            <div className={styles.title}>Game Analysis</div>
            <RoundAnalysisPanel
              activePlayerIndex={activePlayerIndex}
              analysis={state.roundAnalysis}
            />
          </>
        ) : (
          <>
            <div className={styles.title}>
              <span>
                <i>Pounce!</i> by <b>{pouncer.name}</b>
              </span>
            </div>
            <ScoresTable board={board} />
          </>
        )}
        <Flex justify="end" align="center" className={styles.actions}>
          {isAnalysisOpen ? (
            <Button onClick={() => setAnalysisOpen(false)}>
              Back to Scoreboard
            </Button>
          ) : (
            <Button
              disabled={!state.roundAnalysis}
              onClick={() => setAnalysisOpen(true)}
            >
              Game Analysis
            </Button>
          )}
          <Link legacyBehavior href="/" passHref>
            <Button>Leave Room</Button>
          </Link>
          {!isAnalysisOpen &&
            (isHost ? (
              <>
                <Button onClick={() => socket?.emit("deal_hands")}>
                  Deal Hands
                </Button>
                <Button
                  type="primary"
                  onClick={() => socket?.emit("start_game")}
                >
                  Start Next Round
                </Button>
              </>
            ) : (
              "Waiting for host to start..."
            ))}
        </Flex>
      </div>
      <Confetti />
    </div>
  ) : null;
});
