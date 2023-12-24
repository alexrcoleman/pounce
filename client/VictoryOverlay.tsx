import { BoardState } from "../shared/GameUtils";
import Confetti from "react-confetti";
import ScoresTable from "./ScoresTable";

type Props = {
  board: BoardState;
  startGame: () => void;
  isHost: boolean;
};
export default function VictoryOverlay({ board, startGame, isHost }: Props) {
  return board.pouncer != null ? (
    <div
      style={{
        zIndex: 1000000,
        backgroundColor: "rgba(0,0,0,.5)",
        width: "100%",
        height: "100%",
        position: "absolute",
      }}
    >
      <div
        style={{
          zIndex: 1000000,
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          borderRadius: 4,
          padding: 20,
          backgroundColor: "white",
          border: "2px solid #ddd",
        }}
      >
        <div style={{ marginBottom: 20, fontSize: "25px" }}>
          <i>Pounce!</i> by <b>{board.players[board.pouncer].name}</b>
        </div>
        <ScoresTable board={board} />
        <div style={{ marginTop: 20 }}>
          {isHost ? (
            <button onClick={startGame}>Start Next Round</button>
          ) : (
            "Waiting for host to start next round..."
          )}
        </div>
      </div>
      <Confetti />
    </div>
  ) : null;
}
