import { useEffect, useState } from "react";

import { Button } from "antd";
import Board from "../client/Board";
import { ClientProvider } from "../client/ClientContext";
import { useClientSettingsStore } from "../client/ClientSettingsStore";
import Head from "next/head";
import Link from "next/link";
import LoadingState from "../client/LoadingState";
import type { NextPage } from "next";
import { observer } from "mobx-react-lite";
import styles from "../client/PounceRush.module.css";
import usePounceRushGame from "../client/usePounceRushGame";
import { useRouter } from "next/router";

const PounceRushPage: NextPage<{
  name: string;
  setName: (name: string) => void;
}> = observer(({ name, setName }) => {
  const router = useRouter();
  const settings = useClientSettingsStore({ scale: 0.94 });
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const visiblePlayerIndices = [0] as const;
  const playerName = name || "Player";
  const {
    actions,
    currentPuzzle,
    dailyDateKey,
    dailyOutcome,
    dailyRushOutcome,
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
  const isDailyPuzzle = runKind === "daily_puzzle";
  const isDailyRush = runKind === "daily_rush";
  const isInteractionDisabled = isIdle || isComplete || isAdvancingPuzzle;
  const sequenceLength = currentPuzzle.sequence.length;
  const displayedStep = Math.min(stepIndex + 1, sequenceLength);
  const isDailyPuzzleComplete = dailyOutcome?.dateKey === dailyDateKey;
  const isDailyRushComplete = dailyRushOutcome?.dateKey === dailyDateKey;
  const isSelectedDailyComplete =
    (isDailyPuzzle && isDailyPuzzleComplete) ||
    (isDailyRush && isDailyRushComplete);
  const dailyLabel = formatDailyLabel(dailyDateKey);
  const isReviewingPuzzle = isComplete && reviewPuzzleNumber != null;
  const timeLabel = isDailyPuzzle ? "Elapsed" : "Time";
  const timeValue = isDailyPuzzle
    ? formatDuration(elapsedMs)
    : formatDuration(remainingMs);
  const completionTitle = isDailyPuzzle
    ? "Daily Solved"
    : isDailyRush
    ? "Daily Rush Complete"
    : "Times Up";
  const reportLabel = isDailyPuzzle
    ? "Daily puzzle"
    : isDailyRush
    ? "Daily rush"
    : "Report code";

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
        <ClientProvider settings={settings} state={state} socket={socket}>
          <div className={styles.boardLayer}>
            <Board
              executeMove={actions.executeMove}
              hintCard={hintCard}
              isDeckCyclingBlocked
              isInteractionDisabled={isInteractionDisabled}
              onBlockedMove={actions.onBlockedMove}
              onUpdateHand={actions.onUpdateHand}
              roomId="Rush"
              visiblePlayerIndices={visiblePlayerIndices}
            />
          </div>
        </ClientProvider>

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
              {isDailyPuzzle && isRunning ? ` / Try ${dailyTryCount}` : ""}
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
                  aria-pressed={isDailyPuzzle}
                  className={styles.modeTab}
                  data-complete={isDailyPuzzleComplete ? "true" : "false"}
                  onClick={() => actions.selectRunKind("daily_puzzle")}
                  type="button"
                >
                  <span>Daily Puzzle</span>
                  <small>
                    {isDailyPuzzleComplete ? "Solved today" : dailyLabel}
                  </small>
                </button>
                <button
                  aria-pressed={isDailyRush}
                  className={styles.modeTab}
                  data-complete={isDailyRushComplete ? "true" : "false"}
                  onClick={() => actions.selectRunKind("daily_rush")}
                  type="button"
                >
                  <span>Daily Rush</span>
                  <small>
                    {isDailyRushComplete
                      ? `${dailyRushOutcome?.score ?? 0} solved today`
                      : "One-minute daily"}
                  </small>
                </button>
                <button
                  aria-pressed={runKind === "random"}
                  className={styles.modeTab}
                  onClick={() => actions.selectRunKind("random")}
                  type="button"
                >
                  <span>Random Rush</span>
                  <small>Fresh practice boards</small>
                </button>
              </div>
              <div className={styles.modeSummary}>
                {isDailyPuzzle ? (
                  isDailyPuzzleComplete ? (
                    <>
                      <strong>Daily puzzle complete</strong>
                      <span>Daily Rush and Random Rush are still open.</span>
                    </>
                  ) : (
                    <>
                      <strong>One puzzle today</strong>
                      <span>Solve it once for time, tries, and streak.</span>
                    </>
                  )
                ) : isDailyRush ? (
                  isDailyRushComplete ? (
                    <>
                      <strong>Daily Rush complete</strong>
                      <span>Random Rush is still open for practice.</span>
                    </>
                  ) : (
                    <>
                      <strong>One rush today</strong>
                      <span>Play the same daily one-minute set.</span>
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
                  disabled={isSelectedDailyComplete}
                  onClick={
                    isDailyPuzzle
                      ? actions.startDailyPuzzle
                      : isDailyRush
                      ? actions.startDailyRush
                      : actions.startRandom
                  }
                  type="primary"
                >
                  {isDailyPuzzle
                    ? isDailyPuzzleComplete
                      ? "Daily puzzle complete"
                      : "Start puzzle"
                    : isDailyRush
                    ? isDailyRushComplete
                      ? "Daily Rush complete"
                      : "Start Daily Rush"
                    : "Start Random Rush"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isReviewingPuzzle ? (
          <div className={styles.reviewDock} role="status">
            <span>
              Reviewing Puzzle {reviewPuzzleNumber + 1}
              {isPuzzleSolved(reviewPuzzleNumber, score) ? (
                <SolvedCheck />
              ) : null}
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
              <h1 className={styles.completionTitle}>{completionTitle}</h1>
              {isDailyPuzzle && dailyOutcome ? (
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
                      {isPuzzleSolved(entry.puzzleNumber, score) ? (
                        <SolvedCheck />
                      ) : null}
                    </span>
                    <strong>{entry.objective}</strong>
                  </button>
                ))}
              </div>
              {isDailyPuzzle && dailyOutcome ? (
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
                {isDailyPuzzle || runKind === "random" ? (
                  <Button
                    className={`${styles.completionButton} ${
                      isDailyPuzzle ? styles.primaryButton : ""
                    }`}
                    onClick={
                      isDailyPuzzle
                        ? actions.copyDailyShareText
                        : () => setIsReportDialogOpen(true)
                    }
                    type={isDailyPuzzle ? "primary" : "default"}
                  >
                    {isDailyPuzzle ? "Copy summary" : "Report puzzles"}
                  </Button>
                ) : null}
                {isDailyPuzzle || isDailyRush ? (
                  <Button
                    className={`${styles.completionButton} ${
                      isDailyRush ? styles.primaryButton : ""
                    }`}
                    onClick={() => {
                      setIsReportDialogOpen(false);
                      actions.startRandom();
                    }}
                    type={isDailyRush ? "primary" : "default"}
                  >
                    Random Rush
                  </Button>
                ) : null}
                {isDailyPuzzle || isDailyRush ? (
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
                <span>{reportLabel}</span>
                <strong>{isDailyPuzzle || isDailyRush ? dailyLabel : seed}</strong>
              </div>
              <div className={styles.reportList}>
                {puzzleHistory.map((entry) => (
                  <div className={styles.reportItem} key={entry.reportCode}>
                    <span>
                      Puzzle {entry.puzzleNumber + 1}
                      {isPuzzleSolved(entry.puzzleNumber, score) ? (
                        <SolvedCheck />
                      ) : null}
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

function SolvedCheck(): JSX.Element {
  return (
    <span className={styles.solvedCheck} aria-label="Solved" role="img">
      ✓
    </span>
  );
}

export default PounceRushPage;
