import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  PlayerRoundAnalysis,
  RoundAnalysis,
  RoundAnalysisHighlight,
  RoundAnalysisMoveEvent,
} from "../shared/RoundAnalysis";
import type { CardState } from "../shared/GameUtils";
import { Drawer, Modal, Tooltip } from "antd";
import ChevronLeftIcon from "./icons/ChevronLeftIcon";
import styles from "./RoundAnalysisPanel.module.css";

type Props = {
  analysis: RoundAnalysis | null;
  activePlayerIndex: number;
};

const STAT_TOOLTIPS = {
  centerPlayRate:
    "Center plays made divided by every detected center-play opportunity for this player.",
  contestedCenterWinRate:
    "How often this player won a shared center-card race before another player played the same card.",
  score:
    "The player's actual round score compared with the simulated score prediction for this deal. The prediction includes a 95% confidence interval.",
  dealRank:
    "The player's predicted rank for this deal, sorted by simulated score among analyzed players.",
  pointDifferential:
    "The sum of this player's score minus each other active player's score, compared with the simulated prediction. Higher is better.",
  solitaireRate:
    "Solitaire moves played divided by every detected useful solitaire opportunity for this player.",
  pounceHelpersMissed:
    "Missed solitaire moves that would have helped move, expose, or connect the pounce card.",
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
  const useDrawerPreview = useMediaQuery("(max-width: 640px)");

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
        {selectedReport.dealSimulation && (
          <Stat
            label="Score"
            tooltip={STAT_TOOLTIPS.score}
            value={
              <ScoreComparison
                actualScore={selectedReport.score}
                confidenceInterval95={
                  selectedReport.dealSimulation
                    .predictedScoreConfidenceInterval95
                }
                predictedScore={selectedReport.dealSimulation.predictedScore}
              />
            }
          />
        )}
        {selectedReport.dealSimulation &&
          typeof selectedReport.dealSimulation.predictedPointDifferential ===
            "number" && (
            <Stat
              label="Point differential"
              tooltip={STAT_TOOLTIPS.pointDifferential}
              value={
                <ScoreComparison
                  actualScore={selectedReport.pointDifferential}
                  confidenceInterval95={
                    selectedReport.dealSimulation
                      .predictedPointDifferentialConfidenceInterval95
                  }
                  predictedScore={
                    selectedReport.dealSimulation.predictedPointDifferential
                  }
                  valueFormatter={formatSignedScore}
                />
              }
            />
          )}
        {selectedReport.dealSimulation && (
          <Stat
            label="Deal rank"
            tooltip={STAT_TOOLTIPS.dealRank}
            value={`${selectedReport.dealSimulation.predictedRank}/${getDealRankSize(
              analysis
            )}`}
          />
        )}
        <Stat
          label="3-card deck cycles/sec"
          value={
            <RateValue
              ratio={`${selectedReport.summary.deckCycles}/${formatDuration(
                analysis.durationMs
              )}`}
              value={formatRate(selectedReport.summary.deckCyclesPerSecond)}
            />
          }
        />
        <Stat
          label="Center play rate"
          tooltip={STAT_TOOLTIPS.centerPlayRate}
          value={
            <RateValue
              ratio={formatRatio(
                selectedReport.summary.centerPlaysMade,
                selectedReport.summary.centerPlayOpportunities
              )}
              value={formatPercent(selectedReport.summary.centerPlayRate)}
            />
          }
        />
        <Stat
          label="Contested center win rate"
          tooltip={STAT_TOOLTIPS.contestedCenterWinRate}
          value={
            <RateValue
              ratio={formatRatio(
                selectedReport.summary.contestedCenterWins,
                selectedReport.summary.contestedCenterOpportunities
              )}
              value={formatPercent(
                selectedReport.summary.contestedCenterWinRate
              )}
            />
          }
        />
        <Stat
          label="Pounce-helper plays missed"
          tooltip={STAT_TOOLTIPS.pounceHelpersMissed}
          value={selectedReport.summary.missedPounceHelpers}
        />
        <Stat
          label="Solitaire rate"
          tooltip={STAT_TOOLTIPS.solitaireRate}
          value={
            <RateValue
              ratio={formatRatio(
                selectedReport.summary.solitairePlaysMade,
                selectedReport.summary.solitairePlayOpportunities
              )}
              value={formatPercent(selectedReport.summary.solitairePlayRate)}
            />
          }
        />
        <Stat label="Delayed plays" value={selectedReport.summary.delayedPlays} />
        <Stat
          label="Longest missed-play window"
          value={formatDuration(selectedReport.summary.longestMissMs)}
        />
      </div>

      <PounceDeckSection report={selectedReport} />

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
      {/* Full move logs are hidden while the server omits them from the payload. */}
      {useDrawerPreview ? (
        <Drawer
          className={styles.snapshotDrawer}
          height="86dvh"
          onClose={() => setSelectedHighlight(null)}
          open={selectedHighlight != null}
          placement="bottom"
          title={selectedHighlight?.title}
        >
          {selectedHighlight && <MomentSnapshot highlight={selectedHighlight} />}
        </Drawer>
      ) : (
        <Modal
          footer={null}
          onCancel={() => setSelectedHighlight(null)}
          open={selectedHighlight != null}
          title={selectedHighlight?.title}
          width={760}
        >
          {selectedHighlight && <MomentSnapshot highlight={selectedHighlight} />}
        </Modal>
      )}
    </section>
  );
}

function Stat({
  label,
  tooltip,
  value,
}: {
  label: string;
  tooltip?: string;
  value: ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>
        <span>{label}</span>
        {tooltip ? (
          <Tooltip title={tooltip}>
            <button
              aria-label={`${label} info`}
              className={styles.statInfoButton}
              type="button"
            >
              i
            </button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

function ScoreComparison({
  actualScore,
  confidenceInterval95,
  predictedScore,
  valueFormatter = formatScore,
}: {
  actualScore: number;
  confidenceInterval95?: number;
  predictedScore: number;
  valueFormatter?: (score: number) => string;
}) {
  const delta = actualScore - predictedScore;
  const confidenceIntervalText =
    typeof confidenceInterval95 === "number" &&
    Number.isFinite(confidenceInterval95)
      ? formatScore(confidenceInterval95)
      : null;

  return (
    <div className={styles.scoreComparison}>
      <div className={styles.scoreComparisonLead}>
        {valueFormatter(actualScore)}
      </div>
      <div className={styles.scoreComparisonMeta}>
        Predicted {valueFormatter(predictedScore)}
        {confidenceIntervalText ? ` ± ${confidenceIntervalText}` : ""}
      </div>
      <div className={styles.scoreComparisonMeta}>
        {formatPerformanceDelta(delta)}
      </div>
    </div>
  );
}

function RateValue({ value, ratio }: { value: string; ratio: string }) {
  return (
    <div className={styles.rateValue}>
      <div className={styles.rateValueMain}>{value}</div>
      <div className={styles.rateValueMeta}>{ratio}</div>
    </div>
  );
}

function PounceDeckSection({ report }: { report: PlayerRoundAnalysis }) {
  const [isExpanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [report.playerIndex]);

  if (report.pounceDeck.length === 0) {
    return null;
  }

  const playedCount = report.pounceDeck.filter(({ played }) => played).length;
  const deckListId = `round-analysis-pounce-deck-${report.playerIndex}`;

  return (
    <div
      className={[
        styles.pounceDeckSection,
        isExpanded ? styles.pounceDeckSectionExpanded : "",
      ].join(" ")}
    >
      <button
        aria-controls={deckListId}
        aria-expanded={isExpanded}
        className={styles.pounceDeckHeader}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className={styles.pounceDeckTitleGroup}>
          <span className={styles.momentsHeader}>Pounce deck</span>
        </span>
        <span className={styles.pounceDeckSummary}>
          <span className={styles.pounceDeckMeta}>
            {playedCount}/{report.pounceDeck.length} played
          </span>
          <ChevronLeftIcon
            aria-hidden="true"
            className={styles.pounceDeckChevron}
          />
        </span>
      </button>
      <div
        aria-hidden={!isExpanded}
        className={styles.pounceDeckContent}
        id={deckListId}
      >
        <div className={styles.pounceDeckContentInner}>
          <div className={styles.pounceDeckMeta}>Top to bottom</div>
          <ol className={styles.pounceDeckList}>
            {report.pounceDeck.map(({ card, played }, index) => (
              <li
                className={[
                  styles.pounceDeckItem,
                  played ? styles.pounceDeckItemPlayed : "",
                ].join(" ")}
                key={`${card.player}:${card.suit}:${card.value}`}
              >
                <span className={styles.pounceDeckIndex}>{index + 1}</span>
                <CardPill card={card} />
              </li>
            ))}
          </ol>
        </div>
      </div>
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
            <div className={styles.momentTitle}>
              <CardText text={highlight.title} />
            </div>
            <div className={styles.pointValue}>+{highlight.pointValue} pts</div>
          </div>
          <div className={styles.momentDetail}>
            <CardText text={highlight.detail} />
          </div>
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

type DisplayedMoveEvent = RoundAnalysisMoveEvent & {
  repeatCount: number;
  endOffsetMs: number;
};

function AllMovesSection({
  moves,
  onOpenFullLog,
}: {
  moves: DisplayedMoveEvent[];
  onOpenFullLog: () => void;
}) {
  return (
    <div className={styles.movesSection}>
      <div className={styles.movesHeaderRow}>
        <div className={styles.momentsHeader}>All moves</div>
        <button
          className={styles.secondaryAction}
          onClick={onOpenFullLog}
          type="button"
        >
          Full game log
        </button>
      </div>
      <MoveLog moves={moves} showPlayer={false} />
    </div>
  );
}

function MoveLog({
  moves,
  showPlayer,
}: {
  moves: DisplayedMoveEvent[];
  showPlayer: boolean;
}) {
  if (moves.length === 0) {
    return <p className={styles.emptyText}>No recorded moves.</p>;
  }

  return (
    <ol className={styles.moveList}>
      {moves.map((move) => (
        <MoveRow key={move.id} move={move} showPlayer={showPlayer} />
      ))}
    </ol>
  );
}

function MoveRow({
  move,
  showPlayer,
}: {
  move: DisplayedMoveEvent;
  showPlayer: boolean;
}) {
  return (
    <li className={styles.moveItem}>
      <div className={styles.moveTime}>{formatMoveTime(move)}</div>
      <div className={styles.moveBody}>
        <div className={styles.moveDescription}>
          {showPlayer && (
            <>
              <span className={styles.moveActor}>{move.playerName}</span>{" "}
            </>
          )}
          <CardText text={formatMoveDescription(move)} />
        </div>
        <div className={styles.moveMeta}>{getMoveTypeLabel(move.moveType)}</div>
      </div>
    </li>
  );
}

function MomentSnapshot({ highlight }: { highlight: RoundAnalysisHighlight }) {
  const board = highlight.board;
  const playerIndex =
    board.players[highlight.playerIndex] != null
      ? highlight.playerIndex
      : board.players.findIndex((candidate) => !candidate.isSpectating);
  const player = playerIndex >= 0 ? board.players[playerIndex] : undefined;
  const otherPlayers = board.players
    .map((candidate, index) => ({ player: candidate, index }))
    .filter(
      ({ player: candidate, index }) =>
        index !== playerIndex && !candidate.isSpectating
    );
  const centerPiles = board.piles
    .map((pile, index) => ({ index, card: pile[pile.length - 1] }))
    .filter(({ card }) => card != null);

  return (
    <div className={styles.snapshot}>
      <div className={styles.snapshotIntro}>
        Board state {formatDuration(highlight.firstSeenOffsetMs)} into the
        round. The highlighted card is the key card for this moment.
      </div>
      <div className={styles.snapshotDetail}>
        <CardText text={highlight.detail} />
      </div>
      <SnapshotContext highlight={highlight} />
      {player && (
        <div className={styles.snapshotSection}>
          <div className={styles.snapshotHeader}>{player.name}</div>
          <div className={styles.visiblePileGrid}>
            <SnapshotTopPile
              cards={player.pounceDeck}
              highlightCard={highlight.card}
              label="Pounce"
            />
            <SnapshotTopPile
              cards={player.flippedDeck}
              highlightCard={highlight.card}
              label="Waste"
            />
          </div>
          <div className={styles.solitaireStackGrid}>
            {player.stacks.map((stack, index) => (
              <SnapshotStack
                cards={stack}
                highlightCard={highlight.card}
                key={index}
                label={`S${index + 1}`}
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
      {otherPlayers.length > 0 && (
        <div className={styles.snapshotSection}>
          <div className={styles.snapshotHeader}>Other players</div>
          <div className={styles.otherPlayerGrid}>
            {otherPlayers.map(({ player: otherPlayer, index }) => (
              <OtherPlayerSnapshot
                highlightCard={highlight.card}
                key={index}
                player={otherPlayer}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SnapshotContext({
  highlight,
}: {
  highlight: RoundAnalysisHighlight;
}) {
  if (
    !highlight.openedByAction &&
    !highlight.closedByAction &&
    !highlight.closedReason &&
    highlight.windowActions.length === 0
  ) {
    return null;
  }

  return (
    <div className={styles.contextPanel}>
      {highlight.openedByAction && (
        <div>
          <div className={styles.contextLabel}>Window opened after</div>
          <div className={styles.contextText}>
            <CardText
              text={formatActionContext(highlight.openedByAction, highlight)}
            />
            <span className={styles.contextTime}>
              {" "}
              at {formatDuration(highlight.openedByAction.offsetMs)}
            </span>
          </div>
        </div>
      )}
      {(highlight.closedByAction || highlight.closedReason) && (
        <div>
          <div className={styles.contextLabel}>Window closed after</div>
          {highlight.closedByAction ? (
            <>
              <div className={styles.contextText}>
                <CardText
                  text={formatActionContext(
                    highlight.closedByAction,
                    highlight
                  )}
                />
                <span className={styles.contextTime}>
                  {" "}
                  at {formatDuration(highlight.closedByAction.offsetMs)}
                </span>
              </div>
              {highlight.closedReason && (
                <div className={styles.contextReason}>
                  <CardText text={highlight.closedReason} />
                </div>
              )}
            </>
          ) : (
            <div className={styles.contextText}>
              <CardText text={highlight.closedReason ?? ""} />
              <span className={styles.contextTime}>
                {" "}
                at {formatDuration(highlight.lastSeenOffsetMs)}
              </span>
            </div>
          )}
        </div>
      )}
      <div>
        <div className={styles.contextLabel}>What you did next</div>
        {highlight.windowActions.length > 0 ? (
          <ol className={styles.contextList}>
            {highlight.windowActions.map((action, index) => (
              <li key={`${action.offsetMs}:${index}`}>
                <CardText text={formatActionContext(action, highlight)} />
                <span className={styles.contextTime}>
                  {" "}
                  after{" "}
                  {formatDuration(
                    Math.max(0, action.offsetMs - highlight.firstSeenOffsetMs)
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className={styles.contextText}>
            No moves from you were recorded before the window closed.
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotTopPile({
  cards,
  highlightCard,
  label,
}: {
  cards: CardState[];
  highlightCard: CardState;
  label: string;
}) {
  const topCard = cards[cards.length - 1];

  return (
    <div className={styles.labeledCard}>
      <span className={styles.labeledCardLabel}>{label}</span>
      {topCard ? (
        <CardPill card={topCard} highlightCard={highlightCard} />
      ) : (
        <span className={styles.emptyMiniCard}>Empty</span>
      )}
    </div>
  );
}

function SnapshotStack({
  cards,
  highlightCard,
  label,
}: {
  cards: CardState[];
  highlightCard: CardState;
  label: string;
}) {
  return (
    <div className={styles.stackColumn}>
      <div className={styles.stackColumnLabel}>{label}</div>
      {cards.length > 0 ? (
        <div className={styles.stackRun}>
          {cards.map((card, index) => (
            <CardPill
              card={card}
              highlightCard={highlightCard}
              key={`${card.player}:${card.suit}:${card.value}:${index}`}
            />
          ))}
        </div>
      ) : (
        <span className={styles.emptyMiniCard}>Empty</span>
      )}
    </div>
  );
}

function OtherPlayerSnapshot({
  highlightCard,
  player,
}: {
  highlightCard: CardState;
  player: {
    name: string;
    pounceDeck: CardState[];
    flippedDeck: CardState[];
    stacks: CardState[][];
  };
}) {
  return (
    <div className={styles.otherPlayer}>
      <div className={styles.otherPlayerName}>{player.name}</div>
      <div className={styles.visiblePileGrid}>
        <SnapshotTopPile
          cards={player.pounceDeck}
          highlightCard={highlightCard}
          label="Pounce"
        />
        <SnapshotTopPile
          cards={player.flippedDeck}
          highlightCard={highlightCard}
          label="Waste"
        />
      </div>
      <div className={styles.solitaireStackGrid}>
        {player.stacks.map((stack, index) => (
          <SnapshotStack
            cards={stack}
            highlightCard={highlightCard}
            key={index}
            label={`S${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function CardPill({
  card,
  highlightCard,
}: {
  card?: CardState;
  highlightCard?: CardState;
}) {
  if (!card) {
    return null;
  }

  return (
    <span
      className={
        [
          styles.cardPill,
          isRedSuit(card) ? styles.redCard : styles.blackCard,
          highlightCard && isSameCard(card, highlightCard)
            ? styles.highlightCard
            : "",
        ].join(" ")
      }
    >
      {formatCompactCard(card)}
    </span>
  );
}

function CardText({ text }: { text: string }) {
  return <>{renderCardText(text)}</>;
}

const CARD_TEXT_PATTERN =
  /\b(A|J|Q|K|10|[2-9]) (clubs|diamonds|hearts|spades)\b/gi;

function renderCardText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  CARD_TEXT_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CARD_TEXT_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const value = normalizeCardValueLabel(match[1]);
    const suit = match[2].toLowerCase() as CardState["suit"];
    nodes.push(
      <span
        aria-label={match[0]}
        className={[
          styles.inlineCard,
          isRedSuitName(suit) ? styles.redCard : styles.blackCard,
        ].join(" ")}
        key={`${match.index}:${match[0]}`}
      >
        {value}
        {getSuitSymbol(suit)}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function normalizeCardValueLabel(value: string): string {
  return value.length === 1 ? value.toUpperCase() : value;
}

function getPracticeFocus(report: PlayerRoundAnalysis): string {
  if (report.summary.delayedPlays > 0) {
    return "You found some plays, but the delayed moments show where the round gave you several seconds to act sooner.";
  }
  if (report.summary.missedPounceHelpers > 0) {
    return "Look for solitaire moves that connect or free your pounce card; those are now called out in the key moments.";
  }
  if (
    report.highlights.some(
      (highlight) =>
        highlight.kind === "buried_center_shuffle" ||
        highlight.kind === "delayed_buried_center_shuffle"
    )
  ) {
    return "Look for partial-stack shuffles that expose a buried card for center; those are the subtle tactics now called out in key moments.";
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

function formatScore(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  return rounded.toFixed(1);
}

function formatSignedScore(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  if (rounded > 0) {
    return `+${rounded.toFixed(1)}`;
  }
  return rounded.toFixed(1);
}

function formatPerformanceDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (Math.abs(rounded) < 0.05) {
    return "Matched prediction";
  }

  if (rounded > 0) {
    return `Beat prediction by ${rounded.toFixed(1)}`;
  }

  return `Below prediction by ${Math.abs(rounded).toFixed(1)}`;
}

function getDealRankSize(analysis: RoundAnalysis): number {
  return analysis.playerReports.filter((report) => report.dealSimulation)
    .length;
}

function formatPercent(rate: number | null): string {
  if (rate == null) {
    return "n/a";
  }
  return `${Math.round(rate * 100)}%`;
}

function formatRatio(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

function isSameCard(card: CardState, other: CardState): boolean {
  return (
    card.player === other.player &&
    card.suit === other.suit &&
    card.value === other.value
  );
}

function formatCompactCard(card: CardState): string {
  const value =
    card.value === 1
      ? "A"
      : card.value === 11
      ? "J"
      : card.value === 12
      ? "Q"
      : card.value === 13
      ? "K"
      : String(card.value);
  return `${value}${getSuitSymbol(card.suit)}`;
}

function isRedSuit(card: CardState): boolean {
  return isRedSuitName(card.suit);
}

function getSuitSymbol(suit: CardState["suit"]): string {
  if (suit === "clubs") {
    return "\u2663";
  }
  if (suit === "diamonds") {
    return "\u2666";
  }
  if (suit === "hearts") {
    return "\u2665";
  }
  return "\u2660";
}

function isRedSuitName(suit: CardState["suit"]): boolean {
  return suit === "diamonds" || suit === "hearts";
}

function formatActionContext(
  action: RoundAnalysisHighlight["windowActions"][number],
  highlight: RoundAnalysisHighlight
): string {
  const actor =
    action.playerIndex === highlight.playerIndex
      ? "You"
      : action.playerName || "Someone";
  return `${actor} ${action.description}`;
}

function collapseMoveEvents(
  moves: RoundAnalysisMoveEvent[]
): DisplayedMoveEvent[] {
  return moves.reduce<DisplayedMoveEvent[]>((collapsed, move) => {
    const previous = collapsed[collapsed.length - 1];
    if (previous && canCollapseMove(previous, move)) {
      previous.repeatCount += 1;
      previous.endOffsetMs = move.offsetMs;
      return collapsed;
    }

    collapsed.push({
      ...move,
      repeatCount: 1,
      endOffsetMs: move.offsetMs,
    });
    return collapsed;
  }, []);
}

function canCollapseMove(
  previous: DisplayedMoveEvent,
  move: RoundAnalysisMoveEvent
): boolean {
  return (
    previous.moveType === "cycle" &&
    move.moveType === "cycle" &&
    previous.playerIndex === move.playerIndex &&
    previous.playerName === move.playerName
  );
}

function formatMoveDescription(move: DisplayedMoveEvent): string {
  if (move.moveType === "cycle" && move.repeatCount > 1) {
    return `cycled the deck ${move.repeatCount} times`;
  }

  return move.description;
}

function formatMoveTime(move: DisplayedMoveEvent): string {
  if (move.repeatCount > 1 && move.endOffsetMs > move.offsetMs) {
    return `${formatDuration(move.offsetMs)}-${formatDuration(
      move.endOffsetMs
    )}`;
  }

  return formatDuration(move.offsetMs);
}

function getMoveTypeLabel(moveType: RoundAnalysisMoveEvent["moveType"]): string {
  if (moveType === "c2c") {
    return "center";
  }
  if (moveType === "c2s" || moveType === "s2s") {
    return "solitaire";
  }
  if (moveType === "cycle" || moveType === "flip_deck") {
    return "deck";
  }
  if (moveType === "manual_rotate" || moveType === "auto_rotate") {
    return "table";
  }
  return "layout";
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);
    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);
    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, [query]);

  return matches;
}
