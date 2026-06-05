import { observer } from "mobx-react-lite";
import { BoardState } from "../shared/GameUtils";
import { getAIPlayerStrategyProfile } from "../shared/ComputerV1";
import {
  getAIPlayerResolvedMode,
  normalizeAIMode,
  type AIMode,
} from "../shared/RoomState";
import InfoTooltipIcon from "./InfoTooltipIcon";
import styles from "./ScoresTable.module.css";
type Props = {
  board: BoardState;
  aiMode?: AIMode;
  bufferRows?: number;
};

const MAX_SCORES_ROW = 15;
export default observer(function ScoresTable({
  aiMode,
  board,
  bufferRows = 2,
}: Props) {
  const players = board.players;
  const maxScore = Math.max(...players.map((p) => p.totalPoints));

  const scoreIndices = players[0].scores
    .map((_, i) => i)
    .slice(-MAX_SCORES_ROW);
  const maxScores = scoreIndices.map((i) => {
    return Math.max(...players.map((p) => p.scores[i] ?? -26));
  });

  let title = "Scoreboard";
  if (scoreIndices.length > 0 && scoreIndices[0] !== 0) {
    title += ` (cont.)`;
  }
  return (
    <div
      className={styles.root}
      style={{
        height:
          58 +
          8 +
          24.7 *
            (Math.min(MAX_SCORES_ROW, scoreIndices.length + bufferRows) + 1),
      }}
    >
      <div className={styles.title}>{title}</div>
      <table className={styles.table}>
        <thead>
          <tr>
            {/* <th style={{ width: "30px" }} /> */}
            {players.map((_, index) => (
              <th key={index}>
                <PlayerHeader
                  aiMode={aiMode}
                  board={board}
                  playerIndex={index}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scoreIndices.map((index) => (
            <tr key={index}>
              {/* <td style={{ whiteSpace: "nowrap" }}>Round {index + 1}</td> */}
              {players.map((p, i) => (
                <td
                  key={i}
                  style={{
                    textDecoration:
                      maxScores[index] === p.scores[index]
                        ? "underline"
                        : "none",
                  }}
                >
                  {(p.scores[index] ?? -1) >= 0 ? "+" : ""}
                  {p.scores[index] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
          <tr className={styles.totalRow}>
            {/* <td>Total</td> */}
            {players.map((p, i) => (
              <td
                key={i}
                style={{
                  fontWeight: p.totalPoints === maxScore ? "bold" : "normal",
                  textDecoration: p.totalPoints === maxScore ? "underline" : "",
                }}
              >
                ={p.totalPoints}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
});

function PlayerHeader({
  aiMode,
  board,
  playerIndex,
}: {
  aiMode?: AIMode;
  board: BoardState;
  playerIndex: number;
}) {
  const player = board.players[playerIndex];
  const profile = getAIPlayerScoreboardProfile(board, playerIndex, aiMode);

  return (
    <span className={styles.playerHeader}>
      <span className={styles.playerName}>{player.name}</span>
      {profile ? (
        <InfoTooltipIcon
          aria-label={`${player.name} AI type`}
          className={styles.aiStrategyInfo}
        >
          <span className={styles.aiStrategyTooltip}>
            <strong>{profile.name}</strong>
            <span>{profile.summary}</span>
          </span>
        </InfoTooltipIcon>
      ) : null}
    </span>
  );
}

type AIPlayerScoreboardProfile = {
  name: string;
  summary: string;
};

function getAIPlayerScoreboardProfile(
  board: BoardState,
  playerIndex: number,
  aiMode: AIMode | undefined
): AIPlayerScoreboardProfile | null {
  const player = board.players[playerIndex];
  if (!player || player.socketId != null) {
    return null;
  }

  const mode = normalizeAIMode(aiMode);
  const resolvedMode = getAIPlayerResolvedMode(board, playerIndex, mode);
  if (resolvedMode === "trained") {
    return {
      name: "Trained model",
      summary:
        "Uses the trained neural action-ranking model for move choices, with a fixed-AI fallback when no model move is available.",
    };
  }

  const strategy = getAIPlayerStrategyProfile(board, playerIndex);
  return {
    name: mode === "hybrid" ? strategy.name : `Fixed AI: ${strategy.name}`,
    summary: strategy.summary,
  };
}
