import joinClasses from "./joinClasses";
import styles from "./Header.module.css";
import { useState } from "react";
type Props = {
  isStarted: boolean;
  onAddAI: () => void;
  onRemoveAI: () => void;
  onStart: () => void;
  onRestart: () => void;
  onLeaveRoom: () => void;
  roomId?: string | null;
  isHost: boolean;
  onRotate: () => void;
};

export default function Header({
  isStarted,
  onAddAI,
  onRemoveAI,
  onRestart,
  onStart,
  onLeaveRoom,
  onRotate,
  isHost,
  roomId,
}: Props) {
  const [isExpanded, setExpanded] = useState(true);
  return (
    <>
      <div
        className={joinClasses(styles.root, isExpanded && styles.enabledRoot)}
      >
        <button disabled={isStarted} onClick={onAddAI}>
          Add AI
        </button>
        <button disabled={isStarted} onClick={onRemoveAI}>
          Remove AI
        </button>
        |
        <button disabled={isStarted || !isHost} onClick={onStart}>
          Start
        </button>
        <button disabled={!isHost} onClick={onRestart}>
          Restart
        </button>
        <button disabled={!isStarted || !isHost} onClick={onRotate}>
          Rotate decks
        </button>
        {roomId && (
          <>
            | Room:<b>{roomId}</b>
            <button onClick={onLeaveRoom}>Leave Room</button>
          </>
        )}
      </div>
      <button
        className={styles.floatingButton}
        onClick={() => setExpanded((e) => !e)}
      >
        {!isExpanded ? "Settings" : "Hide"}
      </button>
    </>
  );
}
