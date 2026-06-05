import fs from "fs";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  getActionRankingMoveKey,
  getPointDifferential,
  type ActionRankingCandidate,
  type ActionRankingFeatureName,
  type ActionRankingOptions,
} from "../shared/ActionRankingPolicy";
import type { ActionRankingImitationExample } from "../shared/ActionRankingImitation";
import { createTrainingBoard } from "../shared/ActionRankingTraining";
import {
  applySimulationMoveResult,
  createSimulationHands,
  getSimulationActionOptions,
  getSimulationHand,
} from "../shared/AISimulationCursor";
import { getCurrentAIDragMove } from "../shared/ComputerV1";
import { isGameOver, type BoardState } from "../shared/GameUtils";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

const modelIn = process.env.MODEL_IN;
const targetModelPath = process.env.TARGET_MODEL;
const modelOut = process.env.MODEL_OUT;
if (!modelIn || !targetModelPath || !modelOut) {
  throw new Error("MODEL_IN, TARGET_MODEL, and MODEL_OUT are required.");
}

const policy = new NeuralActionRankingPolicy(readModel(modelIn));
const targetPolicy = new NeuralActionRankingPolicy(readModel(targetModelPath));
const statePolicy = readStatePolicy(policy, targetPolicy);
const playerCount = readIntegerEnv("PLAYERS", 2);
const maxExamples = readIntegerEnv("ANCHOR_EXAMPLES", 512);
const maxDeals = readIntegerEnv("ANCHOR_MAX_DEALS", 200);
const maxMovesPerDeal = readIntegerEnv("MAX_MOVES", 1800);
const epochs = readIntegerEnv("ANCHOR_EPOCHS", 1);
const learningRate = readNumberEnv("ANCHOR_LR", 0.00001);
const equivalentTargets = readBooleanEnv("ANCHOR_EQUIVALENT_TARGETS", true);
const seed = process.env.SEED ?? "action-ranking-model-anchor";
const actionOptions = readActionOptionsEnv();
const filters = readAnchorFilters();
const collection = collectModelAnchorExamples({
  statePolicy,
  targetPolicy,
  playerCount,
  maxExamples,
  maxDeals,
  maxMovesPerDeal,
  seed,
  actionOptions,
  filters,
});
const examples = collection.examples;
const stats = policy.trainImitation(examples, {
  epochs,
  learningRate,
  equivalentTargets,
  shuffleSeed: `${seed}:shuffle`,
});

fs.writeFileSync(modelOut, JSON.stringify(policy.getModel(), null, 2));
console.log(
  JSON.stringify(
    {
      modelIn,
      targetModel: targetModelPath,
      modelOut,
      options: {
        stateModel: process.env.STATE_MODEL ?? "target",
        playerCount,
        maxExamples,
        maxDeals,
        maxMovesPerDeal,
        epochs,
        learningRate,
        equivalentTargets,
        actionOptions,
        filters,
        seed,
      },
      collectedExamples: examples.length,
      candidateCount: examples.reduce(
        (sum, example) => sum + example.candidates.length,
        0
      ),
      stats,
      collection: collection.stats,
    },
    null,
    2
  )
);

function collectModelAnchorExamples(options: {
  statePolicy: NeuralActionRankingPolicy;
  targetPolicy: NeuralActionRankingPolicy;
  playerCount: number;
  maxExamples: number;
  maxDeals: number;
  maxMovesPerDeal: number;
  seed: string;
  actionOptions: ActionRankingOptions;
  filters: AnchorFilters;
}): { examples: ActionRankingImitationExample[]; stats: AnchorCollectionStats } {
  const examples: ActionRankingImitationExample[] = [];
  const stats = createAnchorCollectionStats();

  for (
    let dealIndex = 0;
    dealIndex < options.maxDeals && examples.length < options.maxExamples;
    dealIndex++
  ) {
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${dealIndex}`
    );
    const random = createSeededRandom(`${options.seed}:states:${dealIndex}`);
    const activePlayerIndices = board.players
      .map((player, playerIndex) => ({ player, playerIndex }))
      .filter(({ player }) => !player.isSpectating)
      .map(({ playerIndex }) => playerIndex);
    const cooldowns = board.players.map((_, playerIndex) =>
      activePlayerIndices.includes(playerIndex)
        ? random()
        : Number.POSITIVE_INFINITY
    );
    const hands = createSimulationHands(board);

    for (
      let stepIndex = 0;
      !isGameOver(board) &&
      stepIndex < options.maxMovesPerDeal &&
      examples.length < options.maxExamples;
      stepIndex++
    ) {
      const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
      if (playerIndex < 0) {
        break;
      }

      const hand = getSimulationHand(hands, playerIndex);
      const currentActionOptions = getSimulationActionOptions(
        options.actionOptions,
        hands
      );
      const candidates = enumerateActionRankingCandidates(
        board,
        playerIndex,
        currentActionOptions
      );
      const currentDragMove = getCurrentAIDragMove(board, playerIndex, hand);
      const targetPrediction =
        currentDragMove == null
          ? options.targetPolicy.rankCandidates(candidates)[0]
          : undefined;
      const statePrediction =
        currentDragMove == null
          ? options.statePolicy.rankCandidates(candidates)[0]
          : undefined;
      const targetMove =
        currentDragMove ??
        targetPrediction?.candidate.move;
      const stateMove =
        currentDragMove ?? statePrediction?.candidate.move;
      const targetActionKey = targetMove
        ? getActionRankingMoveKey(targetMove)
        : null;
      const selectedCandidateIndex =
        targetActionKey == null
          ? -1
          : candidates.findIndex((candidate) => candidate.key === targetActionKey);

      stats.visitedStates += 1;
      if (candidates.length > 1) {
        stats.multiCandidateStates += 1;
      }

      const targetCandidate =
        selectedCandidateIndex >= 0 ? candidates[selectedCandidateIndex] : null;
      const behaviorCandidate =
        currentDragMove == null ? statePrediction?.candidate ?? null : null;
      const filterResult = shouldKeepAnchorExample({
        board,
        targetCandidate,
        behaviorCandidate,
        targetScore: targetPrediction?.score ?? null,
        behaviorScore: statePrediction?.score ?? null,
        selectedCandidateIndex,
        candidates,
        filters: options.filters,
      });
      if (!filterResult.keep) {
        stats.skipped[filterResult.reason] += 1;
      } else if (targetCandidate) {
        stats.acceptedMovePairCounts[filterResult.movePair] =
          (stats.acceptedMovePairCounts[filterResult.movePair] ?? 0) + 1;
        examples.push({
          trialIndex: dealIndex,
          stepIndex,
          playerIndex,
          playerPointDifferential: getPointDifferential(board, playerIndex),
          finalPlayerPoints: null,
          finalPointDifferential: null,
          pointDifferentialReturn: null,
          teacherActionKey: targetActionKey,
          behaviorActionKey: behaviorCandidate?.key ?? null,
          selectedActionKey: targetActionKey,
          selectedCandidateIndex,
          candidates: candidates.map((candidate) => ({
            key: candidate.key,
            equivalenceKey: candidate.equivalenceKey,
            move: candidate.move,
            features: candidate.features,
            label: candidate.key === targetActionKey ? 1 : 0,
            immediatePointDelta: candidate.immediatePointDelta,
            immediatePointDifferentialDelta:
              candidate.immediatePointDifferentialDelta,
            endsRound: candidate.endsRound,
          })),
        });
      }

      if (stateMove) {
        const result = executeMove(board, playerIndex, stateMove, hand);
        applySimulationMoveResult(board, playerIndex, stateMove, hand, result);
      }
      cooldowns[playerIndex] += getMoveDelay(stateMove?.type, random);
    }
  }

  return { examples, stats };
}

type AnchorFilters = {
  requireHeadsUp: boolean;
  requireTopDivergence: boolean;
  movePairs: readonly string[];
  behaviorMoveTypes: readonly Move["type"][];
  targetMoveTypes: readonly Move["type"][];
  targetSources: readonly string[];
  requireTargetDeckMoveHelpful: boolean;
  requireTargetMatchesPounceParity: boolean;
  minTargetPounceConnectorCloseness: number;
  minTargetDeckStockFraction: number;
  maxBehaviorScoreMarginVsTarget: number;
};

type AnchorSkipReason =
  | "notEnoughCandidates"
  | "noTargetCandidate"
  | "noBehaviorCandidate"
  | "headsUp"
  | "topDivergence"
  | "movePair"
  | "behaviorMoveType"
  | "targetMoveType"
  | "targetSource"
  | "targetDeckMoveHelpful"
  | "targetMatchesPounceParity"
  | "targetPounceConnectorCloseness"
  | "targetDeckStockFraction"
  | "behaviorScoreMargin";

type AnchorCollectionStats = {
  visitedStates: number;
  multiCandidateStates: number;
  skipped: Record<AnchorSkipReason, number>;
  acceptedMovePairCounts: Record<string, number>;
};

function shouldKeepAnchorExample(options: {
  board: BoardState;
  targetCandidate: ActionRankingCandidate | null;
  behaviorCandidate: ActionRankingCandidate | null;
  targetScore: number | null;
  behaviorScore: number | null;
  selectedCandidateIndex: number;
  candidates: readonly ActionRankingCandidate[];
  filters: AnchorFilters;
}): { keep: true; movePair: string } | { keep: false; reason: AnchorSkipReason } {
  if (options.candidates.length <= 1) {
    return { keep: false, reason: "notEnoughCandidates" };
  }
  if (options.selectedCandidateIndex < 0 || !options.targetCandidate) {
    return { keep: false, reason: "noTargetCandidate" };
  }
  if (!options.behaviorCandidate) {
    return { keep: false, reason: "noBehaviorCandidate" };
  }
  if (options.filters.requireHeadsUp && getActivePlayerCount(options.board) !== 2) {
    return { keep: false, reason: "headsUp" };
  }
  if (
    options.filters.requireTopDivergence &&
    options.behaviorCandidate.key === options.targetCandidate.key
  ) {
    return { keep: false, reason: "topDivergence" };
  }

  const movePair = getAnchorMovePair(
    options.behaviorCandidate,
    options.targetCandidate
  );
  if (
    options.filters.movePairs.length > 0 &&
    !options.filters.movePairs.includes(movePair)
  ) {
    return { keep: false, reason: "movePair" };
  }
  if (
    options.filters.behaviorMoveTypes.length > 0 &&
    !options.filters.behaviorMoveTypes.includes(options.behaviorCandidate.move.type)
  ) {
    return { keep: false, reason: "behaviorMoveType" };
  }
  if (
    options.filters.targetMoveTypes.length > 0 &&
    !options.filters.targetMoveTypes.includes(options.targetCandidate.move.type)
  ) {
    return { keep: false, reason: "targetMoveType" };
  }
  if (
    options.filters.targetSources.length > 0 &&
    !options.filters.targetSources.includes(
      getAnchorMoveSource(options.targetCandidate.move) ?? ""
    )
  ) {
    return { keep: false, reason: "targetSource" };
  }
  if (
    options.filters.requireTargetDeckMoveHelpful &&
    getCandidateFeature(options.targetCandidate, "solitaire.deckMoveHelpful") < 0.5
  ) {
    return { keep: false, reason: "targetDeckMoveHelpful" };
  }
  if (
    options.filters.requireTargetMatchesPounceParity &&
    getCandidateFeature(options.targetCandidate, "card.matchesPounceParity") < 0.5
  ) {
    return { keep: false, reason: "targetMatchesPounceParity" };
  }
  if (
    options.filters.minTargetPounceConnectorCloseness > 0 &&
    getCandidateFeature(options.targetCandidate, "card.pounceConnectorCloseness") <
      options.filters.minTargetPounceConnectorCloseness
  ) {
    return { keep: false, reason: "targetPounceConnectorCloseness" };
  }
  if (
    options.filters.minTargetDeckStockFraction > 0 &&
    getCandidateFeature(options.targetCandidate, "solitaire.deckStockFraction") <
      options.filters.minTargetDeckStockFraction
  ) {
    return { keep: false, reason: "targetDeckStockFraction" };
  }
  if (options.filters.maxBehaviorScoreMarginVsTarget > 0) {
    if (
      options.behaviorScore != null &&
      options.targetScore != null &&
      options.behaviorScore - options.targetScore >
        options.filters.maxBehaviorScoreMarginVsTarget
    ) {
      return { keep: false, reason: "behaviorScoreMargin" };
    }
  }

  return { keep: true, movePair };
}

function getAnchorMovePair(
  behaviorCandidate: ActionRankingCandidate,
  targetCandidate: ActionRankingCandidate
): string {
  return `${behaviorCandidate.move.type}>${targetCandidate.move.type}`;
}

function getAnchorMoveSource(move: Move): string | null {
  if (move.type === "c2s") {
    return move.source;
  }
  if (move.type === "c2c" || move.type === "premove") {
    return move.source.type;
  }
  if (move.type === "s2s") {
    return "solitaire";
  }
  return null;
}

function getCandidateFeature(
  candidate: ActionRankingCandidate,
  feature: ActionRankingFeatureName
): number {
  const index = ACTION_RANKING_FEATURE_NAMES.indexOf(feature);
  return index < 0 ? 0 : candidate.features[index] ?? 0;
}

function getActivePlayerCount(board: BoardState): number {
  return board.players.filter((player) => !player.isSpectating).length;
}

const ANCHOR_SKIP_REASONS: AnchorSkipReason[] = [
  "notEnoughCandidates",
  "noTargetCandidate",
  "noBehaviorCandidate",
  "headsUp",
  "topDivergence",
  "movePair",
  "behaviorMoveType",
  "targetMoveType",
  "targetSource",
  "targetDeckMoveHelpful",
  "targetMatchesPounceParity",
  "targetPounceConnectorCloseness",
  "targetDeckStockFraction",
  "behaviorScoreMargin",
];

const MOVE_TYPES: Move["type"][] = [
  "c2c",
  "c2s",
  "s2s",
  "cycle",
  "flip_deck",
  "wait",
  "premove",
  "move_field_stack",
];

function createAnchorCollectionStats(): AnchorCollectionStats {
  return {
    visitedStates: 0,
    multiCandidateStates: 0,
    skipped: Object.fromEntries(
      ANCHOR_SKIP_REASONS.map((reason) => [reason, 0])
    ) as Record<AnchorSkipReason, number>,
    acceptedMovePairCounts: {},
  };
}

function readAnchorFilters(): AnchorFilters {
  return {
    requireHeadsUp: readBooleanEnv("ANCHOR_REQUIRE_HEADS_UP", false),
    requireTopDivergence: readBooleanEnv(
      "ANCHOR_REQUIRE_TOP_DIVERGENCE",
      false
    ),
    movePairs: readStringListEnv("ANCHOR_MOVE_PAIRS"),
    behaviorMoveTypes: readMoveTypesEnv("ANCHOR_BEHAVIOR_MOVE_TYPES"),
    targetMoveTypes: readMoveTypesEnv("ANCHOR_TARGET_MOVE_TYPES"),
    targetSources: readStringListEnv("ANCHOR_TARGET_SOURCES"),
    requireTargetDeckMoveHelpful: readBooleanEnv(
      "ANCHOR_REQUIRE_TARGET_DECK_MOVE_HELPFUL",
      false
    ),
    requireTargetMatchesPounceParity: readBooleanEnv(
      "ANCHOR_REQUIRE_TARGET_MATCHES_POUNCE_PARITY",
      false
    ),
    minTargetPounceConnectorCloseness: readNumberEnv(
      "ANCHOR_MIN_TARGET_POUNCE_CONNECTOR_CLOSENESS",
      0
    ),
    minTargetDeckStockFraction: readNumberEnv(
      "ANCHOR_MIN_TARGET_DECK_STOCK_FRACTION",
      0
    ),
    maxBehaviorScoreMarginVsTarget: readNumberEnv(
      "ANCHOR_MAX_BEHAVIOR_SCORE_MARGIN_VS_TARGET",
      0
    ),
  };
}

function getNextPlayerIndex(
  cooldowns: number[],
  activePlayerIndices: number[]
): number {
  return activePlayerIndices.reduce((bestIndex, playerIndex) => {
    if (bestIndex < 0 || cooldowns[playerIndex] < cooldowns[bestIndex]) {
      return playerIndex;
    }
    return bestIndex;
  }, -1);
}

function getMoveDelay(
  moveType: Move["type"] | undefined,
  random: () => number
): number {
  const jitter = 0.72 + random() * 0.56;
  if (moveType === "cycle" || moveType === "flip_deck") {
    return 0.34 * jitter;
  }
  if (moveType === "premove") {
    return 0.42 * jitter;
  }
  if (moveType === "wait") {
    return 0.55 * jitter;
  }
  if (moveType === "s2s") {
    return 0.88 * jitter;
  }
  if (moveType === "c2s") {
    return 0.76 * jitter;
  }
  if (moveType === "c2c") {
    return 0.62 * jitter;
  }
  return 1.1 * jitter;
}

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}

function readStatePolicy(
  inputPolicy: NeuralActionRankingPolicy,
  targetPolicy: NeuralActionRankingPolicy
): NeuralActionRankingPolicy {
  const stateModel = process.env.STATE_MODEL;
  if (stateModel == null || stateModel.trim() === "" || stateModel === "target") {
    return targetPolicy;
  }
  if (stateModel === "input") {
    return inputPolicy;
  }
  return new NeuralActionRankingPolicy(readModel(stateModel));
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }
  return fallback;
}

function readStringListEnv(name: string): string[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readMoveTypesEnv(name: string): Move["type"][] {
  const moveTypes = new Set<string>(MOVE_TYPES);
  return readStringListEnv(name).filter((item): item is Move["type"] =>
    moveTypes.has(item)
  );
}

function readActionOptionsEnv(): ActionRankingOptions {
  return {
    includeWait: readBooleanEnv("RL_INCLUDE_WAIT_ACTIONS", false),
    includePremove: readBooleanEnv("RL_INCLUDE_PREMOVE_ACTIONS", false),
    includeFlipDeck: readBooleanEnv("RL_INCLUDE_FLIP_DECK_ACTIONS", true),
  };
}
