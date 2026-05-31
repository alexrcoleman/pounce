import styles from "./Header.module.css";
import AudioMutedOutlined from "@ant-design/icons/AudioMutedOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import SoundOutlined from "@ant-design/icons/SoundOutlined";
import { type ReactNode, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Flex, Modal, Slider, Switch } from "antd";
import { useClientContext } from "./ClientContext";
import RoomShare from "./RoomShare";
import ChevronLeftIcon from "./icons/ChevronLeftIcon";
import InfoTooltipIcon from "./InfoTooltipIcon";
import useNetworkInformation, {
  getNetworkInformationTitle,
  getNetworkSummary,
  type NetworkInformationSnapshot,
} from "./useNetworkInformation";

type SettingsDialogProps = {
  roomId?: string | null;
  onLeaveRoom: () => void;
};

const FAIR_HAND_ROTATION_HELP =
  "When on, Pounce keeps one shuffled set of hands for a short series and rotates them each round, so everyone gets a turn with the same luck. Leave it off for a brand-new shuffle every round.";

const AI_DIFFICULTY_PRESETS = [
  { key: "easy", label: "Easy", speed: 3 },
  { key: "medium", label: "Medium", speed: 4 },
  { key: "hard", label: "Hard", speed: 5 },
] as const;

export type AIDifficultyMode =
  | (typeof AI_DIFFICULTY_PRESETS)[number]["key"]
  | "custom";

const CUSTOM_AI_MIN = 1;
const CUSTOM_AI_MAX = 10;

export default observer(function SettingsDialog({
  ...props
}: SettingsDialogProps) {
  const { settings, state, socket } = useClientContext();
  const isStarted = state.board?.isActive ?? false;
  const isPaused = state.board?.isPaused ?? false;
  const isHost = state.getIsHost();
  const serverAICount =
    state.board?.players.filter((p) => p.socketId == null).length ?? 0;
  const disconnectedCount =
    state.board?.players.filter((p) => p.disconnected).length ?? 0;
  const buildDate = useLocalBuildDate(process.env.NEXT_PUBLIC_BUILD_DATE);
  const networkInformation = useNetworkInformation();
  const [isFairHandHelpOpen, setFairHandHelpOpen] = useState(false);
  const [localAICount, setLocalAICount] = useState(serverAICount);
  const currentAISpeed = state.roomSettings.aiSpeed ?? 3;
  const [aiDifficultyMode, setAIDifficultyMode] = useState<AIDifficultyMode>(
    () => getAIDifficultyMode(currentAISpeed)
  );
  const [customAISpeed, setCustomAISpeed] = useState(() =>
    normalizeCustomAISpeed(currentAISpeed)
  );
  const page = settings.settingsPage;
  const canChangeAI = isHost && !isStarted;
  const roomLabel = props.roomId ?? "Unknown";
  const isOfflineRoom = props.roomId?.toLowerCase() === "offline";
  const isConnected = state.isConnected;
  const canShareRoom =
    props.roomId != null && props.roomId.toLowerCase() !== "offline";
  const modalTitle =
    page === "main"
      ? "Settings"
      : page === "room"
      ? "Room"
      : "Appearance";
  const setAICount = (count: number) => {
    const nextCount = normalizeAICount(count);
    setLocalAICount(nextCount);
    socket?.emit("set_ai_count", { count: nextCount });
  };
  const selectAIDifficulty = (mode: AIDifficultyMode) => {
    setAIDifficultyMode(mode);
    const preset = AI_DIFFICULTY_PRESETS.find((item) => item.key === mode);
    if (!preset) {
      return;
    }
    setCustomAISpeed(preset.speed);
    socket?.emit("set_ai_level", { speed: preset.speed });
  };
  const setCustomAIDifficulty = (speed: number) => {
    const normalizedSpeed = normalizeCustomAISpeed(speed);
    setAIDifficultyMode("custom");
    setCustomAISpeed(normalizedSpeed);
    socket?.emit("set_ai_level", { speed: normalizedSpeed });
  };

  useEffect(() => {
    if (!settings.isSettingsOpen) {
      setFairHandHelpOpen(false);
    }
  }, [settings.isSettingsOpen]);

  return (
    <Modal
      title={
        <div className={styles.settingsTitle}>
          {page !== "main" ? (
            <button
              type="button"
              className={styles.backButton}
              onClick={() => settings.setSettingsPage("main")}
              aria-label="Back to settings"
            >
              <ChevronLeftIcon
                aria-hidden="true"
                className={styles.backIcon}
              />
              <span>Settings</span>
            </button>
          ) : null}
          <span>{modalTitle}</span>
          <button
            aria-label="Close settings"
            className={styles.settingsCloseButton}
            onClick={settings.closeSettings}
            type="button"
          >
            <CloseOutlined
              aria-hidden="true"
              className={styles.settingsCloseIcon}
              rev={undefined}
            />
          </button>
        </div>
      }
      rootClassName={styles.settingsModal}
      width={440}
      centered
      open={settings.isSettingsOpen}
      onCancel={settings.closeSettings}
      closable={false}
      footer={null}
    >
      {page === "main" ? (
        <div className={styles.settingsPage}>
          <Button
            block
            size="large"
            className={styles.backToGameListButton}
            onClick={settings.closeSettings}
          >
            Back to game
          </Button>
          <button
            type="button"
            className={styles.settingsNavButton}
            onClick={() => settings.setSettingsPage("room")}
          >
            <span>
              <strong>Room</strong>
            </span>
            <span className={styles.navArrow} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.settingsNavButton}
            onClick={() => settings.setSettingsPage("appearance")}
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
                  isUnstable={state.isPingUnstable}
                  latency={state.pingLatency}
                  networkInformation={networkInformation}
                />
              }
            />
            <SettingRow
              title={
                <Flex align="center" gap={6}>
                  <span>Fair hand rotation</span>
                  <InfoTooltipIcon
                    aria-label="How fair hand rotation works"
                    onBlur={() => setFairHandHelpOpen(false)}
                    onClick={() => setFairHandHelpOpen(true)}
                    onFocus={() => setFairHandHelpOpen(true)}
                    onMouseEnter={() => setFairHandHelpOpen(true)}
                    onMouseLeave={() => setFairHandHelpOpen(false)}
                    tooltipOpen={isFairHandHelpOpen}
                  >
                    {FAIR_HAND_ROTATION_HELP}
                  </InfoTooltipIcon>
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
                    settings.closeSettings();
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
                    settings.closeSettings();
                  }}
                >
                  Rotate decks
                </Button>
                <Button
                  disabled={isStarted || disconnectedCount === 0}
                  onClick={() => {
                    socket?.emit("remove_disconnected_players");
                    settings.closeSettings();
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
                      disabled={!canChangeAI || localAICount <= 0}
                      aria-label="Remove AI player"
                      onClick={() => setAICount(localAICount - 1)}
                    >
                      -
                    </button>
                    <div className={styles.counterValue}>
                      <strong>{localAICount}</strong>
                      <span>AI</span>
                    </div>
                    <button
                      type="button"
                      className={styles.counterButton}
                      disabled={!canChangeAI || localAICount >= 5}
                      aria-label="Add AI player"
                      onClick={() => setAICount(localAICount + 1)}
                    >
                      +
                    </button>
                  </div>
                }
              />
              <AIDifficultyControl
                customSpeed={customAISpeed}
                mode={aiDifficultyMode}
                onSelectMode={selectAIDifficulty}
                onSetCustomSpeed={setCustomAIDifficulty}
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
                  checked={settings.useAnimations}
                  onChange={(v) => settings.setUseAnimations(v)}
                />
              }
            />
            <SettingRow
              title="Easy-read cards"
              control={
                <Switch
                  checked={settings.easyReadCards}
                  onChange={(v) => settings.setEasyReadCards(v)}
                />
              }
            />
            <SettingRow
              title="Left-handed mode"
              control={
                <Switch
                  checked={settings.leftHandedMode}
                  onChange={(v) => settings.setLeftHandedMode(v)}
                />
              }
            />
            <SettingRow
              title="Show framerate"
              control={
                <Switch
                  checked={settings.showFramerate}
                  onChange={(v) => settings.setShowFramerate(v)}
                />
              }
            />
            <SettingRow
              title="Show network stats"
              control={
                <Switch
                  checked={settings.showNetworkStats}
                  onChange={(v) => settings.setShowNetworkStats(v)}
                />
              }
            />
            <div className={styles.sliderBlock}>
              <div className={styles.sliderHeader}>
                <span>Zoom</span>
                <strong>{Math.round(settings.scale * 100)}%</strong>
              </div>
              <Slider
                min={0.5}
                max={2}
                step={0.025}
                value={settings.scale}
                onChange={(v) => settings.setScale(v)}
              />
            </div>
          </SettingsSection>
          <SettingsSection title="Audio">
            <div className={styles.volumeBlock}>
              <div className={styles.sliderHeader}>
                <span>Sound effects</span>
                <strong>{Math.round(settings.soundEffectVolume)}%</strong>
              </div>
              <div className={styles.volumeControl}>
                <button
                  type="button"
                  className={styles.volumeMuteButton}
                  aria-label={
                    settings.soundEffectVolume > 0
                      ? "Mute sound effects"
                      : "Unmute sound effects"
                  }
                  aria-pressed={settings.soundEffectVolume === 0}
                  title={
                    settings.soundEffectVolume > 0
                      ? "Mute sound effects"
                      : "Unmute sound effects"
                  }
                  onClick={settings.toggleSoundEffectMute}
                >
                  {settings.soundEffectVolume > 0 ? (
                    <SoundOutlined
                      aria-hidden="true"
                      className={styles.volumeIcon}
                      rev={undefined}
                    />
                  ) : (
                    <AudioMutedOutlined
                      aria-hidden="true"
                      className={styles.volumeIcon}
                      rev={undefined}
                    />
                  )}
                </button>
                <Slider
                  aria-label="Sound effect volume"
                  className={styles.volumeSlider}
                  min={0}
                  max={100}
                  step={5}
                  value={settings.soundEffectVolume}
                  onChange={(v) => settings.setSoundEffectVolume(v)}
                />
              </div>
            </div>
          </SettingsSection>
        </div>
      ) : null}
    </Modal>
  );
});

export function AIDifficultyControl({
  customSpeed,
  mode,
  onSelectMode,
  onSetCustomSpeed,
}: {
  customSpeed: number;
  mode: AIDifficultyMode;
  onSelectMode: (mode: AIDifficultyMode) => void;
  onSetCustomSpeed: (speed: number) => void;
}) {
  return (
    <div className={styles.aiDifficultyBlock}>
      <div className={styles.sliderHeader}>
        <span>Level</span>
        <strong>{getAIDifficultySummary(mode, customSpeed)}</strong>
      </div>
      <div
        className={styles.aiDifficultyControl}
        role="group"
        aria-label="AI difficulty"
      >
        {AI_DIFFICULTY_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            aria-pressed={mode === preset.key}
            onClick={() => onSelectMode(preset.key)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={mode === "custom"}
          onClick={() => onSelectMode("custom")}
        >
          Custom
        </button>
      </div>
      {mode === "custom" ? (
        <div className={styles.customAIDifficulty}>
          <button
            type="button"
            className={styles.customAIButton}
            disabled={customSpeed <= CUSTOM_AI_MIN}
            aria-label="Decrease custom AI level"
            onClick={() => onSetCustomSpeed(customSpeed - 1)}
          >
            -
          </button>
          <label className={styles.customAIInputLabel}>
            <span>Speed</span>
            <input
              type="number"
              min={CUSTOM_AI_MIN}
              max={CUSTOM_AI_MAX}
              step={1}
              value={customSpeed}
              onChange={(event) => {
                const nextSpeed = event.currentTarget.valueAsNumber;
                if (Number.isFinite(nextSpeed)) {
                  onSetCustomSpeed(nextSpeed);
                }
              }}
            />
          </label>
          <button
            type="button"
            className={styles.customAIButton}
            disabled={customSpeed >= CUSTOM_AI_MAX}
            aria-label="Increase custom AI level"
            onClick={() => onSetCustomSpeed(customSpeed + 1)}
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
  | "poor"
  | "unstable";

function PingIndicator({
  isConnected,
  isOffline,
  isUnstable,
  latency,
  networkInformation,
}: {
  isConnected: boolean;
  isOffline: boolean;
  isUnstable: boolean;
  latency: number | null;
  networkInformation: NetworkInformationSnapshot;
}) {
  const status = getPingStatus(isConnected, isOffline, isUnstable, latency);
  const label = getPingLabel(status, latency);
  const className = `${styles.pingDot} ${getPingDotClass(status)}`;
  const networkSummary = getNetworkSummary(networkInformation);
  const networkTitle = getNetworkInformationTitle(networkInformation);
  const title =
    status === "local"
      ? "Offline game runs locally"
      : status === "offline"
      ? "Room connection is offline"
      : status === "measuring"
      ? "Measuring room ping"
      : status === "unstable"
      ? `Room ping has exceeded 3 seconds${
          networkTitle ? `, ${networkTitle}` : ""
        }`
      : `Room ping: ${label}${networkTitle ? `, ${networkTitle}` : ""}`;

  return (
    <span className={styles.pingIndicator} aria-label={title} title={title}>
      <span className={className} aria-hidden="true" />
      <span className={styles.pingText}>
        {networkSummary && status !== "local"
          ? `${label} / ${networkSummary}`
          : label}
      </span>
    </span>
  );
}

function getPingStatus(
  isConnected: boolean,
  isOffline: boolean,
  isUnstable: boolean,
  latency: number | null
): PingStatus {
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
  if (status === "unstable") {
    return latency == null ? "Unstable" : `${latency} ms`;
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
    case "unstable":
      return styles.pingUnstable;
    case "local":
      return styles.pingLocal;
    default:
      return styles.pingUnknown;
  }
}

function getAIDifficultyMode(speed: number): AIDifficultyMode {
  return (
    AI_DIFFICULTY_PRESETS.find((preset) => preset.speed === speed)?.key ??
    "custom"
  );
}

function normalizeCustomAISpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    return 3;
  }
  return Math.max(CUSTOM_AI_MIN, Math.min(CUSTOM_AI_MAX, Math.round(speed)));
}

function normalizeAICount(count: number): number {
  if (!Number.isFinite(count)) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.trunc(count)));
}

function getAIDifficultySummary(
  mode: AIDifficultyMode,
  customSpeed: number
): string {
  if (mode === "custom") {
    return `Custom (${customSpeed})`;
  }
  return (
    AI_DIFFICULTY_PRESETS.find((preset) => preset.key === mode)?.label ?? ""
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
