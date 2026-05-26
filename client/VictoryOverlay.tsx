import Confetti from "react-confetti";
import ScoresTable from "./ScoresTable";
import { observer } from "mobx-react-lite";
import { useClientContext } from "./ClientContext";
import { Button, Flex } from "antd";
import Link from "next/link";
import styles from "./VictoryOverlay.module.css";
import RoundAnalysisPanel from "./RoundAnalysisPanel";
import { type ReactNode, type ReactPortal, useEffect, useState } from "react";

const { createPortal } = require("react-dom") as {
  createPortal: (
    children: ReactNode,
    container: Element | DocumentFragment
  ) => ReactPortal;
};

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

  useEffect(() => {
    if (!isAnalysisOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAnalysisOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isAnalysisOpen]);

  if (pouncer == null) {
    return null;
  }

  const overlay = (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.title}>
          <span>
            <i>Pounce!</i> by <b>{pouncer.name}</b>
          </span>
        </div>
        <ScoresTable board={board} />
        <Flex justify="end" align="center" className={styles.actions}>
          <Button
            aria-expanded={isAnalysisOpen}
            aria-haspopup="dialog"
            disabled={isAnalysisLoading}
            loading={isAnalysisLoading}
            onClick={() => setAnalysisOpen(true)}
          >
            {isAnalysisLoading ? "Analyzing" : "Game Analysis"}
          </Button>
          <Link legacyBehavior href="/" passHref>
            <Button>Leave Room</Button>
          </Link>
          {isHost ? (
            <Button type="primary" onClick={() => socket?.emit("deal_hands")}>
              Deal hands
            </Button>
          ) : (
            "Waiting for host to deal..."
          )}
        </Flex>
      </div>
      {isAnalysisOpen ? (
        <div
          className={styles.analysisOverlay}
          onClick={() => setAnalysisOpen(false)}
        >
          <div
            aria-labelledby="round-analysis-title"
            aria-modal="true"
            className={styles.analysisDialog}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className={styles.analysisHeader}>
              <div className={styles.analysisTitle} id="round-analysis-title">
                Game Analysis
              </div>
              <button
                aria-label="Close game analysis"
                className={styles.analysisCloseButton}
                onClick={() => setAnalysisOpen(false)}
                type="button"
              >
                X
              </button>
            </div>
            <div className={styles.analysisBody}>
              <RoundAnalysisPanel
                activePlayerIndex={activePlayerIndex}
                analysis={state.roundAnalysis}
              />
            </div>
            <Flex
              justify="end"
              align="center"
              className={`${styles.actions} ${styles.analysisActions}`}
            >
              <Button onClick={() => setAnalysisOpen(false)}>
                Back to Scoreboard
              </Button>
            </Flex>
          </div>
        </div>
      ) : null}
      {isConfettiActive && <Confetti />}
    </div>
  );

  return typeof document === "undefined"
    ? overlay
    : createPortal(overlay, document.body);
});
