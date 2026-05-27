import styles from "./Header.module.css";
import BorderOutlined from "@ant-design/icons/BorderOutlined";
import CheckSquareOutlined from "@ant-design/icons/CheckSquareOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import OrderedListOutlined from "@ant-design/icons/OrderedListOutlined";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import SmileOutlined from "@ant-design/icons/SmileOutlined";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Modal, Popover } from "antd";
import { useClientContext } from "./ClientContext";
import DesktopOnlyTooltip from "./DesktopOnlyTooltip";
import ScoresTable from "./ScoresTable";
import isTouchDevice from "./isTouchDevice";
import type { BoardState } from "../shared/GameUtils";
import { REACTION_OPTIONS, type ReactionId } from "../shared/Reactions";
import {
  getStuckVoteStatus,
  getStuckVotingPlayerIndices,
} from "../shared/StuckPlayers";
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
  const activePlayerIndex = state.getActivePlayerIndex();
  const stuckOptions = { includePaused: true };
  const stuckStatus = getStuckVoteStatus(
    board,
    state.stuckPlayerIndices,
    stuckOptions
  );
  const stuckVotingPlayerIndices = getStuckVotingPlayerIndices(
    board,
    stuckOptions
  );
  const isActivePlayerStuck = stuckStatus.playerIndices.includes(
    activePlayerIndex
  );
  const canTogglePause = isStarted && isHost;
  const canSendReactions =
    board != null &&
    socket != null &&
    getCanSendReactions(board, props.roomId, state.getActivePlayerIndex());
  const showStuckButton = stuckVotingPlayerIndices.includes(activePlayerIndex);
  const canMarkStuck = showStuckButton && !isPaused && socket != null;
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
        {canSendReactions ? (
          <HeaderReactionButton
            onSelectReaction={(reactionId) =>
              socket?.emit("send_reaction", { reactionId })
            }
          />
        ) : null}
        {canTogglePause ? (
          <HeaderPauseButton
            isPaused={isPaused}
            onToggle={() => socket?.emit("set_paused", { paused: !isPaused })}
          />
        ) : null}
        {showScoreButton && board != null && board.pouncer == null ? (
          <HeaderScoreboardButton board={board} />
        ) : null}
        {showStuckButton ? (
          <HeaderStuckButton
            disabled={!canMarkStuck}
            isStuck={isActivePlayerStuck}
            stuckCount={stuckStatus.count}
            stuckTotal={stuckStatus.total}
            onToggle={() =>
              socket?.emit("set_stuck", { stuck: !isActivePlayerStuck })
            }
          />
        ) : null}
        <DesktopOnlyTooltip title="Open settings">
          <button
            className={`${styles.floatingButton} ${styles.settingsButton}`}
            onClick={() => openSettings("main")}
            aria-label="Open settings"
            type="button"
          >
            <SettingOutlined
              aria-hidden="true"
              className={styles.settingsIcon}
              rev={undefined}
            />
            <span className={styles.buttonLabel}>Settings</span>
          </button>
        </DesktopOnlyTooltip>
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

function HeaderReactionButton({
  onSelectReaction,
}: {
  onSelectReaction: (reactionId: ReactionId) => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const menuId = "pounce-reaction-menu";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const reactionMenu = (
    <div
      aria-label="Reactions"
      className={styles.reactionMenu}
      id={menuId}
      role="menu"
    >
      {REACTION_OPTIONS.map((reaction) => (
        <button
          aria-label={`Send ${reaction.label} reaction`}
          className={styles.reactionOption}
          key={reaction.id}
          onClick={() => {
            onSelectReaction(reaction.id);
            setOpen(false);
          }}
          role="menuitem"
          type="button"
        >
          {reaction.emoji}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.reactionControl}>
      <Popover
        arrow={false}
        autoAdjustOverflow
        content={reactionMenu}
        destroyTooltipOnHide
        onOpenChange={setOpen}
        open={isOpen}
        placement="bottom"
        rootClassName={styles.reactionPopover}
        trigger="click"
      >
        <span className={styles.reactionTrigger}>
          <DesktopOnlyTooltip title="Send reaction">
            <button
              aria-controls={isOpen ? menuId : undefined}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              aria-label="Send reaction"
              className={`${styles.floatingButton} ${styles.iconButton} ${
                isOpen ? styles.reactionButtonOpen : ""
              }`}
              type="button"
            >
              <SmileOutlined
                aria-hidden="true"
                className={styles.reactionIcon}
                rev={undefined}
              />
            </button>
          </DesktopOnlyTooltip>
        </span>
      </Popover>
    </div>
  );
}

function HeaderStuckButton({
  disabled,
  isStuck,
  onToggle,
  stuckCount,
  stuckTotal,
}: {
  disabled: boolean;
  isStuck: boolean;
  onToggle: () => void;
  stuckCount: number;
  stuckTotal: number;
}) {
  const label = isStuck ? "Clear stuck mark" : "Mark yourself stuck";
  const buttonLabel =
    stuckCount > 0 ? `${stuckCount}/${stuckTotal} stuck` : "I'm stuck";
  const Icon = isStuck ? CheckSquareOutlined : BorderOutlined;

  return (
    <DesktopOnlyTooltip title={label}>
      <button
        aria-label={label}
        aria-pressed={isStuck}
        className={`${styles.floatingButton} ${styles.stuckButton} ${
          isStuck ? styles.stuckButtonActive : ""
        }`}
        disabled={disabled}
        onClick={onToggle}
        type="button"
      >
        <Icon aria-hidden="true" className={styles.stuckIcon} rev={undefined} />
        <span className={styles.buttonLabel}>{buttonLabel}</span>
      </button>
    </DesktopOnlyTooltip>
  );
}

function HeaderPauseButton({
  isPaused,
  onToggle,
}: {
  isPaused: boolean;
  onToggle: () => void;
}) {
  const label = isPaused ? "Resume game" : "Pause game";

  return (
    <DesktopOnlyTooltip title={label}>
      <button
        aria-label={label}
        aria-pressed={isPaused}
        className={`${styles.floatingButton} ${styles.iconButton}`}
        onClick={onToggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className={isPaused ? styles.playIcon : styles.pauseIcon}
        />
      </button>
    </DesktopOnlyTooltip>
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
      <DesktopOnlyTooltip title="Open scores">
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="Open scores"
          className={`${styles.floatingButton} ${styles.iconButton}`}
          onClick={() => setOpen(true)}
          type="button"
        >
          <OrderedListOutlined
            aria-hidden="true"
            className={styles.scoresIcon}
            rev={undefined}
          />
        </button>
      </DesktopOnlyTooltip>
      <Modal
        centered
        closeIcon={
          <CloseOutlined
            aria-hidden="true"
            className={styles.scoreboardCloseIcon}
            rev={undefined}
          />
        }
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

function getCanSendReactions(
  board: BoardState,
  roomId: string | null | undefined,
  activePlayerIndex: number
) {
  if (roomId == null || roomId.toLowerCase() === "offline") {
    return false;
  }

  const activePlayer = board.players[activePlayerIndex];
  if (
    !activePlayer ||
    activePlayer.socketId == null ||
    activePlayer.disconnected
  ) {
    return false;
  }

  return true;
}
