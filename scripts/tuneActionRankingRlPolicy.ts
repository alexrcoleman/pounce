import fs from "fs";
import path from "path";
import { enumerateActionRankingCandidates } from "../shared/ActionRankingPolicy";
import {
  compareNeuralModels,
  compareNeuralModelsSelfPlay,
  createTrainingBoard,
  evaluateNeuralModelAgainstBasicStyle,
  trainNeuralActionRankingPolicy,
  type NeuralTrainingOptions,
  type PolicyEvaluationResult,
} from "../shared/ActionRankingTraining";
import {
  getBasicAIMove,
  getBasicAIStyleNames,
} from "../shared/ComputerV1";
import { isGameOver, type BoardState } from "../shared/GameUtils";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

type ModelComparisonResult = ReturnType<typeof compareNeuralModels>;
type MoveTypeCounts = Record<Move["type"], number>;

type StyleSeedComparison = {
  style: string;
  seed: string;
  games: number;
  modelABaselineAdjustedPointDifferential: number;
  modelBBaselineAdjustedPointDifferential: number;
  baselineAdjustedPointDifferentialDelta: number;
  modelAPointDifferential: number;
  modelBPointDifferential: number;
  pointDifferentialDelta: number;
  modelAScore: number;
  modelBScore: number;
  scoreDelta: number;
  modelAPounceOutRate: number;
  modelBPounceOutRate: number;
  pounceOutRateDelta: number;
};

type RlTuneRecipe = {
  name: string;
  options: NeuralTrainingOptions;
};

const modelIn = process.env.MODEL_IN;
if (!modelIn) {
  throw new Error("MODEL_IN is required.");
}

const initialModel = readModel(modelIn);
const outputDir = process.env.RL_TUNE_OUT_DIR ?? ".\\node_modules\\pounce-rl-tuning";
const modelOut = process.env.MODEL_OUT;
const rounds = readIntegerEnv("RL_TUNE_ROUNDS", 1);
const seed = process.env.SEED ?? "action-ranking-rl-tune";
const promoteMinDelta = readNumberEnv("PROMOTE_MIN_DELTA", 0);
const promoteStandardErrorMultiplier = readNumberEnv(
  "PROMOTE_SE_MULTIPLIER",
  1
);
const keepCandidates = readBooleanEnv("RL_TUNE_KEEP_CANDIDATES", true);
const playerCount = readIntegerEnv("PLAYERS", 4);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const compareGames = readIntegerEnv("COMPARE_GAMES", 48);
const compareRuns = readIntegerEnv("COMPARE_RUNS", 2);
const diagnosticGames = readIntegerEnv("RL_TUNE_DIAG_GAMES", 0);
const diagnosticMaxExamples = readIntegerEnv("RL_TUNE_DIAG_MAX_EXAMPLES", 2000);
const confirmGames = readIntegerEnv("CONFIRM_GAMES", 0);
const confirmRuns = readIntegerEnv(
  "CONFIRM_RUNS",
  Math.max(1, compareRuns * 2)
);
const confirmMinDelta = readNumberEnv("CONFIRM_MIN_DELTA", promoteMinDelta);
const confirmStandardErrorMultiplier = readNumberEnv(
  "CONFIRM_SE_MULTIPLIER",
  promoteStandardErrorMultiplier
);
const confirmTriggerMinDelta = readNumberEnv(
  "CONFIRM_TRIGGER_MIN_DELTA",
  promoteMinDelta
);
const styleGateGames = readIntegerEnv("RL_TUNE_STYLE_GAMES", 0);
const styleGateRuns = readIntegerEnv(
  "RL_TUNE_STYLE_RUNS",
  Math.max(1, compareRuns)
);
const styleGateMaxRegression = readNumberEnv(
  "RL_TUNE_STYLE_MAX_REGRESSION",
  0
);
const styleGateStandardErrorMultiplier = readNumberEnv(
  "RL_TUNE_STYLE_SE_MULTIPLIER",
  promoteStandardErrorMultiplier
);
const styleGateStyles = readStyleListEnv(
  "RL_TUNE_STYLES",
  getBasicAIStyleNames()
);
const selfPlayGateGames = readIntegerEnv("RL_TUNE_SELF_PLAY_GAMES", 0);
const selfPlayGateRuns = readIntegerEnv(
  "RL_TUNE_SELF_PLAY_RUNS",
  Math.max(1, compareRuns)
);
const selfPlayGateMaxRegression = readNumberEnv(
  "RL_TUNE_SELF_PLAY_MAX_REGRESSION",
  0
);
const selfPlayGateStandardErrorMultiplier = readNumberEnv(
  "RL_TUNE_SELF_PLAY_SE_MULTIPLIER",
  promoteStandardErrorMultiplier
);
const selfPlayGateSwapSeats = readBooleanEnv(
  "RL_TUNE_SELF_PLAY_SWAP_SEATS",
  true
);
const recipes = readRecipes();

fs.mkdirSync(outputDir, { recursive: true });

let bestModel = initialModel;
let bestModelPath = modelIn;
const roundResults = [];

for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
  const roundNumber = roundIndex + 1;
  const recipeResults = [];

  for (let recipeIndex = 0; recipeIndex < recipes.length; recipeIndex++) {
    const recipe = recipes[recipeIndex];
    const candidateResult = trainNeuralActionRankingPolicy({
      playerCount,
      maxMovesPerGame,
      ...recipe.options,
      initialModel: bestModel,
      seed: `${seed}:round:${roundNumber}:recipe:${recipe.name}`,
    });
    const candidateModel = candidateResult.model;
    const candidatePath = path.join(
      outputDir,
      `round-${roundNumber}-${sanitizeFilePart(recipe.name)}-candidate.json`
    );
    if (keepCandidates) {
      writeModel(candidatePath, candidateModel);
    }

    const comparisonBatch = compareModelBatch(candidateModel, bestModel, {
      playerCount,
      games: compareGames,
      runs: compareRuns,
      seed: `${seed}:compare:${roundNumber}:${recipe.name}`,
      maxMovesPerGame,
    });
    const comparison = comparisonBatch.comparison;
    const policyStateDiagnostics =
      diagnosticGames > 0
        ? diagnosePolicyStateDivergence(candidateModel, bestModel, {
            playerCount,
            games: diagnosticGames,
            maxExamples: diagnosticMaxExamples,
            seed: `${seed}:diagnose:${roundNumber}:${recipe.name}`,
            maxMovesPerGame,
          })
        : null;
    const lowerBound = getPromotionLowerBound(
      comparison,
      promoteStandardErrorMultiplier
    );
    const searchPassed = lowerBound > promoteMinDelta;
    const shouldConfirm =
      confirmGames > 0 &&
      (searchPassed || lowerBound >= confirmTriggerMinDelta);
    const confirmationBatch = shouldConfirm
      ? compareModelBatch(candidateModel, bestModel, {
          playerCount,
          games: confirmGames,
          runs: confirmRuns,
          seed: `${seed}:confirm:${roundNumber}:${recipe.name}`,
          maxMovesPerGame,
        })
      : null;
    const confirmationLowerBound = confirmationBatch
      ? getPromotionLowerBound(
          confirmationBatch.comparison,
          confirmStandardErrorMultiplier
        )
      : null;
    const modelGatePassed = confirmationBatch
      ? confirmationLowerBound! > confirmMinDelta
      : searchPassed;
    const shouldRunStyleGate = styleGateGames > 0 && modelGatePassed;
    const styleGateBatch = shouldRunStyleGate
      ? compareModelBatchByStyle(candidateModel, bestModel, {
          playerCount,
          games: styleGateGames,
          runs: styleGateRuns,
          seed: `${seed}:style-gate:${roundNumber}:${recipe.name}`,
          maxMovesPerGame,
          styles: styleGateStyles,
        })
      : null;
    const styleGateLowerBound = styleGateBatch
      ? getStylePromotionLowerBound(
          styleGateBatch.comparison,
          styleGateStandardErrorMultiplier
        )
      : null;
    const styleGatePassed = styleGateBatch
      ? styleGateLowerBound! >= -styleGateMaxRegression
      : true;
    const shouldRunSelfPlayGate =
      selfPlayGateGames > 0 && modelGatePassed && styleGatePassed;
    const selfPlayGateBatch = shouldRunSelfPlayGate
      ? compareModelBatchSelfPlay(candidateModel, bestModel, {
          playerCount,
          games: selfPlayGateGames,
          runs: selfPlayGateRuns,
          seed: `${seed}:self-play-gate:${roundNumber}:${recipe.name}`,
          maxMovesPerGame,
          swapSeats: selfPlayGateSwapSeats,
        })
      : null;
    const selfPlayGateLowerBound = selfPlayGateBatch
      ? getPromotionLowerBound(
          selfPlayGateBatch.comparison,
          selfPlayGateStandardErrorMultiplier
        )
      : null;
    const selfPlayGatePassed = selfPlayGateBatch
      ? selfPlayGateLowerBound! >= -selfPlayGateMaxRegression
      : true;
    const promoted = modelGatePassed && styleGatePassed && selfPlayGatePassed;

    if (promoted) {
      bestModel = candidateModel;
      bestModelPath = path.join(
        outputDir,
        `round-${roundNumber}-${sanitizeFilePart(recipe.name)}-best.json`
      );
      writeModel(bestModelPath, bestModel);
    }

    recipeResults.push({
      recipe: recipe.name,
      recipeIndex,
      promoted,
      searchPassed,
      lowerBound,
      candidatePath: keepCandidates ? candidatePath : null,
      bestModelPath,
      training: {
        improvement: candidateResult.improvement,
        reinforcement: candidateResult.reinforcement,
        evaluation: candidateResult.evaluation,
      },
      comparison,
      perCompareRun: comparisonBatch.perCompareRun,
      policyStateDiagnostics,
      confirmation: confirmationBatch
        ? {
            lowerBound: confirmationLowerBound,
            comparison: confirmationBatch.comparison,
            perCompareRun: confirmationBatch.perCompareRun,
          }
        : null,
      styleGate: styleGateBatch
        ? {
            passed: styleGatePassed,
            lowerBound: styleGateLowerBound,
            comparison: styleGateBatch.comparison,
            byStyle: styleGateBatch.byStyle,
          }
        : null,
      selfPlayGate: selfPlayGateBatch
        ? {
            passed: selfPlayGatePassed,
            lowerBound: selfPlayGateLowerBound,
            comparison: selfPlayGateBatch.comparison,
            perCompareRun: selfPlayGateBatch.perCompareRun,
          }
        : null,
    });
  }

  roundResults.push({
    round: roundNumber,
    bestModelPath,
    recipeResults,
  });
}

const finalModelPath = modelOut ?? path.join(outputDir, "best-rl-model.json");
writeModel(finalModelPath, bestModel);

console.log(
  JSON.stringify(
    {
      modelIn,
      finalModelPath,
      rounds,
      recipes: recipes.map(({ name, options }) => ({ name, options })),
      promotionRule: {
        promoteMinDelta,
        promoteStandardErrorMultiplier,
      },
      confirmationRule: {
        confirmGames,
        confirmRuns,
        confirmMinDelta,
        confirmStandardErrorMultiplier,
        confirmTriggerMinDelta,
      },
      styleGateRule: {
        enabled: styleGateGames > 0,
        styleGateGames,
        styleGateRuns,
        styleGateStyles,
        styleGateMaxRegression,
        styleGateStandardErrorMultiplier,
      },
      selfPlayGateRule: {
        enabled: selfPlayGateGames > 0,
        selfPlayGateGames,
        selfPlayGateRuns,
        selfPlayGateMaxRegression,
        selfPlayGateStandardErrorMultiplier,
        selfPlayGateSwapSeats,
      },
      diagnostics: {
        diagnosticGames,
        diagnosticMaxExamples,
      },
      roundResults,
    },
    null,
    2
  )
);

function readRecipes(): RlTuneRecipe[] {
  const explicit = process.env.RL_TUNE_RECIPES;
  if (explicit && explicit.trim() !== "") {
    const parsed = JSON.parse(explicit) as RlTuneRecipe[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("RL_TUNE_RECIPES must be a non-empty JSON array.");
    }
    return parsed.map((recipe, index) => normalizeRecipe(recipe, index));
  }

  return [
    createRecipe("exploratory-pairwise-behavior", {
      rlCounterfactualTrainingMode: "pairwise",
      rlCounterfactualPreferenceScope: "behavior",
      rlCounterfactualMinReturnGap: 2,
      rlLearningRate: 0.00005,
    }),
    createRecipe("exploratory-pairwise-all", {
      rlCounterfactualTrainingMode: "pairwise",
      rlCounterfactualPreferenceScope: "all",
      rlCounterfactualMinReturnGap: 2,
      rlLearningRate: 0.00005,
    }),
    createRecipe("exploratory-value-broad", {
      rlCounterfactualTrainingMode: "value",
      rlCounterfactualMinReturnGap: 0,
      rlCounterfactualValueTargetScale: 8,
      rlCounterfactualValueCenterTargets: true,
      rlCounterfactualValueHuberDelta: 2,
      rlLearningRate: 0.00005,
    }),
  ];
}

function createRecipe(
  name: string,
  options: NeuralTrainingOptions
): RlTuneRecipe {
  return {
    name,
    options: {
      ...getDefaultRecipeOptions(),
      ...options,
    },
  };
}

function normalizeRecipe(recipe: RlTuneRecipe, index: number): RlTuneRecipe {
  if (!recipe || typeof recipe.name !== "string" || !recipe.options) {
    throw new Error(`RL_TUNE_RECIPES[${index}] is invalid.`);
  }
  return {
    name: recipe.name,
    options: {
      ...getDefaultRecipeOptions(),
      ...recipe.options,
    },
  };
}

function getDefaultRecipeOptions(): NeuralTrainingOptions {
  return {
    imitationDeals: 0,
    improvementStates: 0,
    rlEpisodes: readIntegerEnv("RL_EPISODES", 64),
    rlTemperature: readNumberEnv("RL_TEMPERATURE", 1.05),
    rlLocalRewardWeight: readNumberEnv("RL_LOCAL_REWARD_WEIGHT", 0),
    rlLocalRewardDiscount: readNumberEnv("RL_LOCAL_REWARD_DISCOUNT", 0),
    rlOpponentMode: readRlOpponentModeEnv("RL_OPPONENT_MODE", "teacher"),
    rlBaselineMode: "greedy",
    rlCommonRandom: true,
    rlCreditMode: "counterfactual",
    rlCounterfactualScanEpisodes: readIntegerEnv(
      "RL_COUNTERFACTUAL_SCAN_EPISODES",
      readIntegerEnv("RL_EPISODES", 64)
    ),
    rlCounterfactualRolloutCount: readIntegerEnv("RL_COUNTERFACTUAL_ROLLOUTS", 1),
    rlCounterfactualRolloutMoves: readIntegerEnv(
      "RL_COUNTERFACTUAL_ROLLOUT_MOVES",
      450
    ),
    rlCounterfactualCandidateLimit: readIntegerEnv(
      "RL_COUNTERFACTUAL_CANDIDATES",
      5
    ),
    rlCounterfactualMaxReturnGap: readNumberEnv(
      "RL_COUNTERFACTUAL_MAX_RETURN_GAP",
      0
    ),
    rlCounterfactualRequireBehaviorGap: readBooleanEnv(
      "RL_COUNTERFACTUAL_REQUIRE_BEHAVIOR_GAP",
      false
    ),
    rlCounterfactualMinBehaviorImprovement: readNumberEnv(
      "RL_COUNTERFACTUAL_MIN_BEHAVIOR_IMPROVEMENT",
      readNumberEnv("RL_COUNTERFACTUAL_MIN_RETURN_GAP", 1)
    ),
    rlCounterfactualStateSource: readRlCounterfactualStateSourceEnv(
      "RL_COUNTERFACTUAL_STATE_SOURCE",
      "sampled"
    ),
    rlCounterfactualGapStandardErrorMultiplier: readNumberEnv(
      "RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER",
      0
    ),
    rlCounterfactualMinBehaviorWinRate: readNumberEnv(
      "RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE",
      0
    ),
    rlCounterfactualMaxPolicyMargin: readNumberEnv(
      "RL_COUNTERFACTUAL_MAX_POLICY_MARGIN",
      0
    ),
    rlCounterfactualPairwiseTargetMargin: readNumberEnv(
      "RL_COUNTERFACTUAL_PAIRWISE_MARGIN",
      0
    ),
    rlCounterfactualPairwiseWeightMode: readPairwiseWeightModeEnv(
      "RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_MODE",
      "uniform"
    ),
    rlCounterfactualPairwiseWeightScale: readNumberEnv(
      "RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_SCALE",
      1
    ),
    rlCounterfactualPairwiseMaxWeight: readNumberEnv(
      "RL_COUNTERFACTUAL_PAIRWISE_MAX_WEIGHT",
      1
    ),
    rlCounterfactualMaxScoreGap: readNumberEnv(
      "RL_COUNTERFACTUAL_MAX_SCORE_GAP",
      0
    ),
    rlCounterfactualScoreRewardWeight: readNumberEnv(
      "RL_COUNTERFACTUAL_SCORE_WEIGHT",
      0
    ),
    rlCounterfactualPounceRewardWeight: readNumberEnv(
      "RL_COUNTERFACTUAL_POUNCE_WEIGHT",
      0
    ),
    rlCounterfactualSkipCycleOverConnector: readBooleanEnv(
      "RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR",
      false
    ),
    rlCounterfactualAnchorWeight: readNumberEnv(
      "RL_COUNTERFACTUAL_ANCHOR_WEIGHT",
      0
    ),
    rlCounterfactualAnchorMaxExamples: readIntegerEnv(
      "RL_COUNTERFACTUAL_ANCHOR_EXAMPLES",
      512
    ),
    rlCounterfactualAnchorTemperature: readNumberEnv(
      "RL_COUNTERFACTUAL_ANCHOR_TEMPERATURE",
      1
    ),
    rlCounterfactualConnectorAnchorWeight: readNumberEnv(
      "RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_WEIGHT",
      0
    ),
    rlCounterfactualConnectorAnchorMaxExamples: readIntegerEnv(
      "RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_EXAMPLES",
      512
    ),
    rlCounterfactualConnectorAnchorMargin: readNumberEnv(
      "RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MARGIN",
      0.05
    ),
    rlCounterfactualConnectorAnchorMaxPolicyMargin: readNumberEnv(
      "RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MAX_POLICY_MARGIN",
      0
    ),
    rlCounterfactualConnectorAnchorMode: readConnectorAnchorModeEnv(
      "RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MODE",
      "connector"
    ),
    rlCounterfactualValueTargetScale: readNumberEnv(
      "RL_COUNTERFACTUAL_VALUE_SCALE",
      4
    ),
    rlCounterfactualValueCenterTargets: readBooleanEnv(
      "RL_COUNTERFACTUAL_VALUE_CENTER",
      true
    ),
    rlCounterfactualValueTargetMode: readValueTargetModeEnv(
      "RL_COUNTERFACTUAL_VALUE_TARGET_MODE",
      "absolute"
    ),
    rlCounterfactualValueHuberDelta: readNumberEnv(
      "RL_COUNTERFACTUAL_VALUE_HUBER",
      0
    ),
    rlUpdateEpochs: readIntegerEnv("RL_UPDATE_EPOCHS", 1),
    rlUpdateScope: "exploratory",
    rlTrainableLayers: readTrainableLayersEnv("RL_TRAINABLE_LAYERS", "all"),
    rlNormalizeAdvantages: true,
    rlAdvantageClip: readNumberEnv("RL_ADVANTAGE_CLIP", 3),
  };
}

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}

function writeModel(filePath: string, model: NeuralActionRankingModel): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(model, null, 2));
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

function readRlOpponentModeEnv(
  name: string,
  fallback: "teacher" | "self"
): "teacher" | "self" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "self" ? "self" : fallback;
}

function readValueTargetModeEnv(
  name: string,
  fallback: "absolute" | "residual"
): "absolute" | "residual" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "residual" ? "residual" : fallback;
}

function readRlCounterfactualStateSourceEnv(
  name: string,
  fallback: "sampled" | "greedy"
): "sampled" | "greedy" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "greedy" ? "greedy" : fallback;
}

function readConnectorAnchorModeEnv(
  name: string,
  fallback: "connector" | "symmetric"
): "connector" | "symmetric" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "symmetric" ? "symmetric" : fallback;
}

function readPairwiseWeightModeEnv(
  name: string,
  fallback: "uniform" | "return_gap"
): "uniform" | "return_gap" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "return_gap" ? "return_gap" : fallback;
}

function readTrainableLayersEnv(
  name: string,
  fallback: "all" | "output"
): "all" | "output" {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "output" ? "output" : fallback;
}

function readStyleListEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  if (value.trim().toLowerCase() === "all") {
    return fallback;
  }

  const styleByLowerName = new Map(
    getBasicAIStyleNames().map((style) => [style.toLowerCase(), style])
  );
  const styles = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((style) => {
      const knownStyle = styleByLowerName.get(style.toLowerCase());
      if (!knownStyle) {
        throw new Error(
          `Unknown AI style "${style}". Known styles: ${getBasicAIStyleNames().join(
            ", "
          )}`
        );
      }
      return knownStyle;
    });
  return styles.length === 0 ? fallback : styles;
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function diagnosePolicyStateDivergence(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  options: {
    playerCount: number;
    games: number;
    maxExamples: number;
    seed: string;
    maxMovesPerGame: number;
  }
) {
  const policyA = new NeuralActionRankingPolicy(modelA);
  const policyB = new NeuralActionRankingPolicy(modelB);
  return {
    modelAStates: diagnosePolicyStates(policyA, policyA, policyB, {
      ...options,
      sourceLabel: "modelA",
    }),
    modelBStates: diagnosePolicyStates(policyB, policyA, policyB, {
      ...options,
      sourceLabel: "modelB",
    }),
  };
}

function diagnosePolicyStates(
  sourcePolicy: NeuralActionRankingPolicy,
  policyA: NeuralActionRankingPolicy,
  policyB: NeuralActionRankingPolicy,
  options: {
    playerCount: number;
    games: number;
    maxExamples: number;
    seed: string;
    maxMovesPerGame: number;
    sourceLabel: "modelA" | "modelB";
  }
) {
  const modelAMoveCounts = createMoveTypeCounts();
  const modelBMoveCounts = createMoveTypeCounts();
  const disagreementPairs = new Map<string, number>();
  let examples = 0;
  let candidates = 0;
  let topActionAgreementCount = 0;
  let topEquivalenceAgreementCount = 0;
  let referenceAgreementA = 0;
  let referenceAgreementB = 0;
  let candidateScoreDeltaTotal = 0;
  let candidateScoreDeltaAbsTotal = 0;
  let maxCandidateScoreDeltaAbs = 0;

  for (
    let gameIndex = 0;
    gameIndex < options.games && examples < options.maxExamples;
    gameIndex++
  ) {
    const neuralPlayerIndex = gameIndex % options.playerCount;
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${gameIndex}`
    );
    const activePlayerIndices = getActivePlayerIndices(board);
    const random = createSeededRandom(
      `${options.seed}:${options.sourceLabel}:timing:${gameIndex}`
    );
    const cooldowns = board.players.map((_, playerIndex) =>
      activePlayerIndices.includes(playerIndex)
        ? random()
        : Number.POSITIVE_INFINITY
    );
    prepareBoardForSimulation(board, activePlayerIndices);

    for (
      let moveIndex = 0;
      !isGameOver(board) &&
      moveIndex < options.maxMovesPerGame &&
      examples < options.maxExamples;
      moveIndex++
    ) {
      const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
      if (playerIndex < 0) {
        break;
      }

      const move =
        playerIndex === neuralPlayerIndex
          ? diagnoseAndChoosePolicyMove(
              board,
              playerIndex,
              sourcePolicy,
              policyA,
              policyB,
              (summary) => {
                examples += 1;
                candidates += summary.candidateCount;
                candidateScoreDeltaTotal += summary.candidateScoreDeltaTotal;
                candidateScoreDeltaAbsTotal +=
                  summary.candidateScoreDeltaAbsTotal;
                maxCandidateScoreDeltaAbs = Math.max(
                  maxCandidateScoreDeltaAbs,
                  summary.maxCandidateScoreDeltaAbs
                );
                modelAMoveCounts[summary.modelAMoveType] += 1;
                modelBMoveCounts[summary.modelBMoveType] += 1;
                if (summary.topActionAgreement) {
                  topActionAgreementCount += 1;
                }
                if (summary.topEquivalenceAgreement) {
                  topEquivalenceAgreementCount += 1;
                }
                if (summary.modelAReferenceAgreement) {
                  referenceAgreementA += 1;
                }
                if (summary.modelBReferenceAgreement) {
                  referenceAgreementB += 1;
                }
                if (!summary.topActionAgreement) {
                  const pair = `${summary.modelAMoveType}>${summary.modelBMoveType}`;
                  disagreementPairs.set(
                    pair,
                    (disagreementPairs.get(pair) ?? 0) + 1
                  );
                }
              }
            )
          : getBasicAIMove(board, playerIndex, {});
      if (move) {
        executeMove(board, playerIndex, move);
      }
      cooldowns[playerIndex] += getMoveDelay(move?.type, random);
    }
  }

  return {
    examples,
    candidates,
    averageCandidatesPerExample: examples === 0 ? 0 : candidates / examples,
    averageCandidateScoreDelta:
      candidates === 0 ? 0 : candidateScoreDeltaTotal / candidates,
    averageAbsoluteCandidateScoreDelta:
      candidates === 0 ? 0 : candidateScoreDeltaAbsTotal / candidates,
    maxAbsoluteCandidateScoreDelta: maxCandidateScoreDeltaAbs,
    topActionAgreementRate:
      examples === 0 ? 0 : topActionAgreementCount / examples,
    topEquivalenceAgreementRate:
      examples === 0 ? 0 : topEquivalenceAgreementCount / examples,
    disagreementCount: examples - topActionAgreementCount,
    modelAReferenceAgreementRate:
      examples === 0 ? 0 : referenceAgreementA / examples,
    modelBReferenceAgreementRate:
      examples === 0 ? 0 : referenceAgreementB / examples,
    modelATopMoveRates: normalizeMoveCounts(modelAMoveCounts, examples),
    modelBTopMoveRates: normalizeMoveCounts(modelBMoveCounts, examples),
    disagreementMoveTypePairs: Array.from(disagreementPairs.entries())
      .map(([pair, count]) => ({
        pair,
        count,
        rate: examples === 0 ? 0 : count / examples,
      }))
      .sort((left, right) => right.count - left.count),
  };
}

function diagnoseAndChoosePolicyMove(
  board: BoardState,
  playerIndex: number,
  sourcePolicy: NeuralActionRankingPolicy,
  policyA: NeuralActionRankingPolicy,
  policyB: NeuralActionRankingPolicy,
  addSummary: (summary: {
    candidateCount: number;
    candidateScoreDeltaTotal: number;
    candidateScoreDeltaAbsTotal: number;
    maxCandidateScoreDeltaAbs: number;
    modelAMoveType: Move["type"];
    modelBMoveType: Move["type"];
    topActionAgreement: boolean;
    topEquivalenceAgreement: boolean;
    modelAReferenceAgreement: boolean;
    modelBReferenceAgreement: boolean;
  }) => void
): Move | undefined {
  const candidates = enumerateActionRankingCandidates(board, playerIndex);
  const rankingA = policyA.rankCandidates(candidates);
  const rankingB = policyB.rankCandidates(candidates);
  const selected = sourcePolicy.chooseCandidate(candidates, {
    temperature: 1,
    sample: false,
  });
  const topA = rankingA[0];
  const topB = rankingB[0];
  if (selected && topA && topB) {
    const scoreAByKey = getScoreMap(rankingA);
    const scoreBByKey = getScoreMap(rankingB);
    let candidateScoreDeltaTotal = 0;
    let candidateScoreDeltaAbsTotal = 0;
    let maxCandidateScoreDeltaAbs = 0;
    candidates.forEach((candidate) => {
      const scoreDelta =
        (scoreAByKey.get(candidate.key) ?? 0) -
        (scoreBByKey.get(candidate.key) ?? 0);
      const scoreDeltaAbs = Math.abs(scoreDelta);
      candidateScoreDeltaTotal += scoreDelta;
      candidateScoreDeltaAbsTotal += scoreDeltaAbs;
      maxCandidateScoreDeltaAbs = Math.max(
        maxCandidateScoreDeltaAbs,
        scoreDeltaAbs
      );
    });
    addSummary({
      candidateCount: candidates.length,
      candidateScoreDeltaTotal,
      candidateScoreDeltaAbsTotal,
      maxCandidateScoreDeltaAbs,
      modelAMoveType: topA.candidate.move.type,
      modelBMoveType: topB.candidate.move.type,
      topActionAgreement: topA.candidate.key === topB.candidate.key,
      topEquivalenceAgreement:
        topA.candidate.equivalenceKey === topB.candidate.equivalenceKey,
      modelAReferenceAgreement: topA.candidate.key === selected.key,
      modelBReferenceAgreement: topB.candidate.key === selected.key,
    });
  }
  return selected?.move;
}

function getScoreMap(
  predictions: ReturnType<NeuralActionRankingPolicy["rankCandidates"]>
) {
  return new Map(
    predictions.map((prediction) => [
      prediction.candidate.key,
      prediction.score,
    ])
  );
}

function prepareBoardForSimulation(
  board: BoardState,
  activePlayerIndices: readonly number[]
): void {
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.players.forEach((player, playerIndex) => {
    if (activePlayerIndices.includes(playerIndex)) {
      player.socketId = null;
    }
  });
}

function getActivePlayerIndices(board: BoardState): number[] {
  return board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);
}

function getNextPlayerIndex(
  cooldowns: number[],
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

function createMoveTypeCounts(): MoveTypeCounts {
  return {
    c2c: 0,
    c2s: 0,
    s2s: 0,
    cycle: 0,
    flip_deck: 0,
    move_field_stack: 0,
  };
}

function normalizeMoveCounts(counts: MoveTypeCounts, total: number) {
  return Object.fromEntries(
    Object.entries(counts).map(([moveType, count]) => [
      moveType,
      total === 0 ? 0 : count / total,
    ])
  );
}

function compareModelBatch(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  options: {
    playerCount: number;
    games: number;
    runs: number;
    seed: string;
    maxMovesPerGame: number;
  }
) {
  const runCount = Math.max(1, options.runs);
  const comparisons = Array.from({ length: runCount }, (_, index) =>
    compareNeuralModels(modelA, modelB, {
      playerCount: options.playerCount,
      games: options.games,
      seed: runCount === 1 ? options.seed : `${options.seed}:${index}`,
      maxMovesPerGame: options.maxMovesPerGame,
    })
  );
  return {
    comparison:
      comparisons.length === 1
        ? comparisons[0]
        : summarizeComparisons(comparisons),
    perCompareRun: comparisons.length === 1 ? undefined : comparisons,
  };
}

function compareModelBatchSelfPlay(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  options: {
    playerCount: number;
    games: number;
    runs: number;
    seed: string;
    maxMovesPerGame: number;
    swapSeats: boolean;
  }
) {
  const runCount = Math.max(1, options.runs);
  const comparisons = Array.from({ length: runCount }, (_, index) =>
    compareNeuralModelsSelfPlay(modelA, modelB, {
      playerCount: options.playerCount,
      games: options.games,
      seed: runCount === 1 ? options.seed : `${options.seed}:${index}`,
      maxMovesPerGame: options.maxMovesPerGame,
      swapSeats: options.swapSeats,
    })
  );
  return {
    comparison:
      comparisons.length === 1
        ? comparisons[0]
        : summarizeComparisons(comparisons),
    perCompareRun: comparisons.length === 1 ? undefined : comparisons,
  };
}

function compareModelBatchByStyle(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  options: {
    playerCount: number;
    games: number;
    runs: number;
    seed: string;
    maxMovesPerGame: number;
    styles: string[];
  }
) {
  const runCount = Math.max(1, options.runs);
  const allComparisons: StyleSeedComparison[] = [];
  const byStyle = options.styles.map((style) => {
    const perSeed = Array.from({ length: runCount }, (_, index) => {
      const styleSeed =
        runCount === 1
          ? `${options.seed}:${style}`
          : `${options.seed}:${style}:${index}`;
      return compareModelsAgainstStyle(modelA, modelB, style, styleSeed, {
        playerCount: options.playerCount,
        games: options.games,
        maxMovesPerGame: options.maxMovesPerGame,
      });
    });
    allComparisons.push(...perSeed);
    return {
      style,
      summary: summarizeStyleComparisons(perSeed),
      perSeed: perSeed.length === 1 ? undefined : perSeed,
    };
  });
  return {
    comparison: summarizeStyleComparisons(allComparisons),
    byStyle,
  };
}

function compareModelsAgainstStyle(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  style: string,
  seed: string,
  options: {
    playerCount: number;
    games: number;
    maxMovesPerGame: number;
  }
): StyleSeedComparison {
  const evaluationA = evaluateNeuralModelAgainstBasicStyle(modelA, style, {
    playerCount: options.playerCount,
    games: options.games,
    seed,
    maxMovesPerGame: options.maxMovesPerGame,
  });
  const evaluationB = evaluateNeuralModelAgainstBasicStyle(modelB, style, {
    playerCount: options.playerCount,
    games: options.games,
    seed,
    maxMovesPerGame: options.maxMovesPerGame,
  });
  return createStyleSeedComparison(style, seed, evaluationA, evaluationB);
}

function createStyleSeedComparison(
  style: string,
  seed: string,
  evaluationA: PolicyEvaluationResult,
  evaluationB: PolicyEvaluationResult
): StyleSeedComparison {
  return {
    style,
    seed,
    games: evaluationA.games,
    modelABaselineAdjustedPointDifferential:
      evaluationA.averageBaselineAdjustedPointDifferential,
    modelBBaselineAdjustedPointDifferential:
      evaluationB.averageBaselineAdjustedPointDifferential,
    baselineAdjustedPointDifferentialDelta:
      evaluationA.averageBaselineAdjustedPointDifferential -
      evaluationB.averageBaselineAdjustedPointDifferential,
    modelAPointDifferential: evaluationA.averageNeuralPointDifferential,
    modelBPointDifferential: evaluationB.averageNeuralPointDifferential,
    pointDifferentialDelta:
      evaluationA.averageNeuralPointDifferential -
      evaluationB.averageNeuralPointDifferential,
    modelAScore: evaluationA.averageNeuralScore,
    modelBScore: evaluationB.averageNeuralScore,
    scoreDelta: evaluationA.averageNeuralScore - evaluationB.averageNeuralScore,
    modelAPounceOutRate: evaluationA.neuralPounceOutRate,
    modelBPounceOutRate: evaluationB.neuralPounceOutRate,
    pounceOutRateDelta:
      evaluationA.neuralPounceOutRate - evaluationB.neuralPounceOutRate,
  };
}

function summarizeStyleComparisons(comparisons: StyleSeedComparison[]) {
  const games = comparisons.reduce((sum, item) => sum + item.games, 0);
  const comparisonCount = comparisons.length;
  const baselineAdjustedDeltas = comparisons.map(
    (item) => item.baselineAdjustedPointDifferentialDelta
  );
  const pointDifferentialDeltas = comparisons.map(
    (item) => item.pointDifferentialDelta
  );
  return {
    games,
    comparisonCount,
    averageModelABaselineAdjustedPointDifferential: weightedMean(
      comparisons,
      "modelABaselineAdjustedPointDifferential"
    ),
    averageModelBBaselineAdjustedPointDifferential: weightedMean(
      comparisons,
      "modelBBaselineAdjustedPointDifferential"
    ),
    averageBaselineAdjustedPointDifferentialDelta: weightedMean(
      comparisons,
      "baselineAdjustedPointDifferentialDelta"
    ),
    baselineAdjustedPointDifferentialDeltaStandardError: standardError(
      baselineAdjustedDeltas
    ),
    averageModelAPointDifferential: weightedMean(
      comparisons,
      "modelAPointDifferential"
    ),
    averageModelBPointDifferential: weightedMean(
      comparisons,
      "modelBPointDifferential"
    ),
    averagePointDifferentialDelta: weightedMean(
      comparisons,
      "pointDifferentialDelta"
    ),
    pointDifferentialDeltaStandardError: standardError(pointDifferentialDeltas),
    modelABetterRate:
      comparisonCount === 0
        ? 0
        : comparisons.filter(
            (item) => item.baselineAdjustedPointDifferentialDelta > 0
          ).length / comparisonCount,
    modelBBetterRate:
      comparisonCount === 0
        ? 0
        : comparisons.filter(
            (item) => item.baselineAdjustedPointDifferentialDelta < 0
          ).length / comparisonCount,
    tiedRate:
      comparisonCount === 0
        ? 0
        : comparisons.filter(
            (item) => item.baselineAdjustedPointDifferentialDelta === 0
          ).length / comparisonCount,
    averageModelAScore: weightedMean(comparisons, "modelAScore"),
    averageModelBScore: weightedMean(comparisons, "modelBScore"),
    averageScoreDelta: weightedMean(comparisons, "scoreDelta"),
    averageModelAPounceOutRate: weightedMean(
      comparisons,
      "modelAPounceOutRate"
    ),
    averageModelBPounceOutRate: weightedMean(
      comparisons,
      "modelBPounceOutRate"
    ),
    averagePounceOutRateDelta: weightedMean(
      comparisons,
      "pounceOutRateDelta"
    ),
  };
}

function getPromotionLowerBound(
  comparison: ModelComparisonResult,
  standardErrorMultiplier: number
): number {
  return (
    comparison.averagePointDifferentialDelta -
    standardErrorMultiplier * comparison.pointDifferentialDeltaStandardError
  );
}

function getStylePromotionLowerBound(
  comparison: ReturnType<typeof summarizeStyleComparisons>,
  standardErrorMultiplier: number
): number {
  return (
    comparison.averageBaselineAdjustedPointDifferentialDelta -
    standardErrorMultiplier *
      comparison.baselineAdjustedPointDifferentialDeltaStandardError
  );
}

function summarizeComparisons(comparisons: ModelComparisonResult[]) {
  const games = comparisons.reduce((sum, item) => sum + item.games, 0);
  return {
    games,
    seedCount: comparisons.length,
    averageModelAPointDifferential: weightedMean(
      comparisons,
      "averageModelAPointDifferential"
    ),
    averageModelBPointDifferential: weightedMean(
      comparisons,
      "averageModelBPointDifferential"
    ),
    averagePointDifferentialDelta: weightedMean(
      comparisons,
      "averagePointDifferentialDelta"
    ),
    pointDifferentialDeltaStandardError: standardError(
      comparisons.map((item) => item.averagePointDifferentialDelta)
    ),
    modelABetterRate: weightedMean(comparisons, "modelABetterRate"),
    modelBBetterRate: weightedMean(comparisons, "modelBBetterRate"),
    tiedPointDifferentialRate: weightedMean(
      comparisons,
      "tiedPointDifferentialRate"
    ),
    averageModelAScore: weightedMean(comparisons, "averageModelAScore"),
    averageModelBScore: weightedMean(comparisons, "averageModelBScore"),
    averageScoreDelta: weightedMean(comparisons, "averageScoreDelta"),
    averageModelADecisionCount: weightedMean(
      comparisons,
      "averageModelADecisionCount"
    ),
    averageModelBDecisionCount: weightedMean(
      comparisons,
      "averageModelBDecisionCount"
    ),
    averageModelACenterMoveRate: weightedMean(
      comparisons,
      "averageModelACenterMoveRate"
    ),
    averageModelBCenterMoveRate: weightedMean(
      comparisons,
      "averageModelBCenterMoveRate"
    ),
    averageModelASolitaireMoveRate: weightedMean(
      comparisons,
      "averageModelASolitaireMoveRate"
    ),
    averageModelBSolitaireMoveRate: weightedMean(
      comparisons,
      "averageModelBSolitaireMoveRate"
    ),
    averageModelACycleMoveRate: weightedMean(
      comparisons,
      "averageModelACycleMoveRate"
    ),
    averageModelBCycleMoveRate: weightedMean(
      comparisons,
      "averageModelBCycleMoveRate"
    ),
    averageModelAPounceRemaining: weightedMean(
      comparisons,
      "averageModelAPounceRemaining"
    ),
    averageModelBPounceRemaining: weightedMean(
      comparisons,
      "averageModelBPounceRemaining"
    ),
    modelAPounceOutRate: weightedMean(comparisons, "modelAPounceOutRate"),
    modelBPounceOutRate: weightedMean(comparisons, "modelBPounceOutRate"),
  };
}

function weightedMean<T extends { games: number }>(
  comparisons: T[],
  key: keyof T
): number {
  const games = comparisons.reduce((sum, item) => sum + item.games, 0);
  if (games === 0) {
    return 0;
  }
  return (
    comparisons.reduce((sum, item) => {
      const value = item[key];
      return sum + (typeof value === "number" ? value * item.games : 0);
    }, 0) / games
  );
}

function standardError(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) /
    (values.length - 1);
  return Math.sqrt(variance / values.length);
}
