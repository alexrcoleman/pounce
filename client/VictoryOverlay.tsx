import Confetti from "react-confetti";
import ScoresTable from "./ScoresTable";
import { observer } from "mobx-react-lite";
import { useClientContext } from "./ClientContext";
import { Button, Flex } from "antd";
import Link from "next/link";
import styles from "./VictoryOverlay.module.css";

export default observer(function VictoryOverlay() {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const isHost = state.getIsHost();
  const pouncer = board.pouncer != null ? board.players[board.pouncer] : null;
  return pouncer != null ? (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.title}>
          <span>
            <i>Pounce!</i> by <b>{pouncer.name}</b>
          </span>
        </div>
        <ScoresTable board={board} />
        <Flex justify="end" align="center" className={styles.actions}>
          <Link legacyBehavior href="/" passHref>
            <Button>Leave Room</Button>
          </Link>
          {isHost ? (
            <Button type="primary" onClick={() => socket?.emit("start_game")}>
              Start Next Round
            </Button>
          ) : (
            "Waiting for host to start..."
          )}
        </Flex>
      </div>
      <Confetti />
    </div>
  ) : null;
});
