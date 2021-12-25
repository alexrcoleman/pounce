import { BoardState } from "../shared/GameUtils";
import styles from "./ScoresTable.module.css";
type Props = {
  board: BoardState;
};
export default function ScoresTable({ board }: Props) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {board.players.map((p, index) => (
            <th key={index}>{p.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {board.players[0].scores.map((_, index) => (
          <tr key={index}>
            {board.players.map((p, i) => (
              <td key={i}>
                {(p.scores[index] ?? -1) >= 0 ? "+" : ""}
                {p.scores[index] ?? "-"}
              </td>
            ))}
          </tr>
        ))}
        <tr>
          {board.players.map((p, i) => (
            <td key={i}>={p.totalPoints}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
