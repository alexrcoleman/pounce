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
import useNetworkInformation, {
  getNetworkInformationTitle,
  getNetworkSummary,
} from "./useNetworkInformation";

export type { SettingsOpenRequest, SettingsPage } from "./SettingsDialog";

const PENDING_MOVE_SYNC_BADGE_DELAY_MS = 2000;

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
  showFramerate: boolean;
  setShowFramerate: (show: boolean) => void;
  showNetworkStats: boolean;
  setShowNetworkStats: (show: boolean) => void;
  scale: number;
  setScale: (scale: number) => void;
  soundEffectVolume: number;
  setSoundEffectVolume: (volume: number) => void;
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
        <PendingMoveSyncBadgeContainer />
        {props.showNetworkStats ? (
          <NetworkStatsIndicator roomId={props.roomId} />
        ) : null}
        {props.showFramerate ? <FramerateIndicator /> : null}
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
          setShowFramerate={props.setShowFramerate}
          setLeftHandedMode={props.setLeftHandedMode}
          setPage={setSettingsPage}
          setScale={props.setScale}
          setSoundEffectVolume={props.setSoundEffectVolume}
          setShowNetworkStats={props.setShowNetworkStats}
          setUseAnimations={props.setUseAnimations}
          soundEffectVolume={props.soundEffectVolume}
          showFramerate={props.showFramerate}
          showNetworkStats={props.showNetworkStats}
          useAnimations={props.useAnimations}
        />
      ) : null}
    </>
  );
});

const PendingMoveSyncBadgeContainer = observer(
  function PendingMoveSyncBadgeContainer() {
    const { state } = useClientContext();
    const pendingMoveConfirmations = getPendingMoveConfirmations(
      state.pendingMoves
    );
    const showPendingMoveSyncBadge = useDelayedPendingMoveBadge(
      pendingMoveConfirmations.oldestCreatedAt
    );

    return showPendingMoveSyncBadge && pendingMoveConfirmations.count > 0 ? (
      <PendingMoveSyncBadge count={pendingMoveConfirmations.count} />
    ) : null;
  }
);

function PendingMoveSyncBadge({ count }: { count: number }) {
  const label =
    count > 1
      ? `${count} moves waiting for confirmation`
      : "Move waiting for confirmation";

  return (
    <div className={styles.syncingMoveBadge} aria-label={label} title={label}>
      <span className={styles.syncingMoveSpinner} aria-hidden="true" />
      <span className={styles.syncingMoveLabel}>Sync</span>
    </div>
  );
}

function getPendingMoveConfirmations(
  pendingMoves: ReadonlyArray<{
    acceptedRevision?: number;
    createdAt: number;
  }>
) {
  let count = 0;
  let oldestCreatedAt: number | null = null;

  pendingMoves.forEach((move) => {
    if (move.acceptedRevision != null) {
      // Accepted moves stay optimistic until the matching board revision arrives.
      return;
    }

    count += 1;
    oldestCreatedAt =
      oldestCreatedAt == null
        ? move.createdAt
        : Math.min(oldestCreatedAt, move.createdAt);
  });

  return { count, oldestCreatedAt };
}

function useDelayedPendingMoveBadge(oldestCreatedAt: number | null) {
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    if (oldestCreatedAt == null) {
      setVisible(false);
      return;
    }

    const remainingMs =
      PENDING_MOVE_SYNC_BADGE_DELAY_MS - (Date.now() - oldestCreatedAt);
    if (remainingMs <= 0) {
      setVisible(true);
      return;
    }

    setVisible(false);
    const timeout = window.setTimeout(() => setVisible(true), remainingMs);
    return () => window.clearTimeout(timeout);
  }, [oldestCreatedAt]);

  return isVisible;
}

type NetworkStatsStatus =
  | "local"
  | "offline"
  | "measuring"
  | "good"
  | "fair"
  | "poor"
  | "unstable";

const NetworkStatsIndicator = observer(function NetworkStatsIndicator({
  roomId,
}: {
  roomId?: string | null;
}) {
  const { state } = useClientContext();
  const networkInformation = useNetworkInformation();
  const isOfflineRoom = roomId?.toLowerCase() === "offline";
  const status = getNetworkStatsStatus(
    state.isConnected,
    isOfflineRoom,
    state.isPingUnstable,
    state.pingLatency
  );
  const pingLabel = getNetworkStatsPingLabel(status, state.pingLatency);
  const networkSummary = getNetworkSummary(networkInformation);
  const metaLabel = getNetworkStatsMetaLabel(status, networkSummary);
  const networkTitle = getNetworkInformationTitle(networkInformation);
  const title = getNetworkStatsTitle(status, pingLabel, networkTitle);
  const className = `${styles.networkStatsIndicator} ${getNetworkStatsClass(
    status
  )}`;

  return (
    <div className={className} aria-label={title} title={title}>
      <span className={styles.networkBars} aria-hidden="true">
        <span />
      </span>
      <span className={styles.networkStatsText}>
        <strong className={styles.networkStatsValue}>{pingLabel}</strong>
        <span className={styles.networkStatsMeta}>{metaLabel}</span>
      </span>
    </div>
  );
});

function getNetworkStatsStatus(
  isConnected: boolean,
  isOffline: boolean,
  isUnstable: boolean,
  latency: number | null
): NetworkStatsStatus {
  if (isOffline) {
    return "local";
  }
  if (!isConnected) {
    return "offline";
  }
  if (isUnstable) {
    return "unstable";
  }
  if (latency == null) {
    return "measuring";
  }
  if (latency <= 120) {
    return "good";
  }
  if (latency <= 250) {
    return "fair";
  }
  return "poor";
}

function getNetworkStatsPingLabel(
  status: NetworkStatsStatus,
  latency: number | null
): string {
  if (status === "local") {
    return "Local";
  }
  if (status === "offline") {
    return "Offline";
  }
  if (status === "measuring") {
    return "-- ms";
  }
  if (status === "unstable" && latency == null) {
    return ">3s";
  }
  return `${latency ?? 0} ms`;
}

function getNetworkStatsMetaLabel(
  status: NetworkStatsStatus,
  networkSummary: string | null
): string {
  if (status === "local") {
    return "Local";
  }
  if (status === "offline") {
    return "Offline";
  }
  if (status === "unstable") {
    return "Unstable";
  }
  return networkSummary ?? "Network";
}

function getNetworkStatsTitle(
  status: NetworkStatsStatus,
  pingLabel: string,
  networkTitle: string | null
): string {
  if (status === "local") {
    return "Offline game runs locally";
  }
  if (status === "offline") {
    return "Room connection is offline";
  }
  if (status === "measuring") {
    return networkTitle
      ? `Measuring room ping, ${networkTitle}`
      : "Measuring room ping";
  }
  if (status === "unstable") {
    return networkTitle
      ? `Unstable connection detected, ${networkTitle}`
      : "Unstable connection detected";
  }
  return networkTitle
    ? `Room ping ${pingLabel}, ${networkTitle}`
    : `Room ping ${pingLabel}`;
}

function getNetworkStatsClass(status: NetworkStatsStatus) {
  switch (status) {
    case "good":
      return styles.networkStatsGood;
    case "fair":
      return styles.networkStatsFair;
    case "poor":
      return styles.networkStatsPoor;
    case "unstable":
      return styles.networkStatsUnstable;
    case "local":
      return styles.networkStatsLocal;
    default:
      return styles.networkStatsUnknown;
  }
}

function FramerateIndicator() {
  const fps = useFramerate();
  const fpsText = fps == null ? "--" : String(fps);
  const label =
    fps == null
      ? "Measuring framerate"
      : `Framerate ${fps} frames per second`;

  return (
    <div className={styles.framerateIndicator} aria-label={label} title={label}>
      <strong>{fpsText}</strong>
      <span>FPS</span>
    </div>
  );
}

function useFramerate() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    const sampleDurationMs = 500;
    let frameCount = 0;
    let sampleStart = performance.now();
    let animationFrameId = 0;

    const update = (now: number) => {
      frameCount += 1;
      const elapsed = now - sampleStart;

      if (elapsed >= sampleDurationMs) {
        setFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        sampleStart = now;
      }

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return fps;
}

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
