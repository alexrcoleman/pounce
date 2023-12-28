import { BoardState } from "../shared/GameUtils";
import Confetti from "react-confetti";
import ScoresTable from "./ScoresTable";
import { observer } from "mobx-react-lite";
import SocketState from "./SocketState";
import { useClientContext } from "./ClientContext";
import { Button, Flex } from "antd";

export default observer(function VictoryOverlay() {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const isHost = state.getIsHost();
  const pouncer = board.pouncer != null ? board.players[board.pouncer] : null;
  return pouncer != null ? (
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
        <div
          style={{
            marginBottom: 20,
            fontSize: "25px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span>
            <i>Pounce!</i> by <b>{pouncer.name}</b>
          </span>
        </div>
        <ScoresTable board={board} />
        <Flex justify="end" style={{ marginTop: 20 }}>
          {isHost ? (
            <Button type="primary" onClick={() => socket?.emit("start_game")}>
              Start Next Round
            </Button>
          ) : (
            "Waiting for host to start next round..."
          )}
        </Flex>
      </div>
      <Confetti />
    </div>
  ) : null;
});
