import Confetti from "react-confetti";
import ScoresTable from "./ScoresTable";
import { observer } from "mobx-react-lite";
import { useClientContext } from "./ClientContext";
import { Button, Flex } from "antd";
import Link from "next/link";
import styles from "./VictoryOverlay.module.css";
import RoundAnalysisPanel from "./RoundAnalysisPanel";
import { useEffect, useState } from "react";

const CONFETTI_DURATION_MS = 10_000;

export default observer(function VictoryOverlay() {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const isHost = state.getIsHost();
  const pouncer = board.pouncer != null ? board.players[board.pouncer] : null;
  const isAnalysisLoading = pouncer != null && !state.roundAnalysis;
  const activePlayerIndex = state.getActivePlayerIndex();
  const [isAnalysisOpen, setAnalysisOpen] = useState(false);
  const [isConfettiActive, setConfettiActive] = useState(false);

  useEffect(() => {
    setAnalysisOpen(false);

    if (board.pouncer == null) {
      setConfettiActive(false);
      return;
    }

    setConfettiActive(true);
    const timeoutId = window.setTimeout(() => {
      setConfettiActive(false);
    }, CONFETTI_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
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
            <div className={styles.analysisBody}>
              <RoundAnalysisPanel
                activePlayerIndex={activePlayerIndex}
                analysis={state.roundAnalysis}
              />
            </div>
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
        <Flex
          justify="end"
          align="center"
          className={
            isAnalysisOpen
              ? `${styles.actions} ${styles.analysisActions}`
              : styles.actions
          }
        >
          {isAnalysisOpen ? (
            <Button onClick={() => setAnalysisOpen(false)}>
              Back to Scoreboard
            </Button>
          ) : (
            <Button
              disabled={isAnalysisLoading}
              loading={isAnalysisLoading}
              onClick={() => setAnalysisOpen(true)}
            >
              {isAnalysisLoading ? "Analyzing" : "Game Analysis"}
            </Button>
          )}
          {!isAnalysisOpen && (
            <Link legacyBehavior href="/" passHref>
              <Button>Leave Room</Button>
            </Link>
          )}
          {!isAnalysisOpen &&
            (isHost ? (
              <Button type="primary" onClick={() => socket?.emit("deal_hands")}>
                Deal hands
              </Button>
            ) : (
              "Waiting for host to deal..."
            ))}
        </Flex>
      </div>
      {isConfettiActive && <Confetti />}
    </div>
  ) : null;
});
