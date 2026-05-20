import { Button } from "antd";
import { observer } from "mobx-react-lite";
import { useClientContext } from "./ClientContext";
import styles from "./PauseOverlay.module.css";

export default observer(function PauseOverlay() {
  const { state, socket } = useClientContext();
  const board = state.board;
  const isHost = state.getIsHost();

  if (!board?.isPaused) {
    return null;
  }

  return (
    <div className={styles.overlay} aria-live="polite">
      <div className={styles.dialog}>
        <div className={styles.title}>Game paused</div>
        {isHost ? (
          <Button
            type="primary"
            size="large"
            onClick={() => socket?.emit("set_paused", { paused: false })}
          >
            Resume
          </Button>
        ) : (
          <div className={styles.waiting}>Waiting for host to resume...</div>
        )}
      </div>
    </div>
  );
});
