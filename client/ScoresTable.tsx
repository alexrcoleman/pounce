import { observer } from "mobx-react-lite";
import { BoardState } from "../shared/GameUtils";
import styles from "./ScoresTable.module.css";
type Props = {
  board: BoardState;
  bufferRows?: number;
};

const MAX_SCORES_ROW = 15;
export default observer(function ScoresTable({ board, bufferRows = 2 }: Props) {
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
          48 +
          8 +
          24.7 *
            (Math.min(MAX_SCORES_ROW, scoreIndices.length + bufferRows) + 1),
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 4, fontSize: "30px" }}>
        {title}
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            {/* <th style={{ width: "30px" }} /> */}
            {players.map((p, index) => (
              <th key={index}>{p.name}</th>
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
          <tr>
            {/* <td>Total</td> */}
            {players.map((p, i) => (
              <td
                key={i}
                style={{
                  color: "#111",
                  fontSize: "25px",
                  borderTop: "1px solid #AAA",
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
