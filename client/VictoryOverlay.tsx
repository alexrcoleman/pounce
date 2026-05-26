import Confetti from "react-confetti";
import ScoresTable from "./ScoresTable";
import { observer } from "mobx-react-lite";
import { useClientContext } from "./ClientContext";
import { Button, Flex, Modal } from "antd";
import Link from "next/link";
import styles from "./VictoryOverlay.module.css";
import RoundAnalysisPanel from "./RoundAnalysisPanel";
import { useEffect, useState } from "react";

const CONFETTI_DURATION_MS = 10_000;
const POST_GAME_ACTION_DELAY_MS = 1_000;

export default observer(function VictoryOverlay() {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const isHost = state.getIsHost();
  const pouncer = board.pouncer != null ? board.players[board.pouncer] : null;
  const isAnalysisLoading = pouncer != null && !state.roundAnalysis;
  const activePlayerIndex = state.getActivePlayerIndex();
  const [isAnalysisOpen, setAnalysisOpen] = useState(false);
  const [isConfettiActive, setConfettiActive] = useState(false);
  const [unlockedPostGameRoundKey, setUnlockedPostGameRoundKey] = useState<
    string | null
  >(null);
  const postGameRoundKey =
    board.pouncer != null && pouncer != null
      ? `${board.pouncer}:${pouncer.scores.length}`
      : null;
  const arePostGameActionsLocked =
    postGameRoundKey != null && unlockedPostGameRoundKey !== postGameRoundKey;

  useEffect(() => {
    setAnalysisOpen(false);

    if (postGameRoundKey == null) {
      setConfettiActive(false);
      setUnlockedPostGameRoundKey(null);
      return;
    }

    setConfettiActive(true);
    const actionDelayTimeoutId = window.setTimeout(() => {
      setUnlockedPostGameRoundKey(postGameRoundKey);
    }, POST_GAME_ACTION_DELAY_MS);
    const confettiTimeoutId = window.setTimeout(() => {
      setConfettiActive(false);
    }, CONFETTI_DURATION_MS);

    return () => {
      window.clearTimeout(actionDelayTimeoutId);
      window.clearTimeout(confettiTimeoutId);
    };
  }, [postGameRoundKey]);

  if (pouncer == null) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.title}>
          <span>
            <i>Pounce!</i> by <b>{pouncer.name}</b>
          </span>
        </div>
        <ScoresTable board={board} />
        <Flex justify="end" align="center" className={styles.actions}>
          <Button
            aria-expanded={isAnalysisOpen}
            aria-haspopup="dialog"
            disabled={isAnalysisLoading || arePostGameActionsLocked}
            loading={isAnalysisLoading}
            onClick={() => setAnalysisOpen(true)}
          >
            {isAnalysisLoading ? "Analyzing" : "Game Analysis"}
          </Button>
          <Link legacyBehavior href="/" passHref>
            <Button disabled={arePostGameActionsLocked}>Leave Room</Button>
          </Link>
          {isHost ? (
            <Button
              disabled={arePostGameActionsLocked}
              type="primary"
              onClick={() => socket?.emit("deal_hands")}
            >
              Deal hands
            </Button>
          ) : (
            "Waiting for host to deal..."
          )}
        </Flex>
      </div>
      <Modal
        centered
        closeIcon={<span className={styles.analysisCloseIcon}>X</span>}
        footer={
          <Flex justify="end" align="center" className={styles.analysisActions}>
            <Button onClick={() => setAnalysisOpen(false)}>
              Back to Scoreboard
            </Button>
          </Flex>
        }
        maskClosable
        onCancel={() => setAnalysisOpen(false)}
        open={isAnalysisOpen}
        rootClassName={styles.analysisModal}
        title="Game Analysis"
        width={880}
      >
        <div className={styles.analysisBody}>
          <RoundAnalysisPanel
            activePlayerIndex={activePlayerIndex}
            analysis={state.roundAnalysis}
          />
        </div>
      </Modal>
      {isConfettiActive && <Confetti />}
    </div>
  );
});
