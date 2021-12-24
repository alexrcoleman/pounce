import styles from "./Header.module.css";
type Props = {
  isStarted: boolean;
  onAddAI: () => void;
  onRemoveAI: () => void;
  onStart: () => void;
  onRestart: () => void;
};

export default function Header({
  isStarted,
  onAddAI,
  onRemoveAI,
  onRestart,
  onStart,
}: Props) {
  return (
    <div className={styles.root}>
      <button disabled={isStarted} onClick={onAddAI}>
        Add AI
      </button>
      <button disabled={isStarted} onClick={onRemoveAI}>
        Remove AI
      </button>
      <button disabled={isStarted} onClick={onStart}>
        Start
      </button>
      <button disabled={!isStarted} onClick={onRestart}>
        Restart
      </button>
    </div>
  );
}
