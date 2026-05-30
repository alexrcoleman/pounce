import { useEffect, useState } from "react";

import { Button } from "antd";
import Board from "../client/Board";
import { ClientContext } from "../client/ClientContext";
import Head from "next/head";
import Link from "next/link";
import LoadingState from "../client/LoadingState";
import type { NextPage } from "next";
import { observer } from "mobx-react-lite";
import styles from "../client/PounceRush.module.css";
import usePounceRushGame from "../client/usePounceRushGame";
import useStoredBoolean from "../client/useStoredBoolean";
import { useRouter } from "next/router";

const PounceRushPage: NextPage<{
  name: string;
  setName: (name: string) => void;
}> = observer(({ name, setName }) => {
  const router = useRouter();
  const [easyReadCards] = useStoredBoolean("pounce::easy-read-cards", true);
  const [leftHandedMode] = useState(false);
  const [scale] = useState(0.94);
  const playerName = name || "Player";
  const {
    actions,
    blockedAttemptCount,
    currentPuzzle,
    isAdvancingPuzzle,
    isConnected,
    puzzleNumber,
    remainingMs,
    score,
    state,
    status,
    stepIndex,
    socket,
  } = usePounceRushGame(playerName);

  useEffect(() => {
    if (!name) {
      const storedName = localStorage.getItem("pounce::name");
      if (storedName) {
        setName(storedName);
      }
    }
  }, [name, setName]);

  if (!isConnected || state.board == null || currentPuzzle == null) {
    return (
      <>
        <Head>
          <title>Pounce Rush | Pounce</title>
        </Head>
        <LoadingState
          title="Setting up Pounce Rush"
          detail="This usually takes a moment."
        />
      </>
    );
  }

  const isComplete = status === "complete";
  const isInteractionDisabled = isComplete || isAdvancingPuzzle;
  const sequenceLength = currentPuzzle.sequence.length;

  return (
    <>
      <Head>
        <title>Pounce Rush | Pounce</title>
      </Head>
      <div className={styles.root}>
        <ClientContext.Provider value={{ state, socket }}>
          <div className={styles.boardLayer}>
            <Board
              easyReadCards={easyReadCards}
              executeMove={actions.executeMove}
              isDeckCyclingBlocked
              isInteractionDisabled={isInteractionDisabled}
              isLeftHandedLayout={leftHandedMode}
              onBlockedMove={actions.onBlockedMove}
              onOpenRoomSettings={() => undefined}
              onUpdateHand={actions.onUpdateHand}
              roomId="Rush"
              zoom={scale}
            />
          </div>
        </ClientContext.Provider>

        <div className={styles.hud}>
          <div className={styles.hudGroup}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Time</span>
              <strong className={`${styles.metricValue} ${styles.timer}`}>
                {formatRemainingTime(remainingMs)}
              </strong>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Score</span>
              <strong className={styles.metricValue}>{score}</strong>
            </div>
          </div>
          <div className={styles.objective}>
            <div className={styles.objectiveText}>
              {currentPuzzle.objective}
            </div>
            <div className={styles.objectiveMeta}>
              Puzzle {puzzleNumber + 1} / {currentPuzzle.difficulty}{" "}
              {stepIndex + 1}/{sequenceLength}
            </div>
          </div>
          <div className={`${styles.hudGroup} ${styles.hudGroupRight}`}>
            <Link className={styles.homeLink} href="/">
              Home
            </Link>
          </div>
        </div>

        {blockedAttemptCount > 0 ? (
          <div
            className={styles.blockedCue}
            key={blockedAttemptCount}
            role="status"
          >
            <span className={styles.blockedIcon} aria-hidden="true" />
            Blocked
          </div>
        ) : null}

        {isComplete ? (
          <div className={styles.completionOverlay} role="dialog" aria-modal>
            <div className={styles.completionPanel}>
              <h1 className={styles.completionTitle}>Time</h1>
              <div className={styles.completionScore}>
                <strong>{score}</strong>
                <span>
                  {score === 1 ? "puzzle completed" : "puzzles completed"}
                </span>
              </div>
              <div className={styles.completionActions}>
                <Button
                  className={`${styles.completionButton} ${styles.completionPrimary}`}
                  onClick={actions.restart}
                  type="primary"
                >
                  Play again
                </Button>
                <Button
                  className={styles.completionButton}
                  onClick={() => router.push("/")}
                >
                  Home
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
});

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default PounceRushPage;
