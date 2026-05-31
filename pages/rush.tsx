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
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [scale] = useState(0.94);
  const visiblePlayerIndices = [0] as const;
  const playerName = name || "Player";
  const {
    actions,
    currentPuzzle,
    dailyDateKey,
    dailyOutcome,
    dailyTryCount,
    elapsedMs,
    feedback,
    hintCard,
    isAdvancingPuzzle,
    isBoardAnimationSuppressed,
    isConnected,
    puzzleHistory,
    puzzleNumber,
    remainingMs,
    reviewPuzzleNumber,
    runKind,
    score,
    seed,
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
  const isIdle = status === "idle";
  const isRunning = status === "running";
  const isInteractionDisabled = isIdle || isComplete || isAdvancingPuzzle;
  const sequenceLength = currentPuzzle.sequence.length;
  const displayedStep = Math.min(stepIndex + 1, sequenceLength);
  const isDailyComplete = dailyOutcome?.dateKey === dailyDateKey;
  const dailyLabel = formatDailyLabel(dailyDateKey);
  const isReviewingPuzzle = isComplete && reviewPuzzleNumber != null;
  const timeLabel = runKind === "daily" ? "Elapsed" : "Time";
  const timeValue =
    runKind === "daily"
      ? formatDuration(elapsedMs)
      : formatDuration(remainingMs);

  return (
    <>
      <Head>
        <title>Pounce Rush | Pounce</title>
      </Head>
      <div
        className={`${styles.root} ${
          isBoardAnimationSuppressed ? styles.suppressBoardAnimations : ""
        }`}
      >
        <ClientContext.Provider value={{ state, socket }}>
          <div className={styles.boardLayer}>
            <Board
              easyReadCards={easyReadCards}
              executeMove={actions.executeMove}
              hintCard={hintCard}
              isDeckCyclingBlocked
              isInteractionDisabled={isInteractionDisabled}
              isLeftHandedLayout={leftHandedMode}
              onBlockedMove={actions.onBlockedMove}
              onOpenRoomSettings={() => undefined}
              onUpdateHand={actions.onUpdateHand}
              roomId="Rush"
              visiblePlayerIndices={visiblePlayerIndices}
              zoom={scale}
            />
          </div>
        </ClientContext.Provider>

        <div className={styles.hud}>
          <div className={styles.hudGroup}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>{timeLabel}</span>
              <strong className={`${styles.metricValue} ${styles.timer}`}>
                {timeValue}
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
              {displayedStep}/{sequenceLength}
              {runKind === "daily" && isRunning ? ` / Try ${dailyTryCount}` : ""}
            </div>
          </div>
          <div className={`${styles.hudGroup} ${styles.hudGroupRight}`}>
            {isRunning ? (
              <button
                className={styles.hintButton}
                onClick={actions.showHint}
                type="button"
              >
                Hint
              </button>
            ) : null}
            <Link className={styles.homeLink} href="/">
              Home
            </Link>
          </div>
        </div>

        {feedback ? (
          <div
            className={`${styles.feedbackCue} ${
              feedback.tone === "success" ? styles.feedbackSuccess : ""
            }`}
            key={feedback.id}
            role="status"
          >
            <span className={styles.feedbackIcon} aria-hidden="true" />
            <span>
              <strong>{feedback.title}</strong>
              {feedback.detail ? <small>{feedback.detail}</small> : null}
            </span>
          </div>
        ) : null}

        {isIdle ? (
          <div className={styles.startOverlay} role="dialog" aria-modal>
            <div className={styles.startPanel}>
              <h1 className={styles.startTitle}>Pounce Rush</h1>
              <div className={styles.modeTabs} role="tablist">
                <button
                  aria-pressed={runKind === "daily"}
                  className={styles.modeTab}
                  data-complete={isDailyComplete ? "true" : "false"}
                  onClick={() => actions.selectRunKind("daily")}
                  type="button"
                >
                  <span>Daily Puzzle</span>
                  <small>
                    {isDailyComplete ? "Solved today" : dailyLabel}
                  </small>
                </button>
                <button
                  aria-pressed={runKind === "random"}
                  className={styles.modeTab}
                  onClick={() => actions.selectRunKind("random")}
                  type="button"
                >
                  <span>Random Puzzle</span>
                  <small>Fresh practice boards</small>
                </button>
              </div>
              <div className={styles.modeSummary}>
                {runKind === "daily" ? (
                  isDailyComplete ? (
                    <>
                      <strong>Daily complete</strong>
                      <span>Random puzzles are still open for practice.</span>
                    </>
                  ) : (
                    <>
                      <strong>One puzzle today</strong>
                      <span>Solve it once for time, tries, and streak.</span>
                    </>
                  )
                ) : (
                  <>
                    <strong>Unlimited practice</strong>
                    <span>New generated boards for finding rough edges.</span>
                  </>
                )}
              </div>
              <div className={styles.startActions}>
                <Button
                  className={`${styles.primaryButton} ${styles.startButton}`}
                  disabled={runKind === "daily" && isDailyComplete}
                  onClick={
                    runKind === "daily"
                      ? actions.startDaily
                      : actions.startRandom
                  }
                  type="primary"
                >
                  {runKind === "daily"
                    ? isDailyComplete
                      ? "Daily complete"
                      : "Start daily"
                    : "Start random"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isReviewingPuzzle ? (
          <div className={styles.reviewDock} role="status">
            <span>
              Reviewing Puzzle {reviewPuzzleNumber + 1}
              <small>{isPuzzleSolved(reviewPuzzleNumber, score) ? "Solved" : "Seen"}</small>
            </span>
            <button
              className={styles.reviewDockButton}
              onClick={actions.closePuzzlePreview}
              type="button"
            >
              Results
            </button>
          </div>
        ) : null}

        {isComplete && !isReviewingPuzzle ? (
          <div className={styles.completionOverlay} role="dialog" aria-modal>
            <div className={styles.completionPanel}>
              <h1 className={styles.completionTitle}>
                {runKind === "daily" ? "Daily Solved" : "Times Up"}
              </h1>
              {runKind === "daily" && dailyOutcome ? (
                <div className={styles.dailyResultGrid}>
                  <div>
                    <span>Time</span>
                    <strong>{formatDuration(dailyOutcome.durationMs)}</strong>
                  </div>
                  <div>
                    <span>Streak</span>
                    <strong>{dailyOutcome.streak}</strong>
                  </div>
                  <div>
                    <span>Tries</span>
                    <strong>{dailyOutcome.tries}</strong>
                  </div>
                </div>
              ) : (
                <div className={styles.completionScore}>
                  <strong>{score}</strong>
                  <span>
                    {score === 1 ? "puzzle solved" : "puzzles solved"}
                  </span>
                </div>
              )}
              <div className={styles.reviewList}>
                {puzzleHistory.map((entry) => (
                  <button
                    aria-pressed={reviewPuzzleNumber === entry.puzzleNumber}
                    className={styles.reviewItem}
                    key={entry.reportCode}
                    onClick={() => actions.peekPuzzle(entry.puzzleNumber)}
                    type="button"
                  >
                    <span>
                      Puzzle {entry.puzzleNumber + 1}
                      <small>
                        {isPuzzleSolved(entry.puzzleNumber, score)
                          ? "Solved"
                          : "Seen"}
                      </small>
                    </span>
                    <strong>{entry.objective}</strong>
                  </button>
                ))}
              </div>
              {runKind === "daily" && dailyOutcome ? (
                <pre className={styles.shareSummary}>
                  {dailyOutcome.shareText}
                </pre>
              ) : null}
              <div className={styles.completionActions}>
                {runKind === "random" ? (
                  <Button
                    className={`${styles.completionButton} ${styles.primaryButton}`}
                    onClick={() => {
                      setIsReportDialogOpen(false);
                      actions.startRandom();
                    }}
                    type="primary"
                  >
                    New random
                  </Button>
                ) : null}
                {runKind === "random" ? (
                  <Button
                    className={styles.completionButton}
                    onClick={() => {
                      setIsReportDialogOpen(false);
                      actions.restart();
                    }}
                  >
                    Replay set
                  </Button>
                ) : null}
                <Button
                  className={`${styles.completionButton} ${
                    runKind === "daily" ? styles.primaryButton : ""
                  }`}
                  onClick={
                    runKind === "daily"
                      ? actions.copyDailyShareText
                      : () => setIsReportDialogOpen(true)
                  }
                  type={runKind === "daily" ? "primary" : "default"}
                >
                  {runKind === "daily" ? "Copy summary" : "Report puzzles"}
                </Button>
                {runKind === "daily" ? (
                  <Button
                    className={styles.completionButton}
                    onClick={() => {
                      setIsReportDialogOpen(false);
                      actions.startRandom();
                    }}
                  >
                    Random puzzle
                  </Button>
                ) : null}
                {runKind === "daily" ? (
                  <Button
                    className={styles.completionButton}
                    onClick={() => setIsReportDialogOpen(true)}
                  >
                    Report puzzles
                  </Button>
                ) : null}
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

        {isReportDialogOpen && isComplete && !isReviewingPuzzle ? (
          <div className={styles.reportOverlay} role="dialog" aria-modal>
            <div className={styles.reportPanel}>
              <h2>Report Puzzles</h2>
              <div className={styles.reportCodeBlock}>
                <span>{runKind === "daily" ? "Daily puzzle" : "Report code"}</span>
                <strong>{runKind === "daily" ? dailyLabel : seed}</strong>
              </div>
              <div className={styles.reportList}>
                {puzzleHistory.map((entry) => (
                  <div className={styles.reportItem} key={entry.reportCode}>
                    <span>
                      Puzzle {entry.puzzleNumber + 1} -{" "}
                      {isPuzzleSolved(entry.puzzleNumber, score)
                        ? "Solved"
                        : "Seen"}
                    </span>
                    <strong>{entry.reportCode}</strong>
                  </div>
                ))}
              </div>
              <div className={styles.reportActions}>
                <Button
                  className={styles.completionButton}
                  onClick={() => setIsReportDialogOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
});

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDailyLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return dateKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function isPuzzleSolved(puzzleNumber: number, score: number): boolean {
  return puzzleNumber < score;
}

export default PounceRushPage;
