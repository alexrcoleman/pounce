import type {
  BoardState,
  CardState,
  CursorLocation,
  PlayerState,
} from "../shared/GameUtils";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { DndProvider } from "react-dnd";
import DragReporter from "./DragReporter";
import { HTML5Backend } from "react-dnd-html5-backend";
import { isBoardAcceptingMoves, type Move } from "../shared/MoveHandler";
import PlayerArea from "./PlayerArea";
import PauseOverlay from "./PauseOverlay";
import ScoresTable from "./ScoresTable";
import { TouchBackend } from "react-dnd-touch-backend";
import VictoryOverlay from "./VictoryOverlay";
import isTouchDevice from "./isTouchDevice";
import styles from "./Board.module.css";

import { observer } from "mobx-react-lite";
import CardsLayer from "./CardsLayer";
import HandsLayer from "./HandsLayer";
import HandPlatesLayer from "./HandPlatesLayer";
import FieldStackDragTargets from "./FieldStackDragTargets";
import ActivePlayerStackTargets from "./ActivePlayerStackTargets";
import MobileDragPreviewLayer from "./MobileDragPreviewLayer";
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
  const canInteractWithCards =
    activePlayer != null &&
    activePlayer.isSpectating !== true &&
    isBoardAcceptingMoves(board);
  const [focusedPlayerIndex, setFocusedPlayerIndex] = useState<number | null>(
    null
  );
  const [useTouch, setUseTouch] = useState<boolean | null>(null);
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
      backend={useTouch ? TouchBackend : HTML5Backend}
      key={String(useTouch)}
    >
      <DragReporter onUpdateGrabbedItem={handleUpdateGrabbedItem} />
      <MobileDragPreviewLayer enabled easyReadCards={easyReadCards} />
      <div
        className={styles.root}
        data-card-readability={easyReadCards ? "easy" : "standard"}
        data-layout-mode={layout.mode}
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
            <RoundStartOverlay isRoundActive={board.isActive} />
            {board.players.map((p, i) => (
              <PlayerArea player={p} playerIndex={i} key={p.socketId ?? i} />
            ))}
            <PlayerZoomTargets onTogglePlayer={togglePlayerFocus} />
            <HandsLayer />
            <PauseOverlay />
            <VictoryOverlay />
          </div>
        </BoardLayoutProvider>
      </div>
    </DndProvider>
  );
});

const ROUND_START_NOTICE_DURATION_MS = 4_000;

function RoundStartOverlay({
  isRoundActive,
}: {
  isRoundActive: boolean;
}): JSX.Element | null {
  const layout = useBoardLayout();
  const wasRoundActiveRef = useRef(isRoundActive);
  const [noticeKey, setNoticeKey] = useState(0);
  const [isNoticeVisible, setNoticeVisible] = useState(false);
  const fieldArea = { type: "field" } as const;
  const [left, top] = layout.mapPoint(
    [FIELD_LEFT + FIELD_SIZE / 2, FIELD_TOP + FIELD_SIZE / 2],
    fieldArea
  );
  const scale = layout.getScale(fieldArea);

  useEffect(() => {
    const wasRoundActive = wasRoundActiveRef.current;
    wasRoundActiveRef.current = isRoundActive;

    if (!isRoundActive) {
      setNoticeVisible(false);
      return;
    }

    if (!wasRoundActive) {
      setNoticeKey((current) => current + 1);
      setNoticeVisible(true);
    }
  }, [isRoundActive]);

  useEffect(() => {
    if (!isNoticeVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNoticeVisible(false);
    }, ROUND_START_NOTICE_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isNoticeVisible, noticeKey]);

  if (!isNoticeVisible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={styles.roundStartOverlay}
      key={noticeKey}
      style={
        {
          "--round-start-scale": scale,
          left,
          top,
        } as CSSProperties
      }
    >
      <span className={styles.roundStartText}>Go!</span>
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
  const handleStartGame = () => {
    const disconnectedPlayers = board.players.filter(
      (player) => player.disconnected
    );
    if (disconnectedPlayers.length === 0) {
      socket?.emit("start_game");
      return;
    }

    Modal.confirm({
      title: "Start without disconnected players?",
      content: getDisconnectedStartConfirmationMessage(disconnectedPlayers),
      okText: "Start game",
      cancelText: "Cancel",
      onOk: () => socket?.emit("start_game"),
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
          {!isWaitingForHost &&
            (canStartGame ? (
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
            ) : (
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
                    onClick={() => socket?.emit("deal_hands")}
                  >
                    Deal
                  </Button>
                </div>
              </>
            ))}
        </div>
      )}
    </div>
  );
});

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

function getDisconnectedStartConfirmationMessage(
  disconnectedPlayers: PlayerState[]
): string {
  const playerCount = disconnectedPlayers.length;
  const playerLabel = playerCount === 1 ? "player" : "players";
  const names = disconnectedPlayers
    .map((player) => player.name || "Unnamed player")
    .join(", ");

  return `Are you sure you want to start? This will remove ${playerCount} disconnected ${playerLabel} (${names}).`;
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
