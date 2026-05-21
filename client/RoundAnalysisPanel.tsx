import { useEffect, useMemo, useState } from "react";

import type {
  PlayerRoundAnalysis,
  RoundAnalysis,
  RoundAnalysisHighlight,
} from "../shared/RoundAnalysis";
import styles from "./RoundAnalysisPanel.module.css";

type Props = {
  analysis: RoundAnalysis | null;
  activePlayerIndex: number;
};

export default function RoundAnalysisPanel({
  analysis,
  activePlayerIndex,
}: Props) {
  const defaultPlayerIndex = useMemo(() => {
    if (!analysis) {
      return activePlayerIndex;
    }
    if (
      activePlayerIndex >= 0 &&
      analysis.playerReports.some(
        (report) => report.playerIndex === activePlayerIndex
      )
    ) {
      return activePlayerIndex;
    }
    return analysis.pouncerIndex ?? analysis.playerReports[0]?.playerIndex ?? -1;
  }, [activePlayerIndex, analysis]);
  const [selectedPlayerIndex, setSelectedPlayerIndex] =
    useState(defaultPlayerIndex);

  useEffect(() => {
    setSelectedPlayerIndex(defaultPlayerIndex);
  }, [defaultPlayerIndex]);

  if (!analysis) {
    return (
      <section className={styles.root}>
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Game analysis</div>
            <h2 className={styles.title}>Ready after the next round</h2>
          </div>
        </div>
        <p className={styles.emptyText}>
          New rounds will track missed center plays, deck cycles, and contested
          cards here.
        </p>
      </section>
    );
  }

  const selectedReport =
    analysis.playerReports.find(
      (report) => report.playerIndex === selectedPlayerIndex
    ) ?? analysis.playerReports[0];

  return (
    <section className={styles.root} data-testid="round-analysis-panel">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Game analysis</div>
          <h2 className={styles.title}>Missed plays and round stats</h2>
        </div>
        <div className={styles.playerSelectWrap}>
          <span
            className={styles.playerColor}
            style={{ backgroundColor: selectedReport.playerColor }}
          />
          <select
            aria-label="Analysis player"
            className={styles.playerSelect}
            onChange={(event) =>
              setSelectedPlayerIndex(Number(event.target.value))
            }
            value={selectedReport.playerIndex}
          >
            {analysis.playerReports.map((report) => (
              <option key={report.playerIndex} value={report.playerIndex}>
                {report.playerName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.statGrid}>
        <Stat
          label="Center cards"
          value={selectedReport.summary.cardsPlayedToCenter}
        />
        <Stat
          label="Solitaire moves"
          value={selectedReport.summary.solitaireMoves}
        />
        <Stat
          label="Cards cycled"
          value={selectedReport.summary.cardsCycled}
        />
        <Stat
          label="Missed center"
          value={selectedReport.summary.missedCenterPlays}
        />
        <Stat
          label="Pounce helpers"
          value={selectedReport.summary.missedPounceHelpers}
        />
        <Stat
          label="Longest window"
          value={formatDuration(selectedReport.summary.longestMissMs)}
        />
      </div>

      <div className={styles.focusBand}>
        <div className={styles.focusLabel}>Practice focus</div>
        <div className={styles.focusText}>{getPracticeFocus(selectedReport)}</div>
      </div>

      <div className={styles.momentsHeader}>Top moments</div>
      {selectedReport.highlights.length > 0 ? (
        <ol className={styles.momentList}>
          {selectedReport.highlights.map((highlight) => (
            <Moment highlight={highlight} key={highlight.id} />
          ))}
        </ol>
      ) : (
        <p className={styles.emptyText}>
          No missed center or pounce-helper windows over {formatDuration(750)}
          showed up for this player.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function Moment({ highlight }: { highlight: RoundAnalysisHighlight }) {
  return (
    <li className={styles.moment}>
      <div className={`${styles.severity} ${styles[highlight.severity]}`}>
        {highlight.severity}
      </div>
      <div className={styles.momentBody}>
        <div className={styles.momentTitle}>{highlight.title}</div>
        <div className={styles.momentDetail}>{highlight.detail}</div>
        <div className={styles.momentMeta}>
          {formatDuration(highlight.durationMs)} window
          <span aria-hidden="true"> | </span>
          {formatDuration(highlight.firstSeenOffsetMs)} into round
        </div>
      </div>
    </li>
  );
}

function getPracticeFocus(report: PlayerRoundAnalysis): string {
  if (report.summary.missedPounceHelpers > 0) {
    return "Look for solitaire moves that connect or free your pounce card; those are now called out in the key moments.";
  }
  if (report.summary.cycledPastPlayableCards >= 2) {
    return "Slow the deck rhythm just enough to check whether the waste card can go center before cycling.";
  }
  if (report.summary.beatenToCenter >= 2) {
    return "Watch shared center piles when your top cards are live; several chances were contested.";
  }
  if (report.highlights.some((highlight) => highlight.sourceLabel === "pounce pile")) {
    return "Scan the pounce card first after every center move. That is still the highest-value miss.";
  }
  if (report.summary.missedCenterPlays > 0) {
    return "Keep a quick center-pile scan going; the missed windows were playable long enough to notice.";
  }
  return "Nice round. The analyzer did not find any clear missed center plays yet.";
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
