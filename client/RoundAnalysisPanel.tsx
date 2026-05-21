import { useEffect, useMemo, useState } from "react";

import type {
  PlayerRoundAnalysis,
  RoundAnalysis,
  RoundAnalysisHighlight,
} from "../shared/RoundAnalysis";
import { formatCard } from "../shared/RoundAnalysis";
import type { CardState } from "../shared/GameUtils";
import { Modal } from "antd";
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
  const [selectedHighlight, setSelectedHighlight] =
    useState<RoundAnalysisHighlight | null>(null);

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
          label="Center cards played"
          value={selectedReport.summary.cardsPlayedToCenter}
        />
        <Stat
          label="Solitaire moves played"
          value={selectedReport.summary.solitaireMoves}
        />
        <Stat
          label="3-card deck cycles/sec"
          value={formatRate(selectedReport.summary.deckCyclesPerSecond)}
        />
        <Stat
          label="Center plays missed"
          value={selectedReport.summary.missedCenterPlays}
        />
        <Stat
          label="Center play rate"
          value={formatPercent(selectedReport.summary.centerPlayRate)}
        />
        <Stat
          label="Pounce-helper plays missed"
          value={selectedReport.summary.missedPounceHelpers}
        />
        <Stat
          label="Productive solitaire rate"
          value={formatPercent(selectedReport.summary.solitairePlayRate)}
        />
        <Stat label="Delayed plays" value={selectedReport.summary.delayedPlays} />
        <Stat
          label="Longest missed-play window"
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
            <Moment
              highlight={highlight}
              key={highlight.id}
              onOpen={setSelectedHighlight}
            />
          ))}
        </ol>
      ) : (
        <p className={styles.emptyText}>
          No missed center windows over {formatDuration(750)} or
          pounce-helper windows over {formatDuration(3000)} showed up for this
          player.
        </p>
      )}
      <Modal
        footer={null}
        onCancel={() => setSelectedHighlight(null)}
        open={selectedHighlight != null}
        title={selectedHighlight?.title}
        width={760}
      >
        {selectedHighlight && (
          <MomentSnapshot highlight={selectedHighlight} />
        )}
      </Modal>
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

function Moment({
  highlight,
  onOpen,
}: {
  highlight: RoundAnalysisHighlight;
  onOpen: (highlight: RoundAnalysisHighlight) => void;
}) {
  return (
    <li className={styles.momentItem}>
      <button
        className={styles.moment}
        onClick={() => onOpen(highlight)}
        type="button"
      >
        <div className={`${styles.severity} ${styles[highlight.severity]}`}>
          {highlight.severity}
        </div>
        <div className={styles.momentBody}>
          <div className={styles.momentTitleRow}>
            <div className={styles.momentTitle}>{highlight.title}</div>
            <div className={styles.pointValue}>+{highlight.pointValue} pts</div>
          </div>
          <div className={styles.momentDetail}>{highlight.detail}</div>
          <div className={styles.momentMeta}>
            {formatDuration(highlight.durationMs)} window
            <span aria-hidden="true"> | </span>
            {formatDuration(highlight.firstSeenOffsetMs)} into round
          </div>
        </div>
      </button>
    </li>
  );
}

function MomentSnapshot({ highlight }: { highlight: RoundAnalysisHighlight }) {
  const board = highlight.board;
  const player =
    board.players[highlight.playerIndex] ??
    board.players.find((candidate) => !candidate.isSpectating);
  const centerPiles = board.piles
    .map((pile, index) => ({ index, card: pile[pile.length - 1] }))
    .filter(({ card }) => card != null);

  return (
    <div className={styles.snapshot}>
      <div className={styles.snapshotIntro}>
        Board state {formatDuration(highlight.firstSeenOffsetMs)} into the
        round. The highlighted card is the key card for this moment.
      </div>
      {player && (
        <div className={styles.snapshotSection}>
          <div className={styles.snapshotHeader}>{player.name}</div>
          <div className={styles.snapshotGrid}>
            <SnapshotPile
              cards={player.pounceDeck}
              highlightCard={highlight.card}
              label="Pounce"
            />
            <SnapshotPile
              cards={player.flippedDeck}
              highlightCard={highlight.card}
              label="Waste"
            />
            {player.stacks.map((stack, index) => (
              <SnapshotPile
                cards={stack}
                highlightCard={highlight.card}
                key={index}
                label={`Stack ${index + 1}`}
              />
            ))}
          </div>
        </div>
      )}
      <div className={styles.snapshotSection}>
        <div className={styles.snapshotHeader}>Center piles</div>
        {centerPiles.length > 0 ? (
          <div className={styles.centerPileGrid}>
            {centerPiles.map(({ card, index }) => (
              <CardPill
                card={card}
                highlightCard={highlight.card}
                key={index}
              />
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No center piles had cards yet.</p>
        )}
      </div>
    </div>
  );
}

function SnapshotPile({
  cards,
  highlightCard,
  label,
}: {
  cards: CardState[];
  highlightCard: CardState;
  label: string;
}) {
  return (
    <div className={styles.snapshotPile}>
      <div className={styles.snapshotPileLabel}>
        {label} <span>{cards.length}</span>
      </div>
      {cards.length > 0 ? (
        <div className={styles.cardRun}>
          {cards.map((card, index) => (
            <CardPill
              card={card}
              highlightCard={highlightCard}
              key={`${card.player}:${card.suit}:${card.value}:${index}`}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyPile}>Empty</div>
      )}
    </div>
  );
}

function CardPill({
  card,
  highlightCard,
}: {
  card?: CardState;
  highlightCard: CardState;
}) {
  if (!card) {
    return null;
  }

  return (
    <span
      className={
        isSameCard(card, highlightCard)
          ? `${styles.cardPill} ${styles.highlightCard}`
          : styles.cardPill
      }
    >
      {formatCard(card)}
    </span>
  );
}

function getPracticeFocus(report: PlayerRoundAnalysis): string {
  if (report.summary.delayedPlays > 0) {
    return "You found some plays, but the delayed moments show where the round gave you several seconds to act sooner.";
  }
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

function formatRate(rate: number): string {
  return `${rate.toFixed(2)}/s`;
}

function formatPercent(rate: number | null): string {
  if (rate == null) {
    return "n/a";
  }
  return `${Math.round(rate * 100)}%`;
}

function isSameCard(card: CardState, other: CardState): boolean {
  return (
    card.player === other.player &&
    card.suit === other.suit &&
    card.value === other.value
  );
}
