import {
  ROUND_START_GO_DURATION_MS,
  isRoundStartPending,
  type BoardState,
  type CardState,
  type CursorLocation,
  type PlayerState,
} from "../shared/GameUtils";
import type SocketState from "./SocketState";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { DndProvider } from "react-dnd";
import DragReporter from "./DragReporter";
import { type Move } from "../shared/MoveHandler";
import PlayerArea from "./PlayerArea";
import PauseOverlay from "./PauseOverlay";
import ScoresTable from "./ScoresTable";
import { TouchBackend } from "react-dnd-touch-backend";
import VictoryOverlay from "./VictoryOverlay";
import isTouchDevice from "./isTouchDevice";
import styles from "./Board.module.css";
import BorderOutlined from "@ant-design/icons/BorderOutlined";
import CheckSquareOutlined from "@ant-design/icons/CheckSquareOutlined";

import { untracked } from "mobx";
import { observer } from "mobx-react-lite";
import CardsLayer from "./CardsLayer";
import HandsLayer from "./HandsLayer";
import HandPlatesLayer from "./HandPlatesLayer";
import FieldStackDragTargets from "./FieldStackDragTargets";
import ActivePlayerStackTargets from "./ActivePlayerStackTargets";
import MobileDragPreviewLayer from "./MobileDragPreviewLayer";
import InfoTooltipIcon from "./InfoTooltipIcon";
import ReactionBubbles from "./ReactionBubbles";
import RoomShare from "./RoomShare";
import { useClientContext } from "./ClientContext";
import { Button, Modal } from "antd";
import {
  BoardLayoutProvider,
  FIELD_LEFT,
  FIELD_SIZE,
  FIELD_TOP,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  useBoardLayout,
  useResponsiveBoardLayout,
} from "./BoardLayout";
import { getPlayerLocation } from "../shared/CardLocations";
type Props = {
  executeMove: (move: Move) => void;
  onOpenRoomSettings: () => void;
  onUpdateHand: (location: CursorLocation) => void;
  isLeftHandedLayout: boolean;
  easyReadCards: boolean;
  roomId?: string | null;
  zoom: number;
};

const DESKTOP_DND_BACKEND_OPTIONS = {
  enableMouseEvents: true,
  enableTouchEvents: false,
};

function getEstimatedServerTimeUntracked(state: SocketState): number {
  return untracked(() => state.getEstimatedServerTime());
}

function getNextRoundStartNoticeUpdateDelay(
  noticeStartsAt: number,
  serverNow: number
): number | null {
  const visibleUntil = noticeStartsAt + ROUND_START_GO_DURATION_MS;
  if (serverNow >= visibleUntil) {
    return null;
  }

  if (serverNow >= noticeStartsAt) {
    return visibleUntil - serverNow;
  }

  const secondsUntilStart = Math.ceil((noticeStartsAt - serverNow) / 1000);
  const displayedSeconds = Math.min(3, Math.max(1, secondsUntilStart));
  const nextLabelAt =
    displayedSeconds > 1
      ? noticeStartsAt - (displayedSeconds - 1) * 1000
      : noticeStartsAt;
  return Math.max(16, nextLabelAt - serverNow);
}

function useIsBoardAcceptingMoves(
  state: SocketState,
  board: BoardState
): boolean {
  const [, requestBoardAcceptingMovesCheck] = useState(0);
  const estimatedServerTime = getEstimatedServerTimeUntracked(state);
  const isAcceptingMoves =
    board.isActive &&
    !board.isPaused &&
    !isRoundStartPending(board, estimatedServerTime) &&
    !state.isGameOver;
  const roundStartsAt = board.roundStartsAt ?? null;
  const nextCheckAt =
    board.isActive &&
    !board.isPaused &&
    roundStartsAt != null &&
    estimatedServerTime < roundStartsAt
      ? roundStartsAt
      : null;

  useEffect(() => {
    if (nextCheckAt == null) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => requestBoardAcceptingMovesCheck((check) => check + 1),
      Math.max(0, nextCheckAt - getEstimatedServerTimeUntracked(state))
    );
    return () => window.clearTimeout(timeoutId);
  }, [nextCheckAt, state]);

  return isAcceptingMoves;
}

export default observer(function Board({
  executeMove,
  easyReadCards,
  isLeftHandedLayout,
  onOpenRoomSettings,
  onUpdateHand,
  roomId,
  zoom,
}: Props): JSX.Element | null {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const activePlayerIndex = state.getActivePlayerIndex();
  const activePlayer =
    activePlayerIndex >= 0 ? board.players[activePlayerIndex] : undefined;
  const isAcceptingMoves = useIsBoardAcceptingMoves(state, board);
  const canInteractWithCards =
    activePlayer != null &&
    activePlayer.isSpectating !== true &&
    isAcceptingMoves;
  const [focusedPlayerIndex, setFocusedPlayerIndex] = useState<number | null>(
    null
  );
  const [useTouch, setUseTouch] = useState<boolean | null>(null);
  const boardRootRef = useRef<HTMLDivElement | null>(null);
  const { layout, ref } = useResponsiveBoardLayout({
    activePlayerIndex,
    board,
    focusedPlayerIndex,
    isLeftHanded: isLeftHandedLayout,
    isTouchDevice: useTouch === true,
    zoom,
  });

  useEffect(() => {
    setUseTouch(isTouchDevice());
  }, []);
  useEffect(() => {
    setFocusedPlayerIndex((current) =>
      current != null &&
      current >= 0 &&
      current < board.players.length &&
      current !== activePlayerIndex
        ? current
        : null
    );
  }, [activePlayerIndex, board.players.length]);
  const togglePlayerFocus = useCallback(
    (playerIndex: number) => {
      setFocusedPlayerIndex((current) =>
        current === playerIndex || playerIndex === activePlayerIndex
          ? null
          : playerIndex
      );
    },
    [activePlayerIndex]
  );

  // TODO: Make this tracked separately
  const onUpdateDragHover = onUpdateHand;

  const [grabbedItem, setGrabbedItem] = useState<CardState | null>(null);
  useEffect(() => {
    if (!canInteractWithCards && grabbedItem != null) {
      socket?.emit("update_hand", { item: null });
      setGrabbedItem(null);
    }
  }, [canInteractWithCards, grabbedItem, socket]);
  const handleUpdateGrabbedItem = useCallback(
    (item: CardState | null, items: CardState[] | null) => {
      const nextItem = canInteractWithCards ? item : null;
      const nextItems = canInteractWithCards ? items : null;
      socket?.emit("update_hand", { item: nextItem, items: nextItems });
      setGrabbedItem(nextItem);
    },
    [canInteractWithCards, socket]
  );
  if (useTouch == null) {
    // Loading touch type still. Ideally we'd render still here, but
    // DnDProvider seems to struggle with backend changing
    return null;
  }
  return (
    <DndProvider
      backend={TouchBackend}
      options={useTouch ? undefined : DESKTOP_DND_BACKEND_OPTIONS}
      key={useTouch ? "touch" : "mouse"}
    >
      <DragReporter
        boardRootRef={boardRootRef}
        onUpdateGrabbedItem={handleUpdateGrabbedItem}
      />
      <MobileDragPreviewLayer enabled easyReadCards={easyReadCards} />
      <div
        className={styles.root}
        data-card-readability={easyReadCards ? "easy" : "standard"}
        data-layout-mode={layout.mode}
        ref={boardRootRef}
      >
        <BoardLayoutProvider value={layout}>
          <div className={styles.rootInside} ref={ref}>
            <PileSection
              onOpenRoomSettings={onOpenRoomSettings}
              roomId={roomId}
            />
            <ScoresTableTabOverlay board={board} />
            <HandPlatesLayer />
            {canInteractWithCards ? (
              <>
                <ActivePlayerStackTargets
                  executeMove={executeMove}
                  onUpdateDragHover={onUpdateDragHover}
                />
                <FieldStackDragTargets
                  state={state}
                  grabbedItem={grabbedItem}
                  onUpdateDragHover={onUpdateDragHover}
                  executeMove={executeMove}
                />
              </>
            ) : null}
            <CardsLayer
              canInteract={canInteractWithCards}
              executeMove={executeMove}
            />
            <RoundStartOverlay board={board} state={state} />
            {board.players.map((p, i) => (
              <PlayerArea player={p} playerIndex={i} key={p.socketId ?? i} />
            ))}
            <PlayerZoomTargets onTogglePlayer={togglePlayerFocus} />
            <HandsLayer />
            <ReactionBubbles />
            <PauseOverlay />
            <VictoryOverlay />
          </div>
        </BoardLayoutProvider>
      </div>
    </DndProvider>
  );
});

function RoundStartOverlay({
  board,
  state,
}: {
  board: BoardState;
  state: SocketState;
}): JSX.Element | null {
  const layout = useBoardLayout();
  const stateRef = useRef(state);
  stateRef.current = state;
  const getOverlayServerTime = useCallback(
    () => getEstimatedServerTimeUntracked(stateRef.current),
    []
  );
  const wasRoundActiveRef = useRef(board.isActive);
  const [noticeStartsAt, setNoticeStartsAt] = useState<number | null>(
    board.roundStartsAt ?? null
  );
  const [noticeServerNow, setNoticeServerNow] = useState(getOverlayServerTime);
  const fieldArea = { type: "field" } as const;
  const [left, top] = layout.mapPoint(
    [FIELD_LEFT + FIELD_SIZE / 2, FIELD_TOP + FIELD_SIZE / 2],
    fieldArea
  );
  const scale = layout.getScale(fieldArea);

  useEffect(() => {
    const wasRoundActive = wasRoundActiveRef.current;
    wasRoundActiveRef.current = board.isActive;

    if (board.roundStartsAt != null) {
      setNoticeStartsAt(board.roundStartsAt);
      return;
    }

    if (!board.isActive) {
      setNoticeStartsAt(null);
      return;
    }

    if (!wasRoundActive) {
      const nextServerNow = getOverlayServerTime();
      setNoticeServerNow(nextServerNow);
      setNoticeStartsAt(nextServerNow);
    }
  }, [board.isActive, board.roundStartsAt, getOverlayServerTime]);

  useEffect(() => {
    if (noticeStartsAt == null) {
      return;
    }

    let timeoutId: number | undefined;
    const tick = () => {
      const nextServerNow = getOverlayServerTime();
      setNoticeServerNow(nextServerNow);
      const delay = getNextRoundStartNoticeUpdateDelay(
        noticeStartsAt,
        nextServerNow
      );
      if (delay == null) {
        setNoticeStartsAt(null);
        return;
      }

      timeoutId = window.setTimeout(tick, delay);
    };

    tick();
    return () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [noticeStartsAt, getOverlayServerTime]);

  if (noticeStartsAt == null) {
    return null;
  }

  const timeUntilStart = noticeStartsAt - noticeServerNow;
  const isCountingDown = timeUntilStart > 0;
  const isGoVisible =
    noticeServerNow < noticeStartsAt + ROUND_START_GO_DURATION_MS;
  if (!isCountingDown && !isGoVisible) {
    return null;
  }

  const label = isCountingDown
    ? String(Math.min(3, Math.max(1, Math.ceil(timeUntilStart / 1000))))
    : "Go!";
  const phase = isCountingDown ? "count" : "go";

  return (
    <div
      aria-hidden="true"
      className={styles.roundStartOverlay}
      style={
        {
          "--round-start-scale": scale,
          left,
          top,
        } as CSSProperties
      }
    >
      <span
        className={styles.roundStartText}
        data-phase={phase}
        key={`${noticeStartsAt}:${label}`}
      >
        {label}
      </span>
    </div>
  );
}

const PLAYER_ZOOM_HIT_LEFT = -24;
const PLAYER_ZOOM_HIT_TOP = 0;
const PLAYER_ZOOM_HIT_WIDTH = PLAYER_WIDTH + 56;
const PLAYER_ZOOM_HIT_HEIGHT = PLAYER_HEIGHT;

const PlayerZoomTargets = observer(function PlayerZoomTargets({
  onTogglePlayer,
}: {
  onTogglePlayer: (playerIndex: number) => void;
}) {
  const { state } = useClientContext();
  const board = state.board;
  const layout = useBoardLayout();
  const activePlayerIndex = state.getActivePlayerIndex();
  const handledPointerRef = useRef(false);

  if (!board || layout.mode !== "compact" || activePlayerIndex < 0) {
    return null;
  }

  return (
    <>
      {board.players.map((player, playerIndex) => {
        const isActivePlayer = playerIndex === activePlayerIndex;
        const isFocusedPlayer = layout.focusedPlayerIndex === playerIndex;
        if (
          (layout.focusedPlayerIndex == null && isActivePlayer) ||
          (layout.focusedPlayerIndex != null && !isFocusedPlayer)
        ) {
          return null;
        }

        const [, playerTop] = getPlayerLocation(
          playerIndex,
          activePlayerIndex
        );
        const playerArea = { type: "player", playerIndex } as const;
        const scale = layout.getScale(playerArea);
        const [left, top] = layout.mapPoint(
          [PLAYER_ZOOM_HIT_LEFT, playerTop + PLAYER_ZOOM_HIT_TOP],
          playerArea
        );
        const label =
          isFocusedPlayer || isActivePlayer
            ? "Show all players"
            : `Zoom ${player.name}'s board`;

        return (
          <button
            aria-label={label}
            className={styles.playerZoomTarget}
            key={player.socketId ?? playerIndex}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handledPointerRef.current = true;
              onTogglePlayer(playerIndex);
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (handledPointerRef.current) {
                handledPointerRef.current = false;
                return;
              }
              onTogglePlayer(playerIndex);
            }}
            style={
              {
                "--player-color": player.color,
                transform: `translate(${left}px, ${top}px) scale(${scale})`,
                width: PLAYER_ZOOM_HIT_WIDTH,
                height: PLAYER_ZOOM_HIT_HEIGHT,
              } as CSSProperties
            }
            title={label}
            type="button"
          />
        );
      })}
    </>
  );
});

const PileSection = observer(function PileSection({
  onOpenRoomSettings,
  roomId,
}: {
  onOpenRoomSettings: () => void;
  roomId?: string | null;
}) {
  const { state, socket } = useClientContext();
  const board = state.board!;
  const layout = useBoardLayout();
  const fieldArea = { type: "field" } as const;
  const [left, top] = layout.mapPoint([FIELD_LEFT, FIELD_TOP], fieldArea);
  const scale = layout.getScale(fieldArea);
  const isHost = state.getIsHost();
  const canManageRound = !board.isActive && isHost;
  const canDealHands = canManageRound && !board.isDealt && board.pouncer == null;
  const canStartGame = canManageRound && board.isDealt && board.pouncer == null;
  const isSimulationMode = state.roomSettings.simulationMode ?? false;
  const waitingDealInCount = getWaitingForDealCount(board, isSimulationMode);
  const canDealRemainingPlayers = canStartGame && waitingDealInCount > 0;
  const activePlayerIndex = state.getActivePlayerIndex();
  const activePlayerWaitingForDeal =
    activePlayerIndex >= 0 &&
    isPlayerWaitingForDeal(board.players[activePlayerIndex], isSimulationMode);
  const waitingForHostMessage =
    !isHost && !board.isActive && board.pouncer == null
      ? board.isDealt
        ? activePlayerWaitingForDeal
          ? "Waiting to be dealt in"
          : "Waiting for host to start"
        : "Waiting for host to deal"
      : null;
  const isWaitingForHost = waitingForHostMessage != null;
  const showStartPanel = canDealHands || canStartGame || isWaitingForHost;
  const startPanelClassName = isWaitingForHost
    ? `${styles.startPanel} ${styles.startPanelWaiting}`
    : canStartGame
    ? `${styles.startPanel} ${styles.startPanelReady}`
    : styles.startPanel;
  const roomCode =
    roomId != null && roomId.toLowerCase() !== "offline" ? roomId : "Offline";
  const roomLabel = roomCode === "Offline" ? "Table" : "Room code";
  const isOfflineRoom = roomCode === "Offline";
  const aiSpeed = state.roomSettings.aiSpeed ?? 3;
  const selectAIDifficulty = (speed: number) => {
    socket?.emit("set_ai_level", { speed });
  };
  const handleDealHands = () => {
    confirmRemovingInactivePlayers({
      action: "Dealing",
      disconnectedPlayers: getDisconnectedPlayers(board),
      okText: "Deal",
      title: "Deal without inactive players?",
      onConfirm: () => {
        socket?.emit("deal_hands");
      },
    });
  };
  const handleStartGame = () => {
    confirmRemovingInactivePlayers({
      action: "Starting",
      disconnectedPlayers: getDisconnectedPlayers(board),
      okText: "Start game",
      title: "Start without inactive players?",
      onConfirm: () => {
        socket?.emit("start_game");
      },
    });
  };

  return (
    <div
      className={styles.pileSection}
      data-center-drag-area="true"
      style={{
        width: FIELD_SIZE,
        height: FIELD_SIZE,
        transform: `translate(${left}px, ${top}px) scale(${scale})`,
      }}
    >
      <div className={styles.pileSectionPattern} />
      {showStartPanel && (
        <div className={startPanelClassName}>
          <div className={styles.startPanelHeader}>
            {isWaitingForHost ? (
              <>
                <span>Game state</span>
                <strong>{waitingForHostMessage}</strong>
              </>
            ) : canStartGame ? (
              <>
                <span>Ready</span>
                <strong>Hands dealt</strong>
              </>
            ) : (
              <>
                <span>{roomLabel}</span>
                <strong>{roomCode}</strong>
              </>
            )}
          </div>
          {isWaitingForHost ? (
            <RoundReadyControl
              activePlayerIndex={activePlayerIndex}
              board={board}
              onToggleReady={(ready) =>
                socket?.emit("set_round_ready", { ready })
              }
            />
          ) : canStartGame ? (
            <>
              <RoundReadyControl
                activePlayerIndex={activePlayerIndex}
                board={board}
                onToggleReady={(ready) =>
                  socket?.emit("set_round_ready", { ready })
                }
              />
              <div
                className={`${styles.startActions} ${
                  canDealRemainingPlayers
                    ? styles.startActionsStacked
                    : styles.startActionsSingle
                }`}
              >
                {canDealRemainingPlayers ? (
                  <Button
                    className={styles.roomSettingsButton}
                    onClick={() => socket?.emit("deal_remaining_players")}
                  >
                    Deal in remaining players
                  </Button>
                ) : null}
                <Button
                  className={styles.dealButton}
                  onClick={handleStartGame}
                >
                  Start game
                </Button>
              </div>
            </>
          ) : (
            !isWaitingForHost && (
              <>
                {isOfflineRoom ? (
                  <div className={styles.aiDifficultyControl}>
                    <button
                      aria-pressed={aiSpeed === 3}
                      onClick={() => selectAIDifficulty(3)}
                      type="button"
                    >
                      Easy
                    </button>
                    <button
                      aria-pressed={aiSpeed === 4}
                      onClick={() => selectAIDifficulty(4)}
                      type="button"
                    >
                      Medium
                    </button>
                    <button
                      aria-pressed={aiSpeed === 5}
                      onClick={() => selectAIDifficulty(5)}
                      type="button"
                    >
                      Hard
                    </button>
                  </div>
                ) : null}
                {!isOfflineRoom ? <RoomShare roomId={roomCode} /> : null}
                <div className={styles.startActions}>
                  <Button
                    className={styles.roomSettingsButton}
                    onClick={onOpenRoomSettings}
                  >
                    Room settings
                  </Button>
                  <Button
                    className={styles.dealButton}
                    onClick={handleDealHands}
                  >
                    Deal
                  </Button>
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
});

const RoundReadyControl = observer(function RoundReadyControl({
  activePlayerIndex,
  board,
  onToggleReady,
}: {
  activePlayerIndex: number;
  board: BoardState;
  onToggleReady: (ready: boolean) => void;
}): JSX.Element | null {
  const readyPlayers = getRoundReadyPlayerEntries(board);
  const activeEntry = readyPlayers.find(
    (entry) => entry.playerIndex === activePlayerIndex
  );
  if (readyPlayers.length === 0 || !activeEntry) {
    return null;
  }

  const activePlayerReady = activeEntry?.player.isReadyForRound === true;
  const readyPlayerCount = readyPlayers.filter(
    (entry) => entry.player.isReadyForRound === true
  );
  const playerLabel = readyPlayers.length === 1 ? "player" : "players";
  const ReadyIcon = activePlayerReady ? CheckSquareOutlined : BorderOutlined;

  return (
    <div className={styles.roundReadyControl}>
      <div className={styles.roundReadySummary}>
        <span>
          {readyPlayerCount.length}/{readyPlayers.length} {playerLabel} ready
        </span>
        <InfoTooltipIcon
          aria-label="Player readiness details"
          className={styles.roundReadyInfo}
        >
          <RoundReadyTooltip players={readyPlayers} />
        </InfoTooltipIcon>
      </div>
      <Button
        aria-pressed={activePlayerReady}
        className={styles.readyButton}
        data-ready={activePlayerReady ? "true" : "false"}
        onClick={() => onToggleReady(!activePlayerReady)}
      >
        <ReadyIcon
          aria-hidden="true"
          className={styles.readyButtonIcon}
          rev={undefined}
        />
        Ready for round
      </Button>
    </div>
  );
});

function RoundReadyTooltip({
  players,
}: {
  players: RoundReadyPlayerEntry[];
}): JSX.Element {
  return (
    <div className={styles.roundReadyTooltip}>
      <div className={styles.roundReadyTooltipText}>
        Once all players mark ready, the round will automatically start.
      </div>
      <ul className={styles.roundReadyList} aria-label="Round readiness">
        {players.map(({ player, playerIndex }) => (
          <li className={styles.roundReadyPlayer} key={playerIndex}>
            <span
              aria-checked={player.isReadyForRound === true}
              className={styles.roundReadyCheckbox}
              data-ready={player.isReadyForRound === true ? "true" : "false"}
              role="checkbox"
            />
            <span className={styles.roundReadyName}>{player.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RoundReadyPlayerEntry = {
  player: PlayerState;
  playerIndex: number;
};

function getRoundReadyPlayerEntries(board: BoardState): RoundReadyPlayerEntry[] {
  if (!isRoundReadyAvailable(board)) {
    return [];
  }

  const players = board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(
      ({ player }) =>
        !player.disconnected &&
        player.socketId != null &&
        player.isSpectating !== true &&
        player.isWaitingForDeal !== true
    );
  return players.length >= 2 ? players : [];
}

function isRoundReadyAvailable(board: BoardState): boolean {
  return board.isDealt && !board.isActive && board.pouncer == null;
}

function getWaitingForDealCount(
  board: BoardState,
  isSimulationMode: boolean
): number {
  return board.players.filter(
    (player) =>
      !player.disconnected &&
      isPlayerWaitingForDeal(player, isSimulationMode) &&
      isPlayerUndealt(player)
  ).length;
}

function confirmRemovingInactivePlayers({
  action,
  disconnectedPlayers,
  okText,
  onConfirm,
  title,
}: {
  action: string;
  disconnectedPlayers: PlayerState[];
  okText: string;
  onConfirm: () => void;
  title: string;
}): void {
  if (disconnectedPlayers.length === 0) {
    onConfirm();
    return;
  }

  Modal.confirm({
    title,
    content: getInactivePlayersConfirmationMessage(
      action,
      disconnectedPlayers
    ),
    okText,
    cancelText: "Cancel",
    onOk: () => {
      onConfirm();
    },
  });
}

function getDisconnectedPlayers(board: BoardState): PlayerState[] {
  return board.players.filter((player) => player.disconnected);
}

function getInactivePlayersConfirmationMessage(
  action: string,
  disconnectedPlayers: PlayerState[]
): string {
  const playerCount = disconnectedPlayers.length;
  const playerLabel = playerCount === 1 ? "player" : "players";
  const names = disconnectedPlayers
    .map((player) => player.name || "Unnamed player")
    .join(", ");

  return `${action} will remove ${playerCount} inactive ${playerLabel} (${names}).`;
}

function isPlayerWaitingForDeal(
  player: PlayerState | undefined,
  isSimulationMode: boolean
): boolean {
  if (!player) {
    return false;
  }

  return (
    player.isWaitingForDeal === true ||
    (player.isSpectating === true && !isSimulationMode)
  );
}

function isPlayerUndealt(player: PlayerState): boolean {
  return (
    player.deck.length >= 17 &&
    player.flippedDeck.length === 0 &&
    player.pounceDeck.length === 0 &&
    player.stacks.every((stack) => stack.length === 0)
  );
}

function ScoresTableTabOverlay({ board }: { board: BoardState }) {
  const [showScores, setShowScores] = useState(false);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setShowScores(true);
        e.preventDefault();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setShowScores(false);
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, []);
  if (!showScores) {
    return null;
  }
  return (
    <div className={styles.scores}>
      <ScoresTable board={board} bufferRows={10} />
    </div>
  );
}
