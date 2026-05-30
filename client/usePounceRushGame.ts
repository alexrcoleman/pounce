import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ActionEnvelope } from "../shared/SocketTypes";
import type { BoardState, CursorState } from "../shared/GameUtils";
import { CardState, CursorLocation } from "../shared/GameUtils";
import type { GameSocket } from "./GameConnection";
import type { Move } from "../shared/MoveHandler";
import SocketState from "./SocketState";
import deepClone from "../shared/deepClone";
import { executeMove } from "../shared/MoveHandler";
import { runInAction } from "mobx";
import { useLocalObservable } from "mobx-react-lite";
import {
  PounceRushPuzzle,
  createPounceRushPuzzle,
  isExpectedPounceRushMove,
} from "../shared/PounceRush";

const POUNCE_RUSH_SOCKET_ID = "pounce-rush-player";
const POUNCE_RUSH_PLAYER_SESSION_ID = "pounce-rush-session";
const POUNCE_RUSH_DURATION_MS = 60_000;
const NEXT_PUZZLE_DELAY_MS = 260;

type RushStatus = "running" | "complete";

export default function usePounceRushGame(playerName: string) {
  const state = useLocalObservable(() => new SocketState());
  const [blockedAttemptCount, setBlockedAttemptCount] = useState(0);
  const [currentPuzzle, setCurrentPuzzle] =
    useState<PounceRushPuzzle | null>(null);
  const [puzzleNumber, setPuzzleNumber] = useState(0);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<RushStatus>("running");
  const [stepIndex, setStepIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(POUNCE_RUSH_DURATION_MS);
  const [isAdvancingPuzzle, setIsAdvancingPuzzle] = useState(false);
  const boardRef = useRef<BoardState | null>(null);
  const currentPuzzleRef = useRef<PounceRushPuzzle | null>(null);
  const handsRef = useRef<CursorState[]>([{}]);
  const isAdvancingPuzzleRef = useRef(false);
  const playerNameRef = useRef(playerName);
  const puzzleNumberRef = useRef(0);
  const revisionRef = useRef(0);
  const scoreRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const statusRef = useRef<RushStatus>("running");
  const stepIndexRef = useRef(0);
  const nextPuzzleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    playerNameRef.current = playerName;
    const board = boardRef.current;
    if (board?.players[0]) {
      board.players[0].name = playerName || "Player";
      emitBoardUpdate(state, board, revisionRef);
    }
  }, [playerName, state]);

  const clearNextPuzzleTimeout = useCallback(() => {
    if (nextPuzzleTimeoutRef.current != null) {
      window.clearTimeout(nextPuzzleTimeoutRef.current);
      nextPuzzleTimeoutRef.current = null;
    }
  }, []);

  const installPuzzle = useCallback(
    (nextPuzzleNumber: number) => {
      const puzzle = createPounceRushPuzzle({
        playerName: playerNameRef.current || "Player",
        playerSessionId: POUNCE_RUSH_PLAYER_SESSION_ID,
        puzzleNumber: nextPuzzleNumber,
        socketId: POUNCE_RUSH_SOCKET_ID,
      });

      boardRef.current = puzzle.board;
      currentPuzzleRef.current = puzzle;
      handsRef.current = [{}];
      stepIndexRef.current = 0;
      puzzleNumberRef.current = nextPuzzleNumber;
      setCurrentPuzzle(puzzle);
      setIsAdvancingPuzzle(false);
      setPuzzleNumber(nextPuzzleNumber);
      setStepIndex(0);
      isAdvancingPuzzleRef.current = false;
      emitBoardUpdate(state, puzzle.board, revisionRef);
      emitHandsUpdate(state, handsRef.current);
    },
    [state]
  );

  const blockAttempt = useCallback(() => {
    setBlockedAttemptCount((count) => count + 1);
  }, []);

  const completeCurrentPuzzle = useCallback(() => {
    if (isAdvancingPuzzleRef.current || statusRef.current !== "running") {
      return;
    }

    isAdvancingPuzzleRef.current = true;
    setIsAdvancingPuzzle(true);
    const nextScore = scoreRef.current + 1;
    scoreRef.current = nextScore;
    setScore(nextScore);
    clearNextPuzzleTimeout();
    nextPuzzleTimeoutRef.current = window.setTimeout(() => {
      nextPuzzleTimeoutRef.current = null;
      if (statusRef.current !== "running") {
        return;
      }

      const nextPuzzleNumber = puzzleNumberRef.current + 1;
      installPuzzle(nextPuzzleNumber);
    }, NEXT_PUZZLE_DELAY_MS);
  }, [clearNextPuzzleTimeout, installPuzzle]);

  const executeRushMove = useCallback(
    (move: Move) => {
      const board = boardRef.current;
      const puzzle = currentPuzzleRef.current;
      if (
        !board ||
        !puzzle ||
        statusRef.current !== "running" ||
        isAdvancingPuzzleRef.current
      ) {
        blockAttempt();
        return;
      }

      const expectedMove = puzzle.sequence[stepIndexRef.current];
      if (
        move.type === "cycle" ||
        move.type === "flip_deck" ||
        move.type === "move_field_stack" ||
        !isExpectedPounceRushMove(move, expectedMove)
      ) {
        blockAttempt();
        return;
      }

      const result = executeMove(board, 0, move);
      if (result == null) {
        blockAttempt();
        return;
      }

      emitBoardUpdate(state, board, revisionRef);
      const nextStepIndex = stepIndexRef.current + 1;
      stepIndexRef.current = nextStepIndex;
      setStepIndex(nextStepIndex);

      if (nextStepIndex >= puzzle.sequence.length) {
        completeCurrentPuzzle();
      }
    },
    [blockAttempt, completeCurrentPuzzle, state]
  );

  const socket = useMemo<GameSocket>(
    () => ({
      emit(event, ...args) {
        if (event === "update_hand") {
          const update = args[0] as {
            item?: CardState | null;
            items?: CardState[] | null;
            location?: CursorLocation | null;
          };
          const hand = handsRef.current[0] ?? {};
          if (update.location !== undefined) {
            hand.location = update.location ?? undefined;
          }
          if (update.item !== undefined) {
            hand.item = update.item ?? undefined;
            if (update.items === undefined) {
              hand.items = update.item ? [update.item] : undefined;
            }
          }
          if (update.items !== undefined) {
            hand.items = update.items ?? undefined;
          }
          handsRef.current[0] = hand;
          emitHandsUpdate(state, handsRef.current);
          return;
        }

        if (event === "move") {
          const envelope = args[0] as ActionEnvelope<Move>;
          const ack = args[1] as
            | ((args: {
                actionId: string;
                ok: boolean;
                reason?: string;
                revision: number;
              }) => void)
            | undefined;
          const beforeRevision = revisionRef.current;
          executeRushMove(envelope.payload);
          ack?.({
            actionId: envelope.actionId,
            ok: revisionRef.current !== beforeRevision,
            reason:
              revisionRef.current !== beforeRevision ? undefined : "Blocked",
            revision: revisionRef.current,
          });
        }
      },
      close() {
        clearNextPuzzleTimeout();
      },
    }),
    [clearNextPuzzleTimeout, executeRushMove, state]
  );

  const restart = useCallback(() => {
    clearNextPuzzleTimeout();
    scoreRef.current = 0;
    statusRef.current = "running";
    startTimeRef.current = Date.now();
    setBlockedAttemptCount(0);
    setRemainingMs(POUNCE_RUSH_DURATION_MS);
    setScore(0);
    setStatus("running");
    installPuzzle(0);
  }, [clearNextPuzzleTimeout, installPuzzle]);

  useEffect(() => {
    runInAction(() => {
      state.setPlayerSessionId(POUNCE_RUSH_PLAYER_SESSION_ID);
      state.onConnect(POUNCE_RUSH_SOCKET_ID);
    });
    installPuzzle(0);

    return () => {
      clearNextPuzzleTimeout();
      runInAction(() => state.onDisconnect());
    };
  }, [clearNextPuzzleTimeout, installPuzzle, state]);

  useEffect(() => {
    const updateTime = () => {
      if (statusRef.current !== "running") {
        return;
      }

      const remaining = Math.max(
        0,
        POUNCE_RUSH_DURATION_MS - (Date.now() - startTimeRef.current)
      );
      setRemainingMs(remaining);
      if (remaining <= 0) {
        clearNextPuzzleTimeout();
        statusRef.current = "complete";
        setStatus("complete");
        setIsAdvancingPuzzle(false);
        isAdvancingPuzzleRef.current = false;
      }
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 100);
    return () => window.clearInterval(intervalId);
  }, [clearNextPuzzleTimeout]);

  return {
    actions: {
      executeMove: executeRushMove,
      onBlockedMove: blockAttempt,
      onUpdateHand: (location: CursorLocation) => {
        socket.emit("update_hand", { location });
      },
      restart,
    },
    blockedAttemptCount,
    currentPuzzle,
    isAdvancingPuzzle,
    isConnected: state.isConnected,
    puzzleNumber,
    remainingMs,
    score,
    state,
    status,
    stepIndex,
    socket,
  };
}

function emitBoardUpdate(
  state: SocketState,
  board: BoardState,
  revisionRef: { current: number }
): void {
  revisionRef.current += 1;
  runInAction(() => {
    state.onUpdate({
      board: deepClone(board),
      settings: {
        aiSpeed: 3,
        fairHandRotation: false,
        simulationMode: false,
      },
      stuckPlayerIndices: [],
      time: Date.now(),
      revision: revisionRef.current,
      roundAnalysis: null,
    });
  });
}

function emitHandsUpdate(state: SocketState, hands: CursorState[]): void {
  runInAction(() => {
    state.updateHands(deepClone(hands));
  });
}
