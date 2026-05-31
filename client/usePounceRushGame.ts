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
  createPounceRushDailySeed,
  createPounceRushPuzzle,
  createPounceRushRunSeed,
  getPounceRushDailyKey,
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
type PounceRushRunKind = "daily" | "random";
type RushFeedback = PounceRushMoveRejection & {
  id: number;
  tone: "blocked" | "success";
};
export type PounceRushDailyOutcome = {
  completedAt: string;
  dateKey: string;
  durationMs: number;
  seed: string;
  shareText: string;
  streak: number;
  tries: number;
};

const DAILY_OUTCOME_STORAGE_KEY = "pounce::rush-daily-outcome";
const DAILY_HISTORY_STORAGE_KEY = "pounce::rush-daily-history";

export default function usePounceRushGame(playerName: string) {
  const initialDailyDateKeyRef = useRef(getPounceRushDailyKey());
  const initialSeedRef = useRef(
    createPounceRushDailySeed(initialDailyDateKeyRef.current)
  );
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
  const [dailyTryCount, setDailyTryCount] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [feedback, setFeedback] = useState<RushFeedback | null>(null);
  const [hintCard, setHintCard] = useState<CardState | null>(null);
  const [isAdvancingPuzzle, setIsAdvancingPuzzle] = useState(false);
  const [isBoardAnimationSuppressed, setIsBoardAnimationSuppressed] =
    useState(false);
  const [puzzleHistory, setPuzzleHistory] = useState<
    PounceRushPuzzleSummary[]
  >([]);
  const [dailyDateKey, setDailyDateKey] = useState(
    initialDailyDateKeyRef.current
  );
  const [dailyOutcome, setDailyOutcome] =
    useState<PounceRushDailyOutcome | null>(null);
  const [puzzleNumber, setPuzzleNumber] = useState(0);
  const [reviewPuzzleNumber, setReviewPuzzleNumber] = useState<number | null>(0);
  const [runKind, setRunKind] = useState<PounceRushRunKind>("daily");
  const [score, setScore] = useState(0);
  const [seed, setSeedState] = useState(initialSeedRef.current);
  const [status, setStatus] = useState<RushStatus>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(POUNCE_RUSH_DURATION_MS);
  const animationSuppressionTimeoutRef = useRef<number | null>(null);
  const boardRef = useRef<BoardState | null>(initialPuzzle?.board ?? null);
  const currentPuzzleRef = useRef<PounceRushPuzzle | null>(initialPuzzle);
  const dailyDateKeyRef = useRef(initialDailyDateKeyRef.current);
  const dailyOutcomeRef = useRef<PounceRushDailyOutcome | null>(null);
  const dailyTryCountRef = useRef(1);
  const feedbackIdRef = useRef(0);
  const isAdvancingPuzzleRef = useRef(false);
  const nextPuzzleTimeoutRef = useRef<number | null>(null);
  const playerNameRef = useRef(playerName);
  const puzzleHistoryRef = useRef<PounceRushPuzzleSummary[]>([]);
  const puzzleNumberRef = useRef(0);
  const runKindRef = useRef<PounceRushRunKind>("daily");
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
      setHintCard(null);
      setIsAdvancingPuzzle(false);
      setPuzzleNumber(nextPuzzleNumber);
      setStepIndex(0);
      isAdvancingPuzzleRef.current = false;
      emitBoardUpdate(state, puzzle.board, revisionRef);
      emitHandsUpdate(state, handsRef.current);

      if (options.record) {
        const summary = getPounceRushPuzzleSummary(puzzle);
        setPuzzleHistory((current) => {
          const next = current.some(
            (entry) => entry.puzzleNumber === summary.puzzleNumber
          )
            ? current
            : current.concat(summary);
          puzzleHistoryRef.current = next;
          return next;
        });
        setReviewPuzzleNumber(null);
      } else {
        setReviewPuzzleNumber(nextPuzzleNumber);
      }
    },
    [state, suppressBoardAnimations]
  );

  const start = useCallback(
    (
      requestedSeed = seedRef.current,
      nextRunKind: PounceRushRunKind = runKindRef.current
    ) => {
      const nextSeed = requestedSeed.trim() || createPounceRushRunSeed();
      clearNextPuzzleTimeout();
      seedRef.current = nextSeed;
      runKindRef.current = nextRunKind;
      statusRef.current = "running";
      dailyTryCountRef.current = 1;
      scoreRef.current = 0;
      startTimeRef.current = Date.now();
      setDailyTryCount(1);
      setElapsedMs(0);
      setFeedback(null);
      setHintCard(null);
      puzzleHistoryRef.current = [];
      setPuzzleHistory([]);
      setRemainingMs(POUNCE_RUSH_DURATION_MS);
      setReviewPuzzleNumber(null);
      setRunKind(nextRunKind);
      setScore(0);
      setSeedState(nextSeed);
      setStatus("running");
      installPuzzle(0, { record: true, seed: nextSeed });
    },
    [clearNextPuzzleTimeout, installPuzzle]
  );

  const restart = useCallback(() => {
    start(seedRef.current, runKindRef.current);
  }, [start]);

  const startRandom = useCallback(() => {
    start(createPounceRushRunSeed(), "random");
  }, [start]);

  const startDaily = useCallback(() => {
    const todayKey = getPounceRushDailyKey();
    const existingOutcome = dailyOutcomeRef.current;
    dailyDateKeyRef.current = todayKey;
    setDailyDateKey(todayKey);
    if (existingOutcome?.dateKey === todayKey) {
      runKindRef.current = "random";
      setRunKind("random");
      showFeedback({
        title: "Daily complete",
        detail: "Random puzzles are still open for practice.",
      });
      return;
    }

    start(createPounceRushDailySeed(todayKey), "daily");
  }, [showFeedback, start]);

  const selectRunKind = useCallback(
    (nextRunKind: PounceRushRunKind) => {
      if (statusRef.current === "running") {
        return;
      }

      const todayKey = getPounceRushDailyKey();
      dailyDateKeyRef.current = todayKey;
      setDailyDateKey(todayKey);
      if (
        nextRunKind === "daily" &&
        dailyOutcomeRef.current?.dateKey === todayKey
      ) {
        runKindRef.current = "random";
        setRunKind("random");
        showFeedback({
          title: "Daily complete",
          detail: "Try a random puzzle rush instead.",
        });
        installPuzzle(0, { record: false, seed: "" });
        return;
      }

      runKindRef.current = nextRunKind;
      setRunKind(nextRunKind);
      installPuzzle(0, {
        record: false,
        seed:
          nextRunKind === "daily" ? createPounceRushDailySeed(todayKey) : "",
      });
    },
    [installPuzzle, showFeedback]
  );

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

  const closePuzzlePreview = useCallback(() => {
    if (statusRef.current === "complete") {
      setReviewPuzzleNumber(null);
    }
  }, []);

  const recordDailyMiss = useCallback(() => {
    if (statusRef.current !== "running" || runKindRef.current !== "daily") {
      return;
    }

    const nextTryCount = dailyTryCountRef.current + 1;
    dailyTryCountRef.current = nextTryCount;
    setDailyTryCount(nextTryCount);
  }, []);

  const blockAttempt = useCallback(() => {
    recordDailyMiss();
    showFeedback({
      title: "Stock is locked",
      detail: "Rush puzzles only use the visible waste card.",
    });
  }, [recordDailyMiss, showFeedback]);

  const showHint = useCallback(() => {
    const board = boardRef.current;
    const puzzle = currentPuzzleRef.current;
    if (!board || !puzzle || statusRef.current !== "running") {
      showFeedback({ title: "Press Start" });
      return;
    }

    const expectedMove = puzzle.sequence[stepIndexRef.current];
    const nextHintCard = getHintCard(board, expectedMove);
    if (!nextHintCard) {
      showFeedback({ title: "Scan the board" });
      return;
    }

    setHintCard(nextHintCard);
    showFeedback(
      {
        title: "Hint",
        detail: getHintDetail(expectedMove),
      },
      "success"
    );
  }, [showFeedback]);

  const copyDailyShareText = useCallback(() => {
    const shareText = dailyOutcomeRef.current?.shareText;
    if (!shareText || typeof window === "undefined") {
      return;
    }

    window.navigator.clipboard
      ?.writeText(shareText)
      .then(() => {
        showFeedback({ title: "Copied" }, "success");
      })
      .catch(() => {
        showFeedback({ title: "Copy failed" });
      });
  }, [showFeedback]);

  const finishRun = useCallback(() => {
    clearNextPuzzleTimeout();
    const completedAt = new Date().toISOString();
    const elapsed = Date.now() - startTimeRef.current;
    statusRef.current = "complete";
    setElapsedMs(elapsed);
    setStatus("complete");
    setHintCard(null);
    setIsAdvancingPuzzle(false);
    isAdvancingPuzzleRef.current = false;

    if (runKindRef.current === "daily") {
      const history = loadDailyHistory();
      history[dailyDateKeyRef.current] = {
        completedAt,
        durationMs: elapsed,
        tries: dailyTryCountRef.current,
      };
      const streak = getDailyStreak(dailyDateKeyRef.current, history);
      const outcome: PounceRushDailyOutcome = {
        completedAt,
        dateKey: dailyDateKeyRef.current,
        durationMs: elapsed,
        seed: seedRef.current,
        shareText: createDailyShareText({
          dateKey: dailyDateKeyRef.current,
          durationMs: elapsed,
          streak,
          tries: dailyTryCountRef.current,
        }),
        streak,
        tries: dailyTryCountRef.current,
      };
      dailyOutcomeRef.current = outcome;
      setDailyOutcome(outcome);
      saveDailyOutcome(outcome, history);
    }
  }, [clearNextPuzzleTimeout]);

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

      if (runKindRef.current === "daily") {
        finishRun();
        return;
      }

      installPuzzle(puzzleNumberRef.current + 1, {
        record: true,
        seed: seedRef.current,
      });
    }, NEXT_PUZZLE_DELAY_MS);
  }, [clearNextPuzzleTimeout, finishRun, installPuzzle, showFeedback]);

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
        recordDailyMiss();
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
        recordDailyMiss();
        showFeedback({ title: "Blocked" });
        return;
      }

      setHintCard(null);
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
    [completeCurrentPuzzle, recordDailyMiss, showFeedback, state]
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
    const todayKey = getPounceRushDailyKey();
    const outcome = loadDailyOutcome(todayKey);
    dailyDateKeyRef.current = todayKey;
    dailyOutcomeRef.current = outcome;
    setDailyDateKey(todayKey);
    setDailyOutcome(outcome);

    if (statusRef.current !== "idle") {
      return;
    }

    const nextRunKind: PounceRushRunKind = outcome ? "random" : "daily";
    runKindRef.current = nextRunKind;
    setRunKind(nextRunKind);
    installPuzzle(0, {
      record: false,
      seed: nextRunKind === "daily" ? createPounceRushDailySeed(todayKey) : "",
    });
  }, [installPuzzle]);

  useEffect(() => {
    const updateTime = () => {
      if (statusRef.current !== "running") {
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      setElapsedMs(elapsed);
      if (runKindRef.current === "daily") {
        return;
      }

      const remaining = Math.max(
        0,
        POUNCE_RUSH_DURATION_MS - elapsed
      );
      setRemainingMs(remaining);
      if (remaining <= 0) {
        finishRun();
      }
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 100);
    return () => window.clearInterval(intervalId);
  }, [finishRun]);

  return {
    actions: {
      closePuzzlePreview,
      copyDailyShareText,
      executeMove: executeRushMove,
      onBlockedMove: blockAttempt,
      onUpdateHand: (location: CursorLocation) => {
        socket.emit("update_hand", { location });
      },
      peekPuzzle,
      selectRunKind,
      showHint,
      restart,
      startDaily,
      startRandom,
    },
    currentPuzzle,
    dailyDateKey,
    dailyOutcome,
    dailyTryCount,
    elapsedMs,
    feedback,
    hintCard,
    isAdvancingPuzzle,
    isBoardAnimationSuppressed,
    isConnected: state.isConnected,
    puzzleHistory,
    puzzleNumber,
    remainingMs,
    reviewPuzzleNumber,
    runKind,
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

type PounceRushDailyHistory = Record<
  string,
  {
    completedAt: string;
    durationMs: number;
    tries: number;
  }
>;

function getHintCard(board: BoardState, move: Move | undefined): CardState | null {
  if (!move) {
    return null;
  }

  const player = board.players[0];
  switch (move.type) {
    case "c2c":
      if (move.source.type === "pounce") {
        return getTopCard(player.pounceDeck);
      }
      if (move.source.type === "deck") {
        return getTopCard(player.flippedDeck);
      }
      return getTopCard(player.stacks[move.source.index]);
    case "c2s":
      return move.source === "pounce"
        ? getTopCard(player.pounceDeck)
        : getTopCard(player.flippedDeck);
    case "s2s": {
      const stack = player.stacks[move.source];
      return stack[stack.length - move.count] ?? null;
    }
    case "cycle":
    case "flip_deck":
    case "move_field_stack":
      return null;
  }
}

function getHintDetail(move: Move | undefined): string {
  if (!move) {
    return "Find the next playable card.";
  }

  if (move.type === "s2s") {
    return "Move a solitaire stack.";
  }
  if (move.type === "c2s") {
    return move.source === "pounce"
      ? "Unload the pounce card."
      : "Use the waste card on a solitaire stack.";
  }
  if (move.type === "c2c") {
    if (move.source.type === "pounce") {
      return "The pounce card can go to the center.";
    }
    if (move.source.type === "deck") {
      return "The waste card can go to the center.";
    }
    return "A solitaire card can go to the center.";
  }
  return "Find the next playable card.";
}

function getTopCard(cards: CardState[]): CardState | null {
  return cards[cards.length - 1] ?? null;
}

function loadDailyOutcome(dateKey: string): PounceRushDailyOutcome | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(DAILY_OUTCOME_STORAGE_KEY);
    if (!storedValue) {
      return null;
    }

    const outcome = JSON.parse(storedValue) as Partial<PounceRushDailyOutcome>;
    if (
      outcome.dateKey !== dateKey ||
      typeof outcome.completedAt !== "string" ||
      typeof outcome.durationMs !== "number" ||
      typeof outcome.seed !== "string" ||
      typeof outcome.shareText !== "string" ||
      typeof outcome.streak !== "number" ||
      typeof outcome.tries !== "number"
    ) {
      return null;
    }

    return outcome as PounceRushDailyOutcome;
  } catch {
    return null;
  }
}

function loadDailyHistory(): PounceRushDailyHistory {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(DAILY_HISTORY_STORAGE_KEY);
    if (!storedValue) {
      return {};
    }

    const parsed = JSON.parse(storedValue) as PounceRushDailyHistory;
    if (parsed == null || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([dateKey, entry]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
          entry != null &&
          typeof entry.completedAt === "string" &&
          typeof entry.durationMs === "number" &&
          typeof entry.tries === "number"
      )
    );
  } catch {
    return {};
  }
}

function saveDailyOutcome(
  outcome: PounceRushDailyOutcome,
  history: PounceRushDailyHistory
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      DAILY_OUTCOME_STORAGE_KEY,
      JSON.stringify(outcome)
    );
    window.localStorage.setItem(
      DAILY_HISTORY_STORAGE_KEY,
      JSON.stringify(history)
    );
  } catch {
    // Private browsing or storage limits should not block finishing a run.
  }
}

function getDailyStreak(
  dateKey: string,
  history: PounceRushDailyHistory
): number {
  let streak = 0;
  let cursor: string | null = dateKey;
  while (cursor && history[cursor]) {
    streak += 1;
    cursor = getPreviousDateKey(cursor);
  }
  return streak;
}

function getPreviousDateKey(dateKey: string): string | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return getPounceRushDailyKey(date);
}

function createDailyShareText({
  dateKey,
  durationMs,
  streak,
  tries,
}: {
  dateKey: string;
  durationMs: number;
  streak: number;
  tries: number;
}): string {
  const triesText = tries === 1 ? "1 try" : `${tries} tries`;
  const streakText = streak === 1 ? "1 day" : `${streak} days`;
  return [
    `Pounce Daily ${dateKey}`,
    `⏱ ${formatDurationForShare(durationMs)}`,
    `🔥 ${streakText}`,
    `🎯 ${triesText}`,
    "🟩 Solved",
  ].join("\n");
}

function formatDurationForShare(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
