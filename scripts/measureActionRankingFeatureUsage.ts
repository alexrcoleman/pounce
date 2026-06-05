import fs from "fs";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  type ActionRankingCandidate,
  type ActionRankingOptions,
} from "../shared/ActionRankingPolicy";
import {
  applySimulationMoveResult,
  createSimulationHands,
  getSimulationActionOptions,
  getSimulationHand,
} from "../shared/AISimulationCursor";
import { createTrainingBoard } from "../shared/ActionRankingTraining";
import { getCurrentAIDragMove } from "../shared/ComputerV1";
import { isGameOver } from "../shared/GameUtils";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

type SampledState = {
  playerCount: number;
  candidates: ActionRankingCandidate[];
};

type FeatureGroup = {
  name: string;
  indices: number[];
};

const defaultModelPaths = [
  ["champion", "./node_modules/pounce-action-ranking-cursor-champion.json"],
  [
    "wide384-gap-mixed-4p",
    "./node_modules/pounce-action-ranking-cursor-wide384-gap-mixed-4p.json",
  ],
] as const;

const featureIndex = new Map<string, number>(
  ACTION_RANKING_FEATURE_NAMES.map((name, index) => [name, index])
);
const modelSpecs = readModelSpecs();
if (modelSpecs.length === 0) {
  throw new Error("No feature usage models found.");
}

const stateModelPath = process.env.STATE_MODEL ?? modelSpecs.at(-1)!.path;
const statePolicy = new NeuralActionRankingPolicy(readModel(stateModelPath));
const actionOptions: ActionRankingOptions = {
  includeWait: readBooleanEnv("RL_INCLUDE_WAIT_ACTIONS", false),
  includePremove: readBooleanEnv("RL_INCLUDE_PREMOVE_ACTIONS", false),
  includeFlipDeck: readBooleanEnv("RL_INCLUDE_FLIP_DECK_ACTIONS", true),
};
const playerCounts = readIntegerListEnv("FEATURE_USAGE_PLAYERS", [2, 4]);
const deals = readIntegerEnv("FEATURE_USAGE_DEALS", 96);
const maxMoves = readIntegerEnv("FEATURE_USAGE_MAX_MOVES", 900);
const maxStatesPerPlayerCount = readIntegerEnv(
  "FEATURE_USAGE_STATES_PER_PLAYER_COUNT",
  2600
);
const seed = process.env.SEED ?? "action-ranking-feature-usage";

const states = playerCounts.flatMap((playerCount) =>
  collectStates(playerCount, deals, maxMoves, maxStatesPerPlayerCount, seed)
);
const groups = createFeatureGroups();
const individualFeatures = createIndividualFeatureGroups();

console.log(
  JSON.stringify(
    {
      stateSample: summarizeStates(states),
      models: modelSpecs.map(({ label, path }) => {
        const policy = new NeuralActionRankingPolicy(readModel(path));
        return {
          label,
          path,
          architecture: describeModel(readModel(path)),
          groupAblations: analyzeAblations(policy, groups),
          individualAblations: analyzeAblations(policy, individualFeatures).sort(
            (left, right) =>
              right.topChangeRate - left.topChangeRate ||
              right.meanAbsoluteCandidateScoreShift -
                left.meanAbsoluteCandidateScoreShift
          ),
          deckToSolitaireVsCycle: analyzeDeckToSolitaire(policy),
        };
      }),
    },
    null,
    2
  )
);

function collectStates(
  playerCount: number,
  dealCount: number,
  maxMovesPerDeal: number,
  maxStates: number,
  baseSeed: string
): SampledState[] {
  const collected: SampledState[] = [];
  for (
    let dealIndex = 0;
    dealIndex < dealCount && collected.length < maxStates;
    dealIndex++
  ) {
    const board = createTrainingBoard(
      playerCount,
      `${baseSeed}:${playerCount}:deal:${dealIndex}`
    );
    const random = createSeededRandom(
      `${baseSeed}:${playerCount}:states:${dealIndex}`
    );
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
      stepIndex < maxMovesPerDeal &&
      collected.length < maxStates;
      stepIndex++
    ) {
      const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
      if (playerIndex < 0) {
        break;
      }

      const hand = getSimulationHand(hands, playerIndex);
      const currentActionOptions = getSimulationActionOptions(
        actionOptions,
        hands
      );
      const candidates = enumerateActionRankingCandidates(
        board,
        playerIndex,
        currentActionOptions
      );
      if (candidates.length > 1) {
        collected.push({ playerCount, candidates });
      }

      const currentDragMove = getCurrentAIDragMove(board, playerIndex, hand);
      const move =
        currentDragMove ?? statePolicy.chooseCandidate(candidates)?.move;
      if (move) {
        const result = executeMove(board, playerIndex, move, hand);
        applySimulationMoveResult(board, playerIndex, move, hand, result);
      }
      cooldowns[playerIndex] += getMoveDelay(move?.type, random);
    }
  }
  return collected;
}

function analyzeAblations(
  policy: NeuralActionRankingPolicy,
  groupsToAnalyze: readonly FeatureGroup[]
) {
  return groupsToAnalyze.map((group) => {
    let topChanges = 0;
    let moveTypeChanges = 0;
    let scoreShiftTotal = 0;
    let candidateCount = 0;
    let topScoreDropTotal = 0;

    states.forEach((state) => {
      const scores = state.candidates.map((candidate) =>
        policy.scoreFeatures(candidate.features)
      );
      const topIndex = getBestIndex(scores);
      const ablatedScores = state.candidates.map((candidate) =>
        policy.scoreFeatures(zeroFeatures(candidate.features, group.indices))
      );
      const ablatedTopIndex = getBestIndex(ablatedScores);

      if (ablatedTopIndex !== topIndex) {
        topChanges += 1;
      }
      if (
        state.candidates[ablatedTopIndex].move.type !==
        state.candidates[topIndex].move.type
      ) {
        moveTypeChanges += 1;
      }
      topScoreDropTotal += scores[topIndex] - ablatedScores[topIndex];
      scores.forEach((score, index) => {
        scoreShiftTotal += Math.abs(score - ablatedScores[index]);
        candidateCount += 1;
      });
    });

    return {
      name: group.name,
      featureCount: group.indices.length,
      topChangeRate: rate(topChanges, states.length),
      moveTypeChangeRate: rate(moveTypeChanges, states.length),
      meanTopScoreDrop: meanFromTotal(topScoreDropTotal, states.length),
      meanAbsoluteCandidateScoreShift: meanFromTotal(
        scoreShiftTotal,
        candidateCount
      ),
    };
  });
}

function analyzeDeckToSolitaire(policy: NeuralActionRankingPolicy) {
  const records: { stock: number; helpful: number; margin: number }[] = [];
  states.forEach((state) => {
    const cycle = state.candidates.find(
      (candidate) => candidate.move.type === "cycle"
    );
    if (!cycle) {
      return;
    }

    const cycleScore = policy.scoreFeatures(cycle.features);
    state.candidates.forEach((candidate) => {
      if (candidate.move.type !== "c2s" || candidate.move.source !== "deck") {
        return;
      }
      records.push({
        stock: getFeatureValue(candidate, "solitaire.deckStockFraction"),
        helpful:
          getFeatureValue(candidate, "solitaire.deckMoveHelpful") >= 0.5
            ? 1
            : 0,
        margin: policy.scoreFeatures(candidate.features) - cycleScore,
      });
    });
  });

  return {
    candidateCount: records.length,
    correlationStockFractionToMargin: correlation(
      records.map((record) => record.stock),
      records.map((record) => record.margin)
    ),
    correlationHelpfulBitToMargin: correlation(
      records.map((record) => record.helpful),
      records.map((record) => record.margin)
    ),
    meanMarginHelpful: mean(
      records.filter((record) => record.helpful === 1).map((record) => record.margin)
    ),
    meanMarginNotHelpful: mean(
      records.filter((record) => record.helpful === 0).map((record) => record.margin)
    ),
    buckets: [0, 0.2, 0.4, 0.6, 0.8].map((start) => {
      const end = start + 0.2;
      const bucket = records.filter(
        (record) =>
          record.stock >= start && (start >= 0.8 ? record.stock <= 1 : record.stock < end)
      );
      return {
        bucket: `${start.toFixed(1)}-${end.toFixed(1)}`,
        count: bucket.length,
        meanMarginVsCycle: mean(bucket.map((record) => record.margin)),
        c2sPreferredRate: mean(
          bucket.map((record) => (record.margin > 0 ? 1 : 0))
        ),
      };
    }),
  };
}

function createFeatureGroups(): FeatureGroup[] {
  return [
    {
      name: "newSignalsAll",
      indices: selectFeatureIndices(
        (name) =>
          name === "board.isHeadsUp" ||
          name === "board.ticksSinceNonWaitMove" ||
          name.startsWith("solitaire.sourceCenter") ||
          name.startsWith("solitaire.destTopCenter") ||
          name.startsWith("own.hand") ||
          name.startsWith("opponent.hand") ||
          name.startsWith("center.opponentHand") ||
          name === "card.centerDistance" ||
          name === "own.wasteCenterDistance" ||
          name.startsWith("premove.") ||
          name.startsWith("stuck.")
      ),
    },
    {
      name: "hardcodedDeckHelpfulBit",
      indices: getFeatureIndices(["solitaire.deckMoveHelpful"]),
    },
    {
      name: "solitaireDistanceNuance",
      indices: getFeatureIndices([
        "solitaire.sourceCenterLowerDistance",
        "solitaire.destTopCenterLowerDistance",
        "solitaire.sourceCenterAboveCount",
        "solitaire.destTopCenterAboveCount",
      ]),
    },
    {
      name: "stockPositionContinuous",
      indices: getFeatureIndices([
        "solitaire.deckStockFraction",
        "own.stockFraction",
        "own.wasteFraction",
        "cycle.stockFractionAfter",
        "cycle.cardsAdvanced",
      ]),
    },
    {
      name: "cycleLookahead",
      indices: selectFeatureIndices(
        (name) =>
          name.startsWith("cycle.lookahead") ||
          name.startsWith("cycle.revealed") ||
          name.startsWith("cycle.reset") ||
          name.startsWith("own.stockLookahead")
      ),
    },
    {
      name: "handAndPremove",
      indices: selectFeatureIndices(
        (name) =>
          name.startsWith("own.hand") ||
          name.startsWith("opponent.hand") ||
          name.startsWith("center.opponentHand") ||
          name.startsWith("premove.") ||
          name === "move.premove"
      ),
    },
    {
      name: "headsUpStuckTiming",
      indices: selectFeatureIndices(
        (name) =>
          name === "board.isHeadsUp" ||
          name === "board.ticksSinceNonWaitMove" ||
          name.startsWith("stuck.")
      ),
    },
    {
      name: "opponentPressure",
      indices: selectFeatureIndices(
        (name) =>
          (name.startsWith("opponent.") ||
            name.startsWith("center.opponent") ||
            name === "center.opponentsCanFollowAfter" ||
            name === "center.opponentsCanPlaySameNow" ||
            name === "center.opponentsCanFollowSoonAfter") &&
          !name.includes("hand")
      ),
    },
    {
      name: "cardConnectorNuance",
      indices: getFeatureIndices([
        "card.canPlaySoon",
        "card.centerDistance",
        "card.matchesPounceParity",
        "card.pounceConnectorCloseness",
        "card.ownSolitaireDestinationCount",
        "card.ownSolitaireConnectorForPounce",
        "own.wasteCenterDistance",
        "own.wasteMatchesPounceParity",
        "own.wastePounceConnectorCloseness",
      ]),
    },
    {
      name: "solitaireBottomRawCards",
      indices: selectFeatureIndices(
        (name) =>
          name.startsWith("own.stack0Bottom") ||
          name.startsWith("own.stack1Bottom") ||
          name.startsWith("own.stack2Bottom") ||
          name.startsWith("own.stack3Bottom")
      ),
    },
    {
      name: "moveTypeSourceDest",
      indices: selectFeatureIndices(
        (name) =>
          name.startsWith("move.") ||
          name.startsWith("source.") ||
          name.startsWith("dest.")
      ),
    },
  ];
}

function createIndividualFeatureGroups(): FeatureGroup[] {
  return [
    "solitaire.deckMoveHelpful",
    "solitaire.deckStockFraction",
    "solitaire.sourceCenterLowerDistance",
    "solitaire.destTopCenterLowerDistance",
    "solitaire.sourceCenterAboveCount",
    "solitaire.destTopCenterAboveCount",
    "card.centerDistance",
    "card.matchesPounceParity",
    "card.pounceConnectorCloseness",
    "own.wasteCenterDistance",
    "own.stack0BottomValue",
    "own.stack1BottomValue",
    "own.stack2BottomValue",
    "own.stack3BottomValue",
    "cycle.lookaheadPounceConnectorReach",
    "cycle.lookaheadOwnSolitaireDestinationReach",
    "own.stockLookaheadPounceConnectorReach",
    "board.isHeadsUp",
    "board.ticksSinceNonWaitMove",
    "opponent.handMinCenterDistance",
    "opponent.handMaxPouncePressure",
    "stuck.closestCenterDistanceAdvantage",
  ]
    .map((name) => ({ name, indices: getFeatureIndices([name]) }))
    .filter((group) => group.indices.length > 0);
}

function zeroFeatures(
  features: readonly number[],
  indices: readonly number[]
): number[] {
  const next = features.slice();
  indices.forEach((index) => {
    next[index] = 0;
  });
  return next;
}

function getFeatureValue(
  candidate: ActionRankingCandidate,
  name: string
): number {
  const index = featureIndex.get(name);
  return index == null ? 0 : candidate.features[index] ?? 0;
}

function getFeatureIndices(names: readonly string[]): number[] {
  return names
    .map((name) => featureIndex.get(name))
    .filter((index): index is number => index != null);
}

function selectFeatureIndices(predicate: (name: string) => boolean): number[] {
  return ACTION_RANKING_FEATURE_NAMES.map((name, index) =>
    predicate(name) ? index : -1
  ).filter((index) => index >= 0);
}

function getNextPlayerIndex(
  cooldowns: readonly number[],
  activePlayerIndices: readonly number[]
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

function getBestIndex(values: readonly number[]): number {
  return values.reduce(
    (bestIndex, value, index) =>
      index === 0 || value > values[bestIndex] ? index : bestIndex,
    0
  );
}

function summarizeStates(items: readonly SampledState[]) {
  const byPlayerCount = new Map<number, number>();
  items.forEach((item) => {
    byPlayerCount.set(
      item.playerCount,
      (byPlayerCount.get(item.playerCount) ?? 0) + 1
    );
  });
  const candidateCount = items.reduce(
    (sum, item) => sum + item.candidates.length,
    0
  );
  return {
    states: items.length,
    byPlayerCount: Object.fromEntries(byPlayerCount),
    candidates: candidateCount,
    averageCandidatesPerState: meanFromTotal(candidateCount, items.length),
    stateModel: stateModelPath,
    actionOptions,
    playerCounts,
    deals,
    maxMoves,
    maxStatesPerPlayerCount,
    seed,
  };
}

function describeModel(model: NeuralActionRankingModel) {
  if (model.version === 2) {
    const hiddenParameters = model.layerWeights.reduce(
      (sum, layer, layerIndex) =>
        sum +
        layer.reduce((layerSum, weights) => layerSum + weights.length, 0) +
        model.layerBiases[layerIndex].length,
      0
    );
    return {
      version: 2,
      inputSize: model.inputSize,
      hiddenLayerSizes: model.hiddenLayerSizes,
      parameterCount: hiddenParameters + model.outputWeights.length + 1,
    };
  }
  return {
    version: 1,
    inputSize: model.inputSize,
    hiddenLayerSizes: [model.hiddenSize],
    parameterCount:
      model.inputToHidden.reduce((sum, weights) => sum + weights.length, 0) +
      model.hiddenBias.length +
      model.hiddenToOutput.length +
      1,
  };
}

function correlation(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length < 2 || xs.length !== ys.length) {
    return 0;
  }
  const meanX = mean(xs);
  const meanY = mean(ys);
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  xs.forEach((x, index) => {
    const dx = x - meanX;
    const dy = ys[index] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  });
  if (varianceX === 0 || varianceY === 0) {
    return 0;
  }
  return covariance / Math.sqrt(varianceX * varianceY);
}

function mean(values: readonly number[]): number {
  return meanFromTotal(
    values.reduce((sum, value) => sum + value, 0),
    values.length
  );
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function meanFromTotal(total: number, count: number): number {
  return count === 0 ? 0 : total / count;
}

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}

function readModelSpecs(): { label: string; path: string }[] {
  const raw = process.env.FEATURE_USAGE_MODELS;
  if (raw && raw.trim() !== "") {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        return separator < 0
          ? { label: item, path: item }
          : {
              label: item.slice(0, separator),
              path: item.slice(separator + 1),
            };
      });
  }
  return defaultModelPaths
    .filter(([, path]) => fs.existsSync(path))
    .map(([label, path]) => ({ label, path }));
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function readIntegerListEnv(name: string, fallback: number[]): number[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
  return parsed.length === 0 ? fallback : parsed;
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
