import styles from "./Header.module.css";
import { type ReactNode, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Flex, Modal, Slider, Switch, Tooltip } from "antd";
import { useClientContext } from "./ClientContext";
import ScoresTable from "./ScoresTable";
import RoomShare from "./RoomShare";
import isTouchDevice from "./isTouchDevice";
import type { BoardState } from "../shared/GameUtils";

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

export type SettingsPage = "main" | "room" | "appearance";

export type SettingsOpenRequest = {
  id: number;
  page: SettingsPage;
};

const FAIR_HAND_ROTATION_HELP =
  "When on, Pounce keeps one shuffled set of hands for a short series and rotates them each round, so everyone gets a turn with the same luck. Leave it off for a brand-new shuffle every round.";

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
        className={`${styles.floatingControls} ${
          canTogglePause ? styles.floatingControlsWithPause : ""
        }`}
      >
        {showScoreButton && board != null && board.pouncer == null ? (
          <HeaderScoreboardButton board={board} />
        ) : null}
        {canTogglePause ? (
          <HeaderPauseButton
            isPaused={isPaused}
            onToggle={() => socket?.emit("set_paused", { paused: !isPaused })}
          />
        ) : null}
        <button
          className={styles.floatingButton}
          onClick={() => openSettings("main")}
          type="button"
        >
          Settings
        </button>
      </div>
      <SettingsDialog
        isSettingsOpen={isSettingsOpen}
        onClose={closeSettings}
        page={settingsPage}
        setPage={setSettingsPage}
        {...props}
      />
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

function HeaderScoreboardButton({
  board,
}: {
  board: BoardState;
}) {
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    if (board.pouncer != null) {
      setOpen(false);
    }
  }, [board.pouncer]);

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
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={styles.floatingButton}
        onClick={() => setOpen(true)}
        type="button"
      >
        Scores
      </button>
      {isOpen ? (
        <div
          className={styles.scoreboardModalOverlay}
          onClick={() => setOpen(false)}
        >
          <div
            aria-label="Scoreboard"
            aria-modal="true"
            className={styles.scoreboardDialog}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="Close scoreboard"
              className={styles.scoreboardCloseButton}
              onClick={() => setOpen(false)}
              type="button"
            >
              X
            </button>
            <div className={styles.scoreboardTableWrapper}>
              <ScoresTable board={board} />
            </div>
            <div className={styles.scoreboardActions}>
              <Button type="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const SettingsDialog = observer(function SettingsDialog({
  ...props
}: {
  isSettingsOpen: boolean;
  onClose: () => void;
  page: SettingsPage;
  setPage: (page: SettingsPage) => void;
} & Props) {
  const { state, socket } = useClientContext();
  const isStarted = state.board?.isActive ?? false;
  const isPaused = state.board?.isPaused ?? false;
  const isHost = state.getIsHost();
  const aiCount =
    state.board?.players.filter((p) => p.socketId == null).length ?? 0;
  const disconnectedCount =
    state.board?.players.filter((p) => p.disconnected).length ?? 0;
  const buildDate = useLocalBuildDate(process.env.NEXT_PUBLIC_BUILD_DATE);
  const [isFairHandHelpOpen, setFairHandHelpOpen] = useState(false);
  const page = props.page;
  const canChangeAI = isHost && !isStarted;
  const roomLabel = props.roomId ?? "Unknown";
  const isOfflineRoom = props.roomId?.toLowerCase() === "offline";
  const isConnected = state.socketId !== "";
  const canShareRoom =
    props.roomId != null && props.roomId.toLowerCase() !== "offline";
  const modalTitle =
    page === "main"
      ? "Settings"
      : page === "room"
      ? "Room"
      : "Appearance";
  const setAICount = (count: number) => {
    socket?.emit("set_ai_count", { count: Math.max(0, Math.min(5, count)) });
  };

  useEffect(() => {
    if (!props.isSettingsOpen) {
      setFairHandHelpOpen(false);
    }
  }, [props.isSettingsOpen]);

  return (
    <Modal
      title={
        <div className={styles.settingsTitle}>
          {page !== "main" ? (
            <button
              type="button"
              className={styles.backButton}
              onClick={() => props.setPage("main")}
            >
              Back to settings
            </button>
          ) : null}
          <span>{modalTitle}</span>
        </div>
      }
      rootClassName={styles.settingsModal}
      width={440}
      centered
      open={props.isSettingsOpen}
      onCancel={props.onClose}
      closable={false}
      footer={null}
      styles={{
        body: {
          overflowY: "auto",
          maxHeight: "calc(100dvh - 126px)",
        },
      }}
    >
      {page === "main" ? (
        <div className={styles.settingsPage}>
          <Button
            block
            size="large"
            className={styles.backToGameListButton}
            onClick={props.onClose}
          >
            Back to game
          </Button>
          <button
            type="button"
            className={styles.settingsNavButton}
            onClick={() => props.setPage("room")}
          >
            <span>
              <strong>Room</strong>
            </span>
            <span className={styles.navArrow} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.settingsNavButton}
            onClick={() => props.setPage("appearance")}
          >
            <span>
              <strong>Appearance</strong>
            </span>
            <span className={styles.navArrow} aria-hidden="true" />
          </button>
          <Button
            danger
            block
            size="large"
            className={styles.leaveButton}
            onClick={props.onLeaveRoom}
          >
            Leave room
          </Button>
          <div className={styles.buildInfo}>Build: {buildDate}</div>
        </div>
      ) : null}

      {page === "room" ? (
        <div className={styles.settingsPage}>
          <SettingsSection title="Room">
            <SettingRow title="Room" value={roomLabel} />
            {canShareRoom ? (
              <div className={styles.shareRow}>
                <RoomShare roomId={props.roomId!} variant="settings" />
              </div>
            ) : null}
            <SettingRow
              title="Ping"
              value={
                <PingIndicator
                  isConnected={isConnected}
                  isOffline={isOfflineRoom}
                  latency={state.pingLatency}
                />
              }
            />
            <SettingRow
              title={
                <Flex align="center" gap={6}>
                  <span>Fair hand rotation</span>
                  <Tooltip
                    title={FAIR_HAND_ROTATION_HELP}
                    open={isFairHandHelpOpen}
                  >
                    <button
                      type="button"
                      className={styles.infoButton}
                      aria-label="How fair hand rotation works"
                      onBlur={() => setFairHandHelpOpen(false)}
                      onClick={() => setFairHandHelpOpen(true)}
                      onFocus={() => setFairHandHelpOpen(true)}
                      onMouseEnter={() => setFairHandHelpOpen(true)}
                      onMouseLeave={() => setFairHandHelpOpen(false)}
                    >
                      i
                    </button>
                  </Tooltip>
                </Flex>
              }
              control={
                <Switch
                  checked={state.roomSettings.fairHandRotation}
                  disabled={!isHost}
                  onChange={(enabled) =>
                    socket?.emit("set_fair_hand_rotation", { enabled })
                  }
                />
              }
            />
          </SettingsSection>

          {isHost ? (
            <SettingsSection title="Round">
              <div className={styles.buttonGrid}>
                <Button
                  disabled={!isStarted}
                  onClick={() => {
                    socket?.emit("set_paused", { paused: !isPaused });
                    props.onClose();
                  }}
                >
                  {isPaused ? "Resume" : "Pause"}
                </Button>
                <Button onClick={() => socket?.emit("restart_game")}>
                  Reset room
                </Button>
                <Button
                  disabled={!isStarted}
                  onClick={() => {
                    socket?.emit("rotate_decks");
                    props.onClose();
                  }}
                >
                  Rotate decks
                </Button>
                <Button
                  disabled={isStarted || disconnectedCount === 0}
                  onClick={() => {
                    socket?.emit("remove_disconnected_players");
                    props.onClose();
                  }}
                >
                  Clear inactive
                </Button>
              </div>
            </SettingsSection>
          ) : null}

          {isHost ? (
            <SettingsSection title="AI">
              <SettingRow
                title="Players"
                control={
                  <div className={styles.counterControl}>
                    <button
                      type="button"
                      className={styles.counterButton}
                      disabled={!canChangeAI || aiCount <= 0}
                      aria-label="Remove AI player"
                      onClick={() => setAICount(aiCount - 1)}
                    >
                      -
                    </button>
                    <div className={styles.counterValue}>
                      <strong>{aiCount}</strong>
                      <span>AI</span>
                    </div>
                    <button
                      type="button"
                      className={styles.counterButton}
                      disabled={!canChangeAI || aiCount >= 5}
                      aria-label="Add AI player"
                      onClick={() => setAICount(aiCount + 1)}
                    >
                      +
                    </button>
                  </div>
                }
              />
              <SettingRow
                title="Level"
                control={
                  <Slider
                    className={styles.inlineSlider}
                    value={state.roomSettings.aiSpeed ?? 3}
                    min={1}
                    max={10}
                    step={1}
                    onChange={(v) =>
                      socket?.emit("set_ai_level", { speed: v })
                    }
                  />
                }
              />
              <SettingRow
                title="Simulation mode"
                control={
                  <Switch
                    checked={state.roomSettings.simulationMode ?? false}
                    onChange={(v) =>
                      socket?.emit("set_ai_level", { speed: v ? 1000 : 3 })
                    }
                  />
                }
              />
            </SettingsSection>
          ) : null}
        </div>
      ) : null}

      {page === "appearance" ? (
        <div className={styles.settingsPage}>
          <SettingsSection title="Display">
            <SettingRow
              title="Animations"
              control={
                <Switch
                  checked={props.useAnimations}
                  onChange={(v) => props.setUseAnimations(v)}
                />
              }
            />
            <SettingRow
              title="Easy-read cards"
              control={
                <Switch
                  checked={props.easyReadCards}
                  onChange={(v) => props.setEasyReadCards(v)}
                />
              }
            />
            <SettingRow
              title="Left-handed mode"
              control={
                <Switch
                  checked={props.leftHandedMode}
                  onChange={(v) => props.setLeftHandedMode(v)}
                />
              }
            />
            <div className={styles.sliderBlock}>
              <div className={styles.sliderHeader}>
                <span>Zoom</span>
                <strong>{Math.round(props.scale * 100)}%</strong>
              </div>
              <Slider
                min={0.5}
                max={2}
                step={0.025}
                value={props.scale}
                onChange={(v) => props.setScale(v)}
              />
            </div>
          </SettingsSection>
        </div>
      ) : null}
    </Modal>
  );
});

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.settingsSection}>
      <h3>{title}</h3>
      <div className={styles.settingsSectionBody}>{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  value,
  control,
}: {
  title: ReactNode;
  value?: ReactNode;
  control?: ReactNode;
}) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingTitle}>{title}</div>
      {control ?? <div className={styles.settingValue}>{value}</div>}
    </div>
  );
}

type PingStatus =
  | "local"
  | "offline"
  | "measuring"
  | "good"
  | "fair"
  | "poor";

function PingIndicator({
  isConnected,
  isOffline,
  latency,
}: {
  isConnected: boolean;
  isOffline: boolean;
  latency: number | null;
}) {
  const status = getPingStatus(isConnected, isOffline, latency);
  const label = getPingLabel(status, latency);
  const className = `${styles.pingDot} ${getPingDotClass(status)}`;
  const title =
    status === "local"
      ? "Offline game runs locally"
      : status === "offline"
      ? "Room connection is offline"
      : status === "measuring"
      ? "Measuring room ping"
      : `Room ping: ${label}`;

  return (
    <span className={styles.pingIndicator} aria-label={title} title={title}>
      <span className={className} aria-hidden="true" />
      <span className={styles.pingText}>{label}</span>
    </span>
  );
}

function getPingStatus(
  isConnected: boolean,
  isOffline: boolean,
  latency: number | null
): PingStatus {
  if (isOffline) {
    return "local";
  }
  if (!isConnected) {
    return "offline";
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

function getPingLabel(status: PingStatus, latency: number | null) {
  if (status === "local") {
    return "Local";
  }
  if (status === "offline") {
    return "Offline";
  }
  if (status === "measuring") {
    return "Measuring";
  }
  return `${latency ?? 0} ms`;
}

function getPingDotClass(status: PingStatus) {
  switch (status) {
    case "good":
      return styles.pingGood;
    case "fair":
      return styles.pingFair;
    case "poor":
      return styles.pingPoor;
    case "local":
      return styles.pingLocal;
    default:
      return styles.pingUnknown;
  }
}

function useLocalBuildDate(buildDate: string | undefined) {
  const [formattedDate, setFormattedDate] = useState("unknown");

  useEffect(() => {
    if (!buildDate) {
      setFormattedDate("unknown");
      return;
    }

    const date = new Date(buildDate);
    if (Number.isNaN(date.getTime())) {
      setFormattedDate(buildDate);
      return;
    }

    setFormattedDate(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(date)
    );
  }, [buildDate]);

  return formattedDate;
}
