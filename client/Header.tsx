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
  setUseAnimations: (use: boolean) => void;
  scale: number;
  setScale: (scale: number) => void;
  setAILevel: (level: number) => void;
};

export default function Header({
  isStarted,
  onAddAI,
  setUseAnimations,
  onRemoveAI,
  onRestart,
  onStart,
  onLeaveRoom,
  onRotate,
  isHost,
  roomId,
  scale,
  setScale,
  setAILevel,
}: Props) {
  const [isExpanded, setExpanded] = useState(true);
  return (
    <>
      <div
        className={joinClasses(styles.root, isExpanded && styles.enabledRoot)}
      >
        {isHost && (
          <>
            <button disabled={isStarted} onClick={onAddAI}>
              Add AI
            </button>
            <button disabled={isStarted} onClick={onRemoveAI}>
              Remove AI
            </button>
            <div className={styles.slider}>
              AI Level
              <input
                type="range"
                defaultValue={3}
                min={1}
                max={9}
                step={1}
                onChange={(e) => setAILevel(e.target.valueAsNumber)}
              />
            </div>
          </>
        )}
        {isHost && (
          <>
            |
            <button disabled={isStarted} onClick={onStart}>
              Start
            </button>
            <button onClick={onRestart}>Restart</button>
            <button disabled={!isStarted} onClick={onRotate}>
              Rotate decks
            </button>
          </>
        )}
        {roomId && (
          <>
            | Room:<b>{roomId}</b>
            <button onClick={onLeaveRoom}>Leave Room</button>
          </>
        )}
        |
        <input
          type="checkbox"
          id="animations"
          defaultChecked={true}
          onChange={(e) => setUseAnimations(e.target.checked)}
        />
        <label htmlFor="animations" style={{ marginLeft: -8 }}>
          Animations
        </label>
        <div className={styles.slider}>
          Zoom
          <input
            type="range"
            value={scale}
            min="1"
            max="2"
            step=".025"
            onChange={(e) => setScale(e.target.valueAsNumber)}
          />
        </div>
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
