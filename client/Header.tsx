import styles from "./Header.module.css";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Modal, Tooltip } from "antd";
import { useClientContext } from "./ClientContext";
import ScoresTable from "./ScoresTable";
import isTouchDevice from "./isTouchDevice";
import type { BoardState } from "../shared/GameUtils";
import SettingsDialog, {
  type SettingsOpenRequest,
  type SettingsPage,
} from "./SettingsDialog";

export type { SettingsOpenRequest, SettingsPage } from "./SettingsDialog";

type Props = {
  roomId?: string | null;
  onLeaveRoom: () => void;
  settingsRequest?: SettingsOpenRequest | null;
  onSettingsRequestHandled?: () => void;
  useAnimations: boolean;
  setUseAnimations: (use: boolean) => void;
  leftHandedMode: boolean;
  setLeftHandedMode: (use: boolean) => void;
  easyReadCards: boolean;
  setEasyReadCards: (use: boolean) => void;
  scale: number;
  setScale: (scale: number) => void;
};

export default observer(function Header(props: Props) {
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("main");
  const [showScoreButton, setShowScoreButton] = useState(false);
  const { state, socket } = useClientContext();
  const board = state.board;
  const isStarted = state.board?.isActive ?? false;
  const isPaused = state.board?.isPaused ?? false;
  const isHost = state.getIsHost();
  const canTogglePause = isStarted && isHost;
  const showRoomCode =
    !isStarted &&
    !isHost &&
    props.roomId != null &&
    props.roomId.toLowerCase() !== "offline";
  const openSettings = (page: SettingsPage) => {
    setSettingsPage(page);
    setSettingsOpen(true);
  };
  const closeSettings = () => {
    setSettingsOpen(false);
    setSettingsPage("main");
  };

  useEffect(() => {
    const request = props.settingsRequest;
    if (!request) {
      return;
    }
    setSettingsPage(request.page);
    setSettingsOpen(true);
    props.onSettingsRequestHandled?.();
  }, [props.settingsRequest, props.onSettingsRequestHandled]);

  useEffect(() => {
    const updateShowScoreButton = () => {
      setShowScoreButton(
        isTouchDevice() || window.matchMedia("(max-width: 720px)").matches
      );
    };
    updateShowScoreButton();
    window.addEventListener("resize", updateShowScoreButton);
    return () => window.removeEventListener("resize", updateShowScoreButton);
  }, []);

  return (
    <>
      {showRoomCode ? (
        <div className={styles.roomCodeBadge}>
          <span>Room</span>
          <strong>{props.roomId}</strong>
        </div>
      ) : null}
      <div
        className={styles.floatingControls}
        role="toolbar"
        aria-label="Game controls"
      >
        {canTogglePause ? (
          <HeaderPauseButton
            isPaused={isPaused}
            onToggle={() => socket?.emit("set_paused", { paused: !isPaused })}
          />
        ) : null}
        {showScoreButton && board != null && board.pouncer == null ? (
          <HeaderScoreboardButton board={board} />
        ) : null}
        <button
          className={styles.floatingButton}
          onClick={() => openSettings("main")}
          aria-label="Open settings"
          title="Settings"
          type="button"
        >
          <SettingOutlined
            aria-hidden="true"
            className={styles.settingsIcon}
            rev={undefined}
          />
          <span className={styles.buttonLabel}>Settings</span>
        </button>
      </div>
      {isSettingsOpen ? (
        <SettingsDialog
          easyReadCards={props.easyReadCards}
          isSettingsOpen={isSettingsOpen}
          leftHandedMode={props.leftHandedMode}
          onClose={closeSettings}
          onLeaveRoom={props.onLeaveRoom}
          page={settingsPage}
          roomId={props.roomId}
          scale={props.scale}
          setEasyReadCards={props.setEasyReadCards}
          setLeftHandedMode={props.setLeftHandedMode}
          setPage={setSettingsPage}
          setScale={props.setScale}
          setUseAnimations={props.setUseAnimations}
          useAnimations={props.useAnimations}
        />
      ) : null}
    </>
  );
});

function HeaderPauseButton({
  isPaused,
  onToggle,
}: {
  isPaused: boolean;
  onToggle: () => void;
}) {
  const label = isPaused ? "Resume game" : "Pause game";

  return (
    <Tooltip title={label}>
      <button
        aria-label={label}
        aria-pressed={isPaused}
        className={`${styles.floatingButton} ${styles.iconButton}`}
        onClick={onToggle}
        title={label}
        type="button"
      >
        <span
          aria-hidden="true"
          className={isPaused ? styles.playIcon : styles.pauseIcon}
        />
      </button>
    </Tooltip>
  );
}

function HeaderScoreboardButton({ board }: { board: BoardState }) {
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    if (board.pouncer != null) {
      setOpen(false);
    }
  }, [board.pouncer]);

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={styles.floatingButton}
        onClick={() => setOpen(true)}
        title="Scores"
        type="button"
      >
        <span aria-hidden="true" className={styles.scoresIcon} />
        <span className={styles.buttonLabel}>Scores</span>
      </button>
      <Modal
        centered
        closeIcon={<span className={styles.scoreboardCloseIcon}>X</span>}
        footer={
          <div className={styles.scoreboardActions}>
            <Button type="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        }
        maskClosable
        onCancel={() => setOpen(false)}
        open={isOpen}
        rootClassName={styles.scoreboardModal}
        title="Scores"
        width={640}
      >
        <div className={styles.scoreboardTableWrapper}>
          <ScoresTable board={board} />
        </div>
      </Modal>
    </>
  );
}
