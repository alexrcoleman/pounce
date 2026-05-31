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
  PounceRushMoveRejection,
  PounceRushPuzzle,
  PounceRushPuzzleSummary,
  createPounceRushPuzzle,
  createPounceRushRunSeed,
  getPounceRushMoveRejection,
  getPounceRushPuzzleSummary,
  isExpectedPounceRushMove,
} from "../shared/PounceRush";

const POUNCE_RUSH_SOCKET_ID = "pounce-rush-player";
const POUNCE_RUSH_PLAYER_SESSION_ID = "pounce-rush-session";
const POUNCE_RUSH_DURATION_MS = 60_000;
const NEXT_PUZZLE_DELAY_MS = 720;
const BOARD_ANIMATION_SUPPRESSION_MS = 90;

type RushStatus = "idle" | "running" | "complete";
type RushFeedback = PounceRushMoveRejection & {
  id: number;
  tone: "blocked" | "success";
};

export default function usePounceRushGame(playerName: string) {
  const initialSeedRef = useRef("");
  const initialPuzzleRef = useRef<PounceRushPuzzle | null>(null);
  if (initialPuzzleRef.current == null) {
    initialPuzzleRef.current = createPounceRushPuzzle({
      playerName: playerName || "Player",
      playerSessionId: POUNCE_RUSH_PLAYER_SESSION_ID,
      puzzleNumber: 0,
      seed: initialSeedRef.current,
      socketId: POUNCE_RUSH_SOCKET_ID,
    });
  }
  const initialPuzzle = initialPuzzleRef.current;
  const revisionRef = useRef(initialPuzzle ? 1 : 0);
  const handsRef = useRef<CursorState[]>([{}]);
  const state = useLocalObservable(() => {
    const nextState = new SocketState();
    if (initialPuzzle) {
      runInAction(() => {
        nextState.setPlayerSessionId(POUNCE_RUSH_PLAYER_SESSION_ID);
        nextState.onConnect(POUNCE_RUSH_SOCKET_ID);
      });
      applyBoardUpdate(nextState, initialPuzzle.board, revisionRef.current);
      applyHandsUpdate(nextState, handsRef.current);
    }
    return nextState;
  });
  const [currentPuzzle, setCurrentPuzzle] =
    useState<PounceRushPuzzle | null>(initialPuzzle);
  const [feedback, setFeedback] = useState<RushFeedback | null>(null);
  const [isAdvancingPuzzle, setIsAdvancingPuzzle] = useState(false);
  const [isBoardAnimationSuppressed, setIsBoardAnimationSuppressed] =
    useState(false);
  const [puzzleHistory, setPuzzleHistory] = useState<
    PounceRushPuzzleSummary[]
  >([]);
  const [puzzleNumber, setPuzzleNumber] = useState(0);
  const [reviewPuzzleNumber, setReviewPuzzleNumber] = useState<number | null>(0);
  const [score, setScore] = useState(0);
  const [seed, setSeedState] = useState(initialSeedRef.current);
  const [status, setStatus] = useState<RushStatus>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(POUNCE_RUSH_DURATION_MS);
  const animationSuppressionTimeoutRef = useRef<number | null>(null);
  const boardRef = useRef<BoardState | null>(initialPuzzle?.board ?? null);
  const currentPuzzleRef = useRef<PounceRushPuzzle | null>(initialPuzzle);
  const feedbackIdRef = useRef(0);
  const isAdvancingPuzzleRef = useRef(false);
  const nextPuzzleTimeoutRef = useRef<number | null>(null);
  const playerNameRef = useRef(playerName);
  const puzzleNumberRef = useRef(0);
  const scoreRef = useRef(0);
  const seedRef = useRef(initialSeedRef.current);
  const startTimeRef = useRef(Date.now());
  const statusRef = useRef<RushStatus>("idle");
  const stepIndexRef = useRef(0);

  const showFeedback = useCallback(
    (
      message: PounceRushMoveRejection,
      tone: RushFeedback["tone"] = "blocked"
    ) => {
      setFeedback({
        ...message,
        id: ++feedbackIdRef.current,
        tone,
      });
    },
    []
  );

  const clearNextPuzzleTimeout = useCallback(() => {
    if (nextPuzzleTimeoutRef.current != null) {
      window.clearTimeout(nextPuzzleTimeoutRef.current);
      nextPuzzleTimeoutRef.current = null;
    }
  }, []);

  const suppressBoardAnimations = useCallback(() => {
    if (animationSuppressionTimeoutRef.current != null) {
      window.clearTimeout(animationSuppressionTimeoutRef.current);
    }

    setIsBoardAnimationSuppressed(true);
    animationSuppressionTimeoutRef.current = window.setTimeout(() => {
      animationSuppressionTimeoutRef.current = null;
      setIsBoardAnimationSuppressed(false);
    }, BOARD_ANIMATION_SUPPRESSION_MS);
  }, []);

  const installPuzzle = useCallback(
    (
      nextPuzzleNumber: number,
      options: {
        record: boolean;
        seed?: string;
      }
    ) => {
      const nextSeed = options.seed ?? seedRef.current;
      const puzzle = createPounceRushPuzzle({
        playerName: playerNameRef.current || "Player",
        playerSessionId: POUNCE_RUSH_PLAYER_SESSION_ID,
        puzzleNumber: nextPuzzleNumber,
        seed: nextSeed,
        socketId: POUNCE_RUSH_SOCKET_ID,
      });

      suppressBoardAnimations();
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

      if (options.record) {
        const summary = getPounceRushPuzzleSummary(puzzle);
        setPuzzleHistory((current) =>
          current.some((entry) => entry.puzzleNumber === summary.puzzleNumber)
            ? current
            : current.concat(summary)
        );
        setReviewPuzzleNumber(null);
      } else {
        setReviewPuzzleNumber(nextPuzzleNumber);
      }
    },
    [state, suppressBoardAnimations]
  );

  const setSeed = useCallback(
    (nextSeed: string) => {
      const normalizedSeed = nextSeed.trim();
      seedRef.current = normalizedSeed;
      setSeedState(normalizedSeed);
      if (statusRef.current !== "running") {
        installPuzzle(0, { record: false, seed: normalizedSeed });
      }
    },
    [installPuzzle]
  );

  const randomizeSeed = useCallback(() => {
    setSeed(createPounceRushRunSeed());
  }, [setSeed]);

  const start = useCallback(
    (requestedSeed = seedRef.current) => {
      const nextSeed = requestedSeed.trim() || createPounceRushRunSeed();
      clearNextPuzzleTimeout();
      seedRef.current = nextSeed;
      statusRef.current = "running";
      scoreRef.current = 0;
      startTimeRef.current = Date.now();
      setFeedback(null);
      setPuzzleHistory([]);
      setRemainingMs(POUNCE_RUSH_DURATION_MS);
      setReviewPuzzleNumber(null);
      setScore(0);
      setSeedState(nextSeed);
      setStatus("running");
      installPuzzle(0, { record: true, seed: nextSeed });
    },
    [clearNextPuzzleTimeout, installPuzzle]
  );

  const restart = useCallback(() => {
    start(seedRef.current);
  }, [start]);

  const startWithNewSeed = useCallback(() => {
    start(createPounceRushRunSeed());
  }, [start]);

  const peekPuzzle = useCallback(
    (nextPuzzleNumber: number) => {
      if (statusRef.current !== "complete") {
        return;
      }
      installPuzzle(nextPuzzleNumber, {
        record: false,
        seed: seedRef.current,
      });
    },
    [installPuzzle]
  );

  const blockAttempt = useCallback(() => {
    showFeedback({
      title: "Stock is locked",
      detail: "Rush puzzles only use the visible waste card.",
    });
  }, [showFeedback]);

  const completeCurrentPuzzle = useCallback(() => {
    if (isAdvancingPuzzleRef.current || statusRef.current !== "running") {
      return;
    }

    isAdvancingPuzzleRef.current = true;
    setIsAdvancingPuzzle(true);
    showFeedback({ title: "Solved!" }, "success");
    const nextScore = scoreRef.current + 1;
    scoreRef.current = nextScore;
    setScore(nextScore);
    clearNextPuzzleTimeout();
    nextPuzzleTimeoutRef.current = window.setTimeout(() => {
      nextPuzzleTimeoutRef.current = null;
      if (statusRef.current !== "running") {
        return;
      }

      installPuzzle(puzzleNumberRef.current + 1, {
        record: true,
        seed: seedRef.current,
      });
    }, NEXT_PUZZLE_DELAY_MS);
  }, [clearNextPuzzleTimeout, installPuzzle, showFeedback]);

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
        showFeedback({ title: "Press Start" });
        return;
      }

      const expectedMove = puzzle.sequence[stepIndexRef.current];
      if (!isExpectedPounceRushMove(move, expectedMove)) {
        showFeedback(
          getPounceRushMoveRejection(
            board,
            puzzle,
            stepIndexRef.current,
            move
          )
        );
        return;
      }

      const result = executeMove(board, 0, move);
      if (result == null) {
        showFeedback({ title: "Blocked" });
        return;
      }

      emitBoardUpdate(state, board, revisionRef);
      const nextStepIndex = stepIndexRef.current + 1;
      stepIndexRef.current = nextStepIndex;
      setStepIndex(nextStepIndex);

      if (nextStepIndex >= puzzle.sequence.length) {
        completeCurrentPuzzle();
      } else {
        showFeedback({ title: "Correct!" }, "success");
      }
    },
    [completeCurrentPuzzle, showFeedback, state]
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

  useEffect(() => {
    playerNameRef.current = playerName;
    const board = boardRef.current;
    if (board?.players[0]) {
      board.players[0].name = playerName || "Player";
      emitBoardUpdate(state, board, revisionRef);
    }
  }, [playerName, state]);

  useEffect(() => {
    if (!boardRef.current) {
      runInAction(() => {
        state.setPlayerSessionId(POUNCE_RUSH_PLAYER_SESSION_ID);
        state.onConnect(POUNCE_RUSH_SOCKET_ID);
      });
      installPuzzle(0, { record: false, seed: seedRef.current });
    } else if (!state.isConnected || state.board == null) {
      runInAction(() => {
        state.setPlayerSessionId(POUNCE_RUSH_PLAYER_SESSION_ID);
        state.onConnect(POUNCE_RUSH_SOCKET_ID);
      });
      emitBoardUpdate(state, boardRef.current, revisionRef);
      emitHandsUpdate(state, handsRef.current);
    }

    return () => {
      clearNextPuzzleTimeout();
      if (animationSuppressionTimeoutRef.current != null) {
        window.clearTimeout(animationSuppressionTimeoutRef.current);
      }
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
      peekPuzzle,
      randomizeSeed,
      restart,
      setSeed,
      start,
      startWithNewSeed,
    },
    currentPuzzle,
    feedback,
    isAdvancingPuzzle,
    isBoardAnimationSuppressed,
    isConnected: state.isConnected,
    puzzleHistory,
    puzzleNumber,
    remainingMs,
    reviewPuzzleNumber,
    score,
    seed,
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
  applyBoardUpdate(state, board, revisionRef.current);
}

function applyBoardUpdate(
  state: SocketState,
  board: BoardState,
  revision: number
): void {
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
      revision,
      roundAnalysis: null,
    });
  });
}

function emitHandsUpdate(state: SocketState, hands: CursorState[]): void {
  applyHandsUpdate(state, hands);
}

function applyHandsUpdate(state: SocketState, hands: CursorState[]): void {
  runInAction(() => {
    state.updateHands(deepClone(hands));
  });
}
