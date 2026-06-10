import styles from "./Header.module.css";
import AudioMutedOutlined from "@ant-design/icons/AudioMutedOutlined";
import CloseOutlined from "@ant-design/icons/CloseOutlined";
import SoundOutlined from "@ant-design/icons/SoundOutlined";
import { type ReactNode, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Flex, Modal, Select, Slider, Switch } from "antd";
import { useClientContext } from "./ClientContext";
import RoomShare from "./RoomShare";
import ChevronLeftIcon from "./icons/ChevronLeftIcon";
import InfoTooltipIcon from "./InfoTooltipIcon";
import {
  AI_DIFFICULTY_PRESETS,
  DEFAULT_AI_LEVEL,
  MAX_AI_LEVEL,
  MIN_AI_LEVEL,
  SIMULATION_AI_LEVEL,
  normalizeAILevel,
  type AIDifficultyPresetKey,
} from "../shared/AIDifficulty";
import {
  getFairHandMode,
  type FairHandMode,
} from "../shared/FairHands";
import type { BoardState, PlayerState } from "../shared/GameUtils";
import type { AIMode } from "../shared/RoomState";
import useNetworkInformation, {
  getNetworkInformationTitle,
  getNetworkSummary,
  type NetworkInformationSnapshot,
} from "./useNetworkInformation";
import {
  areDragInputCapabilitiesEqual,
  getDragInputCapabilities,
  hasHybridDragInputCapability,
  resolveDragInputMode,
  subscribeToDragInputCapabilityChanges,
  type DragInputCapabilities,
  type DragInputModePreference,
  type ResolvedDragInputMode,
} from "./dragInputMode";

export type SettingsPage = "main" | "room" | "appearance";

export type SettingsOpenRequest = {
  id: number;
  page: SettingsPage;
};

type SettingsDialogProps = {
  roomId?: string | null;
  onLeaveRoom: () => void;
};

const FAIR_HAND_MODE_OPTIONS: { value: FairHandMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "rotate", label: "Take turns with hands" },
  { value: "fairest", label: "Best hand to least lucky" },
];

const AI_MODE_OPTIONS = [
  { key: "fixed", label: "Fixed AIs" },
  { key: "trained", label: "Trained model" },
  { key: "hybrid", label: "Hybrid" },
] as const;

const DRAG_INPUT_MODE_OPTIONS: {
  value: DragInputModePreference;
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "touch", label: "Touch" },
  { value: "mouse", label: "Mouse" },
];

export type AIDifficultyMode = AIDifficultyPresetKey | "custom";

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
  const [dragInputCapabilities, setDragInputCapabilities] =
    useState<DragInputCapabilities>(getDragInputCapabilities);
  const networkInformation = useNetworkInformation();
  const [isFairHandHelpOpen, setFairHandHelpOpen] = useState(false);
  const [localAICount, setLocalAICount] = useState(serverAICount);
  const fairHandMode = getFairHandMode(state.roomSettings);
  const currentAISpeed = state.roomSettings.aiSpeed ?? DEFAULT_AI_LEVEL;
  const [aiDifficultyMode, setAIDifficultyMode] = useState<AIDifficultyMode>(
    () => getAIDifficultyMode(currentAISpeed)
  );
  const [customAISpeed, setCustomAISpeed] = useState(() =>
    normalizeCustomAISpeed(currentAISpeed)
  );
  const currentAIMode = state.roomSettings.aiMode ?? "fixed";
  const resolvedDragInputMode = resolveDragInputMode(
    settings.dragInputMode,
    dragInputCapabilities
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
    setCustomAISpeed(preset.level);
    socket?.emit("set_ai_level", { speed: preset.level });
  };
  const setCustomAIDifficulty = (speed: number) => {
    const normalizedSpeed = normalizeCustomAISpeed(speed);
    setAIDifficultyMode("custom");
    setCustomAISpeed(normalizedSpeed);
    socket?.emit("set_ai_level", { speed: normalizedSpeed });
  };
  const selectAIMode = (mode: AIMode) => {
    socket?.emit("set_ai_mode", { mode });
  };

  useEffect(() => {
    if (!settings.isSettingsOpen) {
      setFairHandHelpOpen(false);
    }
  }, [settings.isSettingsOpen]);
  useEffect(() => {
    const updateDragInputCapabilities = (
      next = getDragInputCapabilities()
    ) => {
      setDragInputCapabilities((current) =>
        areDragInputCapabilitiesEqual(current, next) ? current : next
      );
    };

    updateDragInputCapabilities();
    return subscribeToDragInputCapabilityChanges(updateDragInputCapabilities);
  }, []);

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
      transitionName=""
      maskTransitionName=""
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
                  <span>Fair hands</span>
                  <InfoTooltipIcon
                    aria-label="How fair hands works"
                    onBlur={() => setFairHandHelpOpen(false)}
                    onClick={() => setFairHandHelpOpen(true)}
                    onFocus={() => setFairHandHelpOpen(true)}
                    onMouseEnter={() => setFairHandHelpOpen(true)}
                    onMouseLeave={() => setFairHandHelpOpen(false)}
                    tooltipClassName={styles.fairHandTooltipOverlay}
                    tooltipOpen={isFairHandHelpOpen}
                  >
                    <FairHandModeTooltip board={state.board} />
                  </InfoTooltipIcon>
                </Flex>
              }
              control={
                <Select
                  className={styles.fairHandSelect}
                  disabled={!isHost}
                  options={FAIR_HAND_MODE_OPTIONS}
                  popupMatchSelectWidth={false}
                  value={fairHandMode}
                  onChange={(mode: FairHandMode) =>
                    socket?.emit("set_fair_hand_mode", { mode })
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
              <AIModeControl
                disabled={!canChangeAI}
                mode={currentAIMode}
                onSelectMode={selectAIMode}
              />
              <SettingRow
                title="Simulation mode"
                control={
                  <Switch
                    checked={state.roomSettings.simulationMode ?? false}
                    onChange={(v) =>
                      socket?.emit("set_ai_level", {
                        speed: v ? SIMULATION_AI_LEVEL : currentAISpeed,
                      })
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
          <SettingsSection title="Controls">
            <DragInputModeControl
              capabilities={dragInputCapabilities}
              mode={settings.dragInputMode}
              onSelectMode={settings.setDragInputMode}
              resolvedMode={resolvedDragInputMode}
            />
          </SettingsSection>
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

function DragInputModeControl({
  capabilities,
  mode,
  onSelectMode,
  resolvedMode,
}: {
  capabilities: DragInputCapabilities;
  mode: DragInputModePreference;
  onSelectMode: (mode: DragInputModePreference) => void;
  resolvedMode: ResolvedDragInputMode;
}) {
  return (
    <SettingRow
      title={
        <Flex align="center" gap={6}>
          <span>Drag input</span>
          <InfoTooltipIcon
            aria-label="Current drag input mode"
            placement="bottomLeft"
            tooltipClassName={styles.dragInputTooltipOverlay}
          >
            <DragInputModeTooltip
              capabilities={capabilities}
              mode={mode}
              resolvedMode={resolvedMode}
            />
          </InfoTooltipIcon>
        </Flex>
      }
      control={
        <Select
          className={styles.dragInputModeSelect}
          options={DRAG_INPUT_MODE_OPTIONS}
          popupMatchSelectWidth={false}
          value={mode}
          onChange={(value: DragInputModePreference) => onSelectMode(value)}
        />
      }
    />
  );
}

function DragInputModeTooltip({
  capabilities,
  mode,
  resolvedMode,
}: {
  capabilities: DragInputCapabilities;
  mode: DragInputModePreference;
  resolvedMode: ResolvedDragInputMode;
}) {
  return (
    <div className={styles.dragInputTooltip}>
      <p>
        <strong>Detected</strong>
        <span>{getDetectedDragInputSummary(capabilities)}</span>
      </p>
      <p>
        <strong>Using</strong>
        <span>{getResolvedDragInputModeSummary(resolvedMode)}</span>
      </p>
      <p>
        <strong>{mode === "auto" ? "Auto" : "Override"}</strong>
        <span>
          {mode === "auto"
            ? getAutoDragInputModeDescription(capabilities, resolvedMode)
            : `${getDragInputModeSummary(mode)} is selected manually.`}
        </span>
      </p>
    </div>
  );
}

function FairHandModeTooltip({ board }: { board: BoardState | null }) {
  const luckRows = getFairHandLuckRows(board);

  return (
    <div className={styles.fairHandTooltip}>
      <div className={styles.fairHandTooltipModes}>
        <p>
          <strong>Off</strong>
          <span>Fresh random hands every round.</span>
        </p>
        <p>
          <strong>Take turns with hands</strong>
          <span>
            Reuses one shuffled set and rotates those hands between players.
          </span>
        </p>
        <p>
          <strong>Best hand to least lucky</strong>
          <span>
            Shuffles fresh hands, predicts each hand with the same balanced
            strategy, then gives stronger hands to lower luck totals.
          </span>
        </p>
      </div>
      <div className={styles.fairHandLuck}>
        <strong>Luck so far (predicted score)</strong>
        {luckRows.length > 0 ? (
          <>
            <ul>
              {luckRows.map((row) => (
                <li key={row.playerIndex}>
                  <span>{row.name}</span>
                  <span>{formatFairHandLuck(row.score)}</span>
                </li>
              ))}
            </ul>
            <span className={styles.fairHandLuckNote}>
              Higher means luckier hands so far.
            </span>
          </>
        ) : (
          <p>Predicted scores appear after this mode deals hands.</p>
        )}
      </div>
    </div>
  );
}

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
            disabled={customSpeed <= MIN_AI_LEVEL}
            aria-label="Decrease custom AI level"
            onClick={() => onSetCustomSpeed(customSpeed - 1)}
          >
            -
          </button>
          <label className={styles.customAIInputLabel}>
            <span>Speed</span>
            <input
              type="number"
              min={MIN_AI_LEVEL}
              max={MAX_AI_LEVEL}
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
            disabled={customSpeed >= MAX_AI_LEVEL}
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

function getFairHandLuckRows(
  board: BoardState | null
): { playerIndex: number; name: string; score: number }[] {
  if (!board) {
    return [];
  }

  return board.players
    .map((player, playerIndex) => ({
      playerIndex,
      player,
    }))
    .filter(({ player }) => !player.disconnected)
    .map(({ player, playerIndex }) => ({
      playerIndex,
      name: getFairHandPlayerName(player),
      score: player.fairHandExpectedScoreTotal,
    }))
    .filter(
      (row): row is { playerIndex: number; name: string; score: number } =>
        typeof row.score === "number" && Number.isFinite(row.score)
    );
}

function getFairHandPlayerName(player: PlayerState): string {
  const name = player.name.trim();
  return name.length > 0 ? name : "Player";
}

function formatFairHandLuck(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}`;
}

function AIModeControl({
  disabled,
  mode,
  onSelectMode,
}: {
  disabled: boolean;
  mode: AIMode;
  onSelectMode: (mode: AIMode) => void;
}) {
  return (
    <div className={styles.aiModeBlock}>
      <div className={styles.sliderHeader}>
        <span>Type</span>
        <strong>{getAIModeSummary(mode)}</strong>
      </div>
      <div
        className={styles.aiModeControl}
        role="group"
        aria-label="AI type"
      >
        {AI_MODE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={mode === option.key}
            disabled={disabled}
            onClick={() => onSelectMode(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
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
    AI_DIFFICULTY_PRESETS.find((preset) => preset.level === speed)?.key ??
    "custom"
  );
}

function normalizeCustomAISpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    return DEFAULT_AI_LEVEL;
  }
  return normalizeAILevel(speed);
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

function getAIModeSummary(mode: AIMode): string {
  return AI_MODE_OPTIONS.find((option) => option.key === mode)?.label ?? "Fixed AIs";
}

function getDetectedDragInputSummary(
  capabilities: DragInputCapabilities
): string {
  if (hasHybridDragInputCapability(capabilities)) {
    return "Touchscreen + mouse";
  }
  if (capabilities.hasTouch) {
    return "Touch";
  }
  if (capabilities.hasFinePointer || capabilities.hasHover) {
    return "Mouse";
  }
  return "Mouse";
}

function getDragInputModeSummary(mode: DragInputModePreference): string {
  return (
    DRAG_INPUT_MODE_OPTIONS.find((option) => option.value === mode)?.label ??
    "Auto"
  );
}

function getAutoDragInputModeDescription(
  capabilities: DragInputCapabilities,
  resolvedMode: ResolvedDragInputMode
): string {
  if (hasHybridDragInputCapability(capabilities)) {
    return resolvedMode === "mouse"
      ? "Mouse is used in Auto. Select Touch for touchscreen dragging."
      : "Touch is used in Auto. Select Mouse for mouse dragging.";
  }
  return capabilities.hasTouch
    ? "Touch is used in Auto."
    : "Mouse is used in Auto.";
}

function getResolvedDragInputModeSummary(
  mode: ResolvedDragInputMode
): string {
  return getDragInputModeSummary(mode);
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
