import styles from "./Header.module.css";
import { type ReactNode, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Flex, Modal, Slider, Switch, Tooltip } from "antd";
import { useClientContext } from "./ClientContext";

type Props = {
  roomId?: string | null;
  onLeaveRoom: () => void;
  useAnimations: boolean;
  setUseAnimations: (use: boolean) => void;
  scale: number;
  setScale: (scale: number) => void;
};

type SettingsPage = "main" | "room" | "appearance";

const FAIR_HAND_ROTATION_HELP =
  "When on, Pounce keeps one shuffled set of hands for a short series and rotates them each round, so everyone gets a turn with the same luck. Leave it off for a brand-new shuffle every round.";

export default observer(function Header(props: Props) {
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const { state } = useClientContext();
  const isStarted = state.board?.isActive ?? false;
  const showRoomCode =
    !isStarted &&
    props.roomId != null &&
    props.roomId.toLowerCase() !== "offline";

  return (
    <>
      {showRoomCode ? (
        <div className={styles.roomCodeBadge}>
          <span>Room</span>
          <strong>{props.roomId}</strong>
        </div>
      ) : null}
      <SettingsDialog
        isSettingsOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        {...props}
      />
      <button
        className={styles.floatingButton}
        onClick={() => setSettingsOpen(true)}
      >
        Settings
      </button>
    </>
  );
});

const SettingsDialog = observer(function SettingsDialog({
  ...props
}: {
  isSettingsOpen: boolean;
  onClose: () => void;
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
  const [page, setPage] = useState<SettingsPage>("main");
  const canChangeAI = isHost && !isStarted;
  const roomLabel = props.roomId ?? "Unknown";
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
      setPage("main");
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
              onClick={() => setPage("main")}
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
            onClick={() => setPage("room")}
          >
            <span>
              <strong>Room</strong>
            </span>
            <span className={styles.navArrow} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.settingsNavButton}
            onClick={() => setPage("appearance")}
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
                    defaultValue={3}
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
