import { useEffect, useRef, useState } from "react";

import CheckOutlined from "@ant-design/icons/CheckOutlined";
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
import type { PounceRushTemplateOption } from "../shared/PounceRush";

const PounceRushPage: NextPage<{
  name: string;
  setName: (name: string) => void;
}> = observer(({ name, setName }) => {
  const router = useRouter();
  const settings = useClientSettingsStore({ scale: 0.94 });
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isSummaryCopied, setIsSummaryCopied] = useState(false);
  const summaryCopiedTimeoutRef = useRef<number | null>(null);
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
    selectedTemplateId,
    seed,
    state,
    status,
    stepIndex,
    templateOptions,
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

  useEffect(
    () => () => {
      if (summaryCopiedTimeoutRef.current != null) {
        window.clearTimeout(summaryCopiedTimeoutRef.current);
      }
    },
    []
  );

  if (!isConnected || state.board == null || currentPuzzle == null) {
    return (
      <>
        <Head>
          <title>Pounce Puzzles | Pounce</title>
        </Head>
        <LoadingState
          title="Setting up Pounce Puzzles"
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
  const isEndless = runKind === "endless";
  const isTemplateMode = runKind === "template";
  const isInteractionDisabled = isIdle || isComplete || isAdvancingPuzzle;
  const sequenceLength = currentPuzzle.sequence.length;
  const displayedStep = Math.min(stepIndex + 1, sequenceLength);
  const selectedTemplate =
    templateOptions.find((option) => option.id === selectedTemplateId) ??
    templateOptions[0] ??
    null;
  const isDailyPuzzleComplete = dailyOutcome?.dateKey === dailyDateKey;
  const isDailyRushComplete = dailyRushOutcome?.dateKey === dailyDateKey;
  const dailyLabel = formatDailyLabel(dailyDateKey);
  const isReviewingPuzzle = isComplete && reviewPuzzleNumber != null;
  const shareText = isDailyPuzzle
    ? dailyOutcome?.shareText
    : isDailyRush
    ? dailyRushOutcome?.shareText
    : null;
  const timeLabel = isDailyPuzzle || isEndless || isTemplateMode
    ? "Elapsed"
    : "Time";
  const timeValue = isDailyPuzzle || isEndless || isTemplateMode
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

  const copySummary = async () => {
    const wasCopied = await actions.copyShareText(shareText);
    if (!wasCopied) {
      return;
    }

    setIsSummaryCopied(true);
    if (summaryCopiedTimeoutRef.current != null) {
      window.clearTimeout(summaryCopiedTimeoutRef.current);
    }
    summaryCopiedTimeoutRef.current = window.setTimeout(() => {
      summaryCopiedTimeoutRef.current = null;
      setIsSummaryCopied(false);
    }, 1000);
  };

  return (
    <>
      <Head>
        <title>Pounce Puzzles | Pounce</title>
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
              Puzzle {puzzleNumber + 1} / D{currentPuzzle.difficultyScore} /{" "}
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
            <span className={styles.feedbackIcon} aria-hidden="true">
              {feedback.tone === "success" ? (
                <CheckOutlined rev={undefined} />
              ) : null}
            </span>
            <span>
              <strong>{feedback.title}</strong>
              {feedback.detail ? <small>{feedback.detail}</small> : null}
            </span>
          </div>
        ) : null}

        {isIdle ? (
          <div className={styles.startOverlay} role="dialog" aria-modal>
            <div className={styles.startPanel}>
              <h1 className={styles.startTitle}>Pounce Puzzles</h1>
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
                      : "Three-minute daily"}
                  </small>
                </button>
                <button
                  aria-pressed={runKind === "random"}
                  className={styles.modeTab}
                  onClick={() => actions.selectRunKind("random")}
                  type="button"
                >
                  <span>Random Rush</span>
                  <small>Three-minute run</small>
                </button>
                <button
                  aria-pressed={isEndless}
                  className={styles.modeTab}
                  onClick={() => actions.selectRunKind("endless")}
                  type="button"
                >
                  <span>Endless</span>
                  <small>No timer</small>
                </button>
                <button
                  aria-pressed={isTemplateMode}
                  className={styles.modeTab}
                  onClick={() => actions.selectRunKind("template")}
                  type="button"
                >
                  <span>Puzzle Type</span>
                  <small>
                    {selectedTemplate
                      ? formatTemplateName(selectedTemplate.id)
                      : "Choose one"}
                  </small>
                </button>
              </div>
              <div className={styles.modeSummary}>
                {isDailyPuzzle ? (
                  isDailyPuzzleComplete ? (
                    <>
                      <strong>Daily puzzle complete</strong>
                      <span>Open results, or choose another mode.</span>
                    </>
                  ) : (
                    <>
                      <strong>Hard combo today</strong>
                      <span>Solve it once for time, tries, and streak.</span>
                    </>
                  )
                ) : isDailyRush ? (
                  isDailyRushComplete ? (
                    <>
                      <strong>Daily Rush complete</strong>
                      <span>Open results, or choose another mode.</span>
                    </>
                  ) : (
                    <>
                      <strong>One rush today</strong>
                      <span>Play the same daily three-minute set.</span>
                    </>
                  )
                ) : isEndless ? (
                  <>
                    <strong>Endless puzzles</strong>
                    <span>Keep solving generated boards without a timer.</span>
                  </>
                ) : isTemplateMode && selectedTemplate ? (
                  <>
                    <strong>{formatTemplateName(selectedTemplate.id)}</strong>
                    <span>
                      {selectedTemplate.difficulty} / D
                      {selectedTemplate.difficultyScore} /{" "}
                      {formatTemplateKind(selectedTemplate.kind)}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>Unlimited practice</strong>
                    <span>New generated boards for finding rough edges.</span>
                  </>
                )}
              </div>
              {isTemplateMode ? (
                <label className={styles.templatePicker}>
                  <span>Type</span>
                  <select
                    aria-label="Puzzle type"
                    onChange={(event) =>
                      actions.selectTemplate(event.currentTarget.value)
                    }
                    value={selectedTemplateId}
                  >
                    {templateOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {formatTemplateOption(option)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className={styles.startActions}>
                <Button
                  className={`${styles.primaryButton} ${styles.startButton}`}
                  onClick={
                    isDailyPuzzle
                      ? actions.startDailyPuzzle
                      : isDailyRush
                      ? actions.startDailyRush
                      : isTemplateMode
                      ? actions.startTemplate
                      : isEndless
                      ? actions.startEndless
                      : actions.startRandom
                  }
                  type="primary"
                >
                  {isDailyPuzzle
                    ? isDailyPuzzleComplete
                      ? "View results"
                      : "Start puzzle"
                    : isDailyRush
                    ? isDailyRushComplete
                      ? "View results"
                      : "Start Daily Rush"
                    : isTemplateMode
                    ? "Start Selected Type"
                    : isEndless
                    ? "Start Endless"
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
              ) : isDailyRush && dailyRushOutcome ? (
                <div className={styles.dailyResultGrid}>
                  <div>
                    <span>Solved</span>
                    <strong>{dailyRushOutcome.score}</strong>
                  </div>
                  <div>
                    <span>Boards</span>
                    <strong>{dailyRushOutcome.puzzleCount}</strong>
                  </div>
                  <div>
                    <span>Time</span>
                    <strong>{formatDuration(dailyRushOutcome.durationMs)}</strong>
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
                    <strong>
                      D{entry.difficultyScore} /{" "}
                      {formatMoveCount(entry.sequenceLength)}
                    </strong>
                  </button>
                ))}
              </div>
              {shareText ? (
                <pre className={styles.shareSummary}>{shareText}</pre>
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
                      actions.startEndless();
                    }}
                  >
                    Continue endless
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
                {shareText ? (
                  <Button
                    className={`${styles.completionButton} ${
                      shareText ? styles.primaryButton : ""
                    }`}
                    onClick={copySummary}
                    type="primary"
                  >
                    {isSummaryCopied ? (
                      <span className={styles.buttonInlineStatus}>
                        Copied <SolvedCheck />
                      </span>
                    ) : (
                      "Copy summary"
                    )}
                  </Button>
                ) : null}
                {isDailyPuzzle || isDailyRush || runKind === "random" ? (
                  <Button
                    className={styles.completionButton}
                    onClick={() => {
                      setIsReportDialogOpen(false);
                      actions.showModePicker();
                    }}
                  >
                    Back to puzzles
                  </Button>
                ) : null}
                {isDailyPuzzle || isDailyRush || runKind === "random" ? (
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
                      Puzzle {entry.puzzleNumber + 1} / D{entry.difficultyScore}
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

function formatMoveCount(moveCount: number): string {
  return moveCount === 1 ? "1 move" : `${moveCount} moves`;
}

function formatTemplateOption(option: PounceRushTemplateOption): string {
  return `${formatTemplateName(option.id)} / D${option.difficultyScore}`;
}

function formatTemplateName(templateId: string): string {
  return templateId
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTemplateKind(kind: PounceRushTemplateOption["kind"]): string {
  return kind
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
