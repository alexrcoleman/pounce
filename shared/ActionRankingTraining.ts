import { getBasicAIMove } from "./ComputerV1";
import deepClone from "./deepClone";
import {
  createBoard,
  dealPlayerHand,
  isGameOver,
  resetBoard,
  type BoardState,
  type CardState,
  type Suits,
  type Values,
} from "./GameUtils";
import {
  enumerateActionRankingCandidates,
  getActionRankingMoveKey,
  getCurrentPointsFromCards,
  getPointDifferential,
  type ActionRankingCandidate,
} from "./ActionRankingPolicy";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type ImitationTrainingStats,
  type NeuralActionRankingModel,
} from "./NeuralActionRankingPolicy";
import { executeMove, type Move } from "./MoveHandler";
import {
  collectActionRankingImitationDataset,
  type ActionRankingImitationExample,
} from "./ActionRankingImitation";

export type NeuralTrainingOptions = {
  playerCount?: number;
  hiddenSize?: number;
  hiddenLayerSizes?: number[];
  initialModel?: NeuralActionRankingModel;
  seed?: string;
  imitationDeals?: number;
  imitationEpochs?: number;
  imitationLearningRate?: number;
  imitationEquivalentTargets?: boolean;
  rlEpisodes?: number;
  rlLearningRate?: number;
  rlTemperature?: number;
  rlLocalRewardWeight?: number;
  rlLocalRewardDiscount?: number;
  rlBaselineMode?: "teacher" | "greedy";
  rlCommonRandom?: boolean;
  rlCreditMode?: "episode" | "counterfactual";
  rlCounterfactualRolloutCount?: number;
  rlCounterfactualRolloutMoves?: number;
  rlCounterfactualMinReturnGap?: number;
  rlCounterfactualTrainingMode?: "policy_gradient" | "pairwise" | "value";
  rlCounterfactualValueTargetScale?: number;
  rlCounterfactualValueCenterTargets?: boolean;
  rlCounterfactualValueHuberDelta?: number;
  rlUpdateEpochs?: number;
  rlUpdateScope?: "all" | "exploratory";
  rlNormalizeAdvantages?: boolean;
  rlAdvantageClip?: number;
  improvementStates?: number;
  improvementStateSource?: "teacher" | "policy";
  improvementStateTemperature?: number;
  improvementStateSample?: boolean;
  improvementCandidateLimit?: number;
  improvementRolloutMoves?: number;
  improvementRolloutCount?: number;
  improvementCommonRandom?: boolean;
  improvementTrainingMode?: "softmax" | "pairwise" | "value";
  improvementMinReturnGap?: number;
  improvementMaxPairsPerExample?: number;
  improvementPreferenceTemperature?: number;
  improvementPreferenceScope?: "all" | "behavior";
  improvementValueTargetScale?: number;
  improvementValueCenterTargets?: boolean;
  improvementValueHuberDelta?: number;
  improvementRequireBehaviorGap?: boolean;
  improvementMinBehaviorImprovement?: number;
  improvementEpochs?: number;
  improvementLearningRate?: number;
  improvementTargetTemperature?: number;
  maxMovesPerGame?: number;
};

export type NeuralTrainingResult = {
  model: NeuralActionRankingModel;
  imitation: {
    examples: number;
    candidates: number;
    matchedTeacherMoveCount: number;
    unmatchedTeacherMoveCount: number;
    stats: ImitationTrainingStats;
  };
  improvement: {
    examples: number;
    candidates: number;
    averageTeacherReturn: number;
    averageBehaviorReturn: number;
    averageBestReturn: number;
    averageImprovement: number;
    averageBestBehaviorImprovement: number;
    averageCandidateReturnStdDev: number;
    skippedBehaviorGapCount: number;
    scannedStateCount: number;
    stats: ImitationTrainingStats;
  };
  reinforcement: {
    episodes: number;
    averageFinalPointDifferential: number;
    averageTeacherBaselinePointDifferential: number;
    averageGreedyBaselinePointDifferential: number;
    averageBaselinePointDifferential: number;
    averageBaselineAdjustedReturn: number;
    averageSampleMinusGreedyReturn: number;
    averageSampledDecisionCount: number;
    averageExploratoryDecisionCount: number;
    averageCounterfactualReturnGap: number;
    counterfactualTrainingUpdates: number;
    counterfactualUpdateCount: number;
    averagePolicyUpdates: number;
    averageGradientUpdates: number;
    averageRawAdvantage: number;
    rawAdvantageStdDev: number;
  };
  evaluation: PolicyEvaluationResult;
};

export type PolicyEvaluationResult = {
  games: number;
  averageNeuralPointDifferential: number;
  averageTeacherBaselinePointDifferential: number;
  averageBaselineAdjustedPointDifferential: number;
  neuralWinRate: number;
  averageNeuralScore: number;
  averageTeacherScore: number;
  averageNeuralDecisionCount: number;
  averageTeacherBaselineDecisionCount: number;
  averageNeuralCenterMoveRate: number;
  averageTeacherBaselineCenterMoveRate: number;
  averageNeuralSolitaireMoveRate: number;
  averageTeacherBaselineSolitaireMoveRate: number;
  averageNeuralCycleMoveRate: number;
  averageTeacherBaselineCycleMoveRate: number;
  averageNeuralPounceRemaining: number;
  averageTeacherBaselinePounceRemaining: number;
  neuralPounceOutRate: number;
  teacherBaselinePounceOutRate: number;
};

export type PolicyComparisonResult = {
  games: number;
  averageModelAPointDifferential: number;
  averageModelBPointDifferential: number;
  averagePointDifferentialDelta: number;
  pointDifferentialDeltaStandardError: number;
  modelABetterRate: number;
  modelBBetterRate: number;
  tiedPointDifferentialRate: number;
  averageModelAScore: number;
  averageModelBScore: number;
  averageScoreDelta: number;
  averageModelADecisionCount: number;
  averageModelBDecisionCount: number;
  averageModelACenterMoveRate: number;
  averageModelBCenterMoveRate: number;
  averageModelASolitaireMoveRate: number;
  averageModelBSolitaireMoveRate: number;
  averageModelACycleMoveRate: number;
  averageModelBCycleMoveRate: number;
  averageModelAPounceRemaining: number;
  averageModelBPounceRemaining: number;
  modelAPounceOutRate: number;
  modelBPounceOutRate: number;
};

type RolloutTransition = {
  playerIndex: number;
  pointDifferentialBefore: number;
  board?: BoardState;
  candidates: ActionRankingCandidate[];
  selectedCandidateIndex: number;
  greedyCandidateIndex: number;
  localReward: number;
};

type RolloutResult = {
  finalScores: number[];
  finalPointDifferentials: number[];
  finalPounceCounts: number[];
  moveTypeCountsByPlayer: MoveTypeCounts[];
  transitions: RolloutTransition[];
};

type PolicyGradientUpdate = {
  candidates: ActionRankingCandidate[];
  selectedCandidateIndex: number;
  rawAdvantage: number;
};

type PolicyGradientBaselineMode = "teacher" | "greedy";
type PolicyGradientCreditMode = "episode" | "counterfactual";
type CounterfactualTrainingMode = "policy_gradient" | "pairwise" | "value";
type PolicyGradientUpdateScope = "all" | "exploratory";

type RewardImprovementCandidate = ActionRankingCandidate & {
  rolloutPointDifferential: number;
  rolloutPointDifferentialReturn: number;
};

type RewardImprovementCollection = {
  examples: ActionRankingImitationExample[];
  averageTeacherReturn: number;
  averageBehaviorReturn: number;
  averageBestReturn: number;
  averageImprovement: number;
  averageBestBehaviorImprovement: number;
  averageCandidateReturnStdDev: number;
  skippedBehaviorGapCount: number;
  scannedStateCount: number;
};

type RewardImprovementExampleResult = {
  example: ActionRankingImitationExample | null;
  skippedForBehaviorGap: boolean;
  teacherReturn: number | null;
  behaviorReturn: number | null;
  bestReturn: number | null;
  bestBehaviorImprovement: number;
  candidateReturnStdDev: number;
};

const SUITS: Suits[] = ["hearts", "spades", "diamonds", "clubs"];
const VALUES: Values[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const DEFAULT_MAX_MOVES_PER_GAME = 1800;
const MOVE_TYPES: Move["type"][] = [
  "c2c",
  "c2s",
  "s2s",
  "cycle",
  "flip_deck",
  "move_field_stack",
];

type MoveTypeCounts = Record<Move["type"], number>;

export function trainNeuralActionRankingPolicy(
  options: NeuralTrainingOptions = {}
): NeuralTrainingResult {
  const playerCount = options.playerCount ?? 4;
  const seed = options.seed ?? "action-ranking-training";
  const imitationDeals = options.imitationDeals ?? 24;
  const imitationEpochs = options.imitationEpochs ?? 4;
  const rlEpisodes = options.rlEpisodes ?? 32;
  const improvementStates = options.improvementStates ?? 0;
  const maxMovesPerGame = options.maxMovesPerGame ?? DEFAULT_MAX_MOVES_PER_GAME;
  const policy = options.initialModel
    ? new NeuralActionRankingPolicy(options.initialModel)
    : NeuralActionRankingPolicy.create({
        hiddenSize: options.hiddenSize,
        hiddenLayerSizes: options.hiddenLayerSizes,
        seed,
      });

  const imitationExamples = collectImitationExamplesFromDeals({
    playerCount,
    dealCount: imitationDeals,
    seed: `${seed}:imitation`,
    maxMovesPerGame,
  });
  const imitationStats = policy.trainImitation(imitationExamples, {
    epochs: imitationEpochs,
    learningRate: options.imitationLearningRate,
    equivalentTargets: options.imitationEquivalentTargets ?? false,
    shuffleSeed: `${seed}:imitation-shuffle`,
  });

  const improvement = collectRewardImprovementExamples({
    playerCount,
    maxStates: improvementStates,
    stateSource: options.improvementStateSource ?? "teacher",
    statePolicy: policy,
    stateTemperature: options.improvementStateTemperature ?? 1,
    stateSample: options.improvementStateSample ?? false,
    candidateLimit: options.improvementCandidateLimit ?? 6,
    rolloutMoves: options.improvementRolloutMoves ?? 450,
    rolloutCount: options.improvementRolloutCount ?? 1,
    commonRandom: options.improvementCommonRandom ?? true,
    requireBehaviorGap: options.improvementRequireBehaviorGap ?? false,
    minBehaviorImprovement: options.improvementMinBehaviorImprovement ?? 2,
    seed: `${seed}:improvement`,
    maxMovesPerGame,
  });
  const improvementStats =
    improvement.examples.length === 0
      ? emptyTrainingStats(options.improvementEpochs ?? 0)
      : trainImprovementExamples(policy, improvement.examples, {
          mode: options.improvementTrainingMode ?? "softmax",
          epochs: options.improvementEpochs ?? 3,
          learningRate: options.improvementLearningRate ?? 0.01,
          minReturnGap: options.improvementMinReturnGap ?? 1,
          maxPairsPerExample: options.improvementMaxPairsPerExample ?? 12,
          preferenceTemperature: options.improvementPreferenceTemperature ?? 1,
          preferenceScope: options.improvementPreferenceScope ?? "all",
          targetTemperature: options.improvementTargetTemperature ?? 4,
          valueTargetScale: options.improvementValueTargetScale ?? 4,
          valueCenterTargets: options.improvementValueCenterTargets ?? true,
          valueHuberDelta: options.improvementValueHuberDelta ?? 0,
          shuffleSeed: `${seed}:improvement-shuffle`,
        });

  const reinforcement = trainPolicyGradientFromRollouts(policy, {
    playerCount,
    episodes: rlEpisodes,
    seed: `${seed}:rl`,
    learningRate: options.rlLearningRate ?? 0.001,
    temperature: options.rlTemperature ?? 0.85,
    localRewardWeight: options.rlLocalRewardWeight ?? 0.15,
    localRewardDiscount: options.rlLocalRewardDiscount ?? 0,
    baselineMode: options.rlBaselineMode ?? "teacher",
    commonRandom: options.rlCommonRandom ?? true,
    creditMode: options.rlCreditMode ?? "episode",
    counterfactualRolloutCount: options.rlCounterfactualRolloutCount ?? 1,
    counterfactualRolloutMoves:
      options.rlCounterfactualRolloutMoves ?? Math.min(450, maxMovesPerGame),
    counterfactualMinReturnGap: options.rlCounterfactualMinReturnGap ?? 1,
    counterfactualTrainingMode:
      options.rlCounterfactualTrainingMode ?? "policy_gradient",
    counterfactualValueTargetScale:
      options.rlCounterfactualValueTargetScale ?? 4,
    counterfactualValueCenterTargets:
      options.rlCounterfactualValueCenterTargets ?? true,
    counterfactualValueHuberDelta:
      options.rlCounterfactualValueHuberDelta ?? 0,
    updateEpochs: options.rlUpdateEpochs ?? 1,
    updateScope: options.rlUpdateScope ?? "all",
    normalizeAdvantages: options.rlNormalizeAdvantages ?? true,
    advantageClip: options.rlAdvantageClip ?? 3,
    maxMovesPerGame,
  });

  return {
    model: policy.getModel(),
    imitation: {
      examples: imitationExamples.length,
      candidates: imitationExamples.reduce(
        (sum, example) => sum + example.candidates.length,
        0
      ),
      matchedTeacherMoveCount: imitationExamples.filter(
        (example) =>
          example.selectedCandidateIndex != null &&
          example.selectedCandidateIndex >= 0
      ).length,
      unmatchedTeacherMoveCount: imitationExamples.filter(
        (example) =>
          example.selectedActionKey != null &&
          (example.selectedCandidateIndex == null ||
            example.selectedCandidateIndex < 0)
      ).length,
      stats: imitationStats,
    },
    improvement: {
      examples: improvement.examples.length,
      candidates: improvement.examples.reduce(
        (sum, example) => sum + example.candidates.length,
        0
      ),
      averageTeacherReturn: improvement.averageTeacherReturn,
      averageBehaviorReturn: improvement.averageBehaviorReturn,
      averageBestReturn: improvement.averageBestReturn,
      averageImprovement: improvement.averageImprovement,
      averageBestBehaviorImprovement:
        improvement.averageBestBehaviorImprovement,
      averageCandidateReturnStdDev: improvement.averageCandidateReturnStdDev,
      skippedBehaviorGapCount: improvement.skippedBehaviorGapCount,
      scannedStateCount: improvement.scannedStateCount,
      stats: improvementStats,
    },
    reinforcement,
    evaluation: evaluateNeuralPolicy(policy, {
      playerCount,
      games: 12,
      seed: `${seed}:eval`,
      maxMovesPerGame,
    }),
  };
}

export function collectRewardImprovementExamples(options: {
  playerCount: number;
  maxStates: number;
  stateSource: "teacher" | "policy";
  statePolicy?: NeuralActionRankingPolicy;
  stateTemperature: number;
  stateSample: boolean;
  candidateLimit: number;
  rolloutMoves: number;
  rolloutCount: number;
  commonRandom: boolean;
  requireBehaviorGap: boolean;
  minBehaviorImprovement: number;
  seed: string;
  maxMovesPerGame: number;
}): RewardImprovementCollection {
  if (options.maxStates <= 0 || options.candidateLimit <= 0) {
    return {
      examples: [],
      averageTeacherReturn: 0,
      averageBehaviorReturn: 0,
      averageBestReturn: 0,
      averageImprovement: 0,
      averageBestBehaviorImprovement: 0,
      averageCandidateReturnStdDev: 0,
      skippedBehaviorGapCount: 0,
      scannedStateCount: 0,
    };
  }

  const examples: ActionRankingImitationExample[] = [];
  let teacherReturnTotal = 0;
  let behaviorReturnTotal = 0;
  let bestReturnTotal = 0;
  let bestBehaviorImprovementTotal = 0;
  let candidateReturnStdDevTotal = 0;
  let skippedBehaviorGapCount = 0;
  let scannedStateCount = 0;
  let dealIndex = 0;
  const maxScannedStateCount = options.requireBehaviorGap
    ? options.maxStates * 20
    : Number.POSITIVE_INFINITY;

  while (
    examples.length < options.maxStates &&
    scannedStateCount < maxScannedStateCount
  ) {
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${dealIndex}`
    );
    const random = createSeededRandom(`${options.seed}:states:${dealIndex}`);
    const neuralPlayerIndex =
      options.stateSource === "policy" ? dealIndex % options.playerCount : -1;
    const activePlayerIndices = getActivePlayerIndices(board);
    const cooldowns = board.players.map((_, playerIndex) =>
      activePlayerIndices.includes(playerIndex)
        ? random()
        : Number.POSITIVE_INFINITY
    );

    for (
      let stepIndex = 0;
      !isGameOver(board) &&
      stepIndex < options.maxMovesPerGame &&
      examples.length < options.maxStates &&
      scannedStateCount < maxScannedStateCount;
      stepIndex++
    ) {
      const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
      if (playerIndex < 0) {
        break;
      }

      const teacherMove = getBasicAIMove(board, playerIndex, {});
      const candidates = enumerateActionRankingCandidates(board, playerIndex);
      const behaviorMove = getImprovementStateBehaviorMove(
        board,
        playerIndex,
        neuralPlayerIndex,
        candidates,
        teacherMove,
        options,
        random
      );
      const shouldCollect =
        options.stateSource === "teacher" || playerIndex === neuralPlayerIndex;
      if (shouldCollect && behaviorMove && candidates.length > 1) {
        scannedStateCount += 1;
        const behaviorKey = getActionRankingMoveKey(behaviorMove);
        const teacherKey = teacherMove
          ? getActionRankingMoveKey(teacherMove)
          : null;
        const selectedCandidates = selectImprovementCandidates(
          candidates,
          [behaviorKey, teacherKey].filter((key): key is string => key != null),
          options.candidateLimit,
          random
        );
        const result = createRewardImprovementExample(
          board,
          dealIndex,
          stepIndex,
          playerIndex,
          selectedCandidates,
          behaviorMove,
          teacherMove,
          `${options.seed}:rollout:${dealIndex}:${stepIndex}`,
          options.rolloutMoves,
          options.rolloutCount,
          options.commonRandom,
          options.requireBehaviorGap,
          options.minBehaviorImprovement
        );
        if (result.skippedForBehaviorGap) {
          skippedBehaviorGapCount += 1;
        }
        if (result.example) {
          teacherReturnTotal += result.teacherReturn ?? 0;
          behaviorReturnTotal += result.behaviorReturn ?? 0;
          bestReturnTotal += result.bestReturn ?? 0;
          bestBehaviorImprovementTotal += result.bestBehaviorImprovement;
          candidateReturnStdDevTotal += result.candidateReturnStdDev;
          examples.push(result.example);
        }
      }

      if (behaviorMove) {
        executeMove(board, playerIndex, behaviorMove);
      }
      cooldowns[playerIndex] += getMoveDelay(behaviorMove?.type, random);
    }
    dealIndex += 1;
  }

  const averageTeacherReturn =
    examples.length === 0 ? 0 : teacherReturnTotal / examples.length;
  const averageBestReturn =
    examples.length === 0 ? 0 : bestReturnTotal / examples.length;

  return {
    examples,
    averageTeacherReturn,
    averageBehaviorReturn:
      examples.length === 0 ? 0 : behaviorReturnTotal / examples.length,
    averageBestReturn,
    averageImprovement: averageBestReturn - averageTeacherReturn,
    averageBestBehaviorImprovement:
      examples.length === 0
        ? 0
        : bestBehaviorImprovementTotal / examples.length,
    averageCandidateReturnStdDev:
      examples.length === 0 ? 0 : candidateReturnStdDevTotal / examples.length,
    skippedBehaviorGapCount,
    scannedStateCount,
  };
}

function trainImprovementExamples(
  policy: NeuralActionRankingPolicy,
  examples: ActionRankingImitationExample[],
  options: {
    mode: "softmax" | "pairwise" | "value";
    epochs: number;
    learningRate: number;
    minReturnGap: number;
    maxPairsPerExample: number;
    preferenceTemperature: number;
    preferenceScope: "all" | "behavior";
    targetTemperature: number;
    valueTargetScale: number;
    valueCenterTargets: boolean;
    valueHuberDelta: number;
    shuffleSeed: string;
  }
): ImitationTrainingStats {
  if (options.mode === "pairwise") {
    return policy.trainPairwisePreferences(examples, {
      epochs: options.epochs,
      learningRate: options.learningRate,
      minReturnGap: options.minReturnGap,
      maxPairsPerExample: options.maxPairsPerExample,
      temperature: options.preferenceTemperature,
      preferenceScope: options.preferenceScope,
      shuffleSeed: options.shuffleSeed,
    });
  }

  if (options.mode === "value") {
    return policy.trainValueRegression(examples, {
      epochs: options.epochs,
      learningRate: options.learningRate,
      targetScale: options.valueTargetScale,
      centerTargets: options.valueCenterTargets,
      huberDelta: options.valueHuberDelta,
      shuffleSeed: options.shuffleSeed,
    });
  }

  return policy.trainRewardTargets(examples, {
    epochs: options.epochs,
    learningRate: options.learningRate,
    targetTemperature: options.targetTemperature,
    shuffleSeed: options.shuffleSeed,
  });
}

function createRewardImprovementExample(
  board: BoardState,
  trialIndex: number,
  stepIndex: number,
  playerIndex: number,
  candidates: ActionRankingCandidate[],
  behaviorMove: Move,
  teacherMove: Move | undefined,
  seed: string,
  rolloutMoves: number,
  rolloutCount: number,
  commonRandom: boolean,
  requireBehaviorGap: boolean,
  minBehaviorImprovement: number
): RewardImprovementExampleResult {
  const pointDifferentialBefore = getPointDifferential(board, playerIndex);
  const behaviorKey = getActionRankingMoveKey(behaviorMove);
  const teacherKey = teacherMove ? getActionRankingMoveKey(teacherMove) : null;
  const improvedCandidates = candidates.map<RewardImprovementCandidate>(
    (candidate, candidateIndex) => {
      const finalPointDifferential = getCounterfactualPointDifferential(
        board,
        playerIndex,
        candidate.move,
        getCounterfactualSeeds(seed, candidateIndex, rolloutCount, commonRandom),
        rolloutMoves
      );
      return {
        ...candidate,
        rolloutPointDifferential: finalPointDifferential,
        rolloutPointDifferentialReturn:
          finalPointDifferential - pointDifferentialBefore,
      };
    }
  );
  const bestIndex = improvedCandidates.reduce((best, candidate, index) => {
    return index === 0 ||
      candidate.rolloutPointDifferential >
        improvedCandidates[best].rolloutPointDifferential
      ? index
      : best;
  }, 0);
  if (bestIndex < 0) {
    return {
      example: null,
      skippedForBehaviorGap: false,
      teacherReturn: null,
      behaviorReturn: null,
      bestReturn: null,
      bestBehaviorImprovement: 0,
      candidateReturnStdDev: 0,
    };
  }

  const teacherReturn =
    teacherKey == null
      ? null
      : improvedCandidates.find((candidate) => candidate.key === teacherKey)
          ?.rolloutPointDifferentialReturn ?? null;
  const behaviorReturn =
    improvedCandidates.find((candidate) => candidate.key === behaviorKey)
      ?.rolloutPointDifferentialReturn ?? null;
  const bestReturn =
    improvedCandidates[bestIndex].rolloutPointDifferentialReturn;
  const bestBehaviorImprovement =
    behaviorReturn == null ? 0 : bestReturn - behaviorReturn;
  const candidateReturnStdDev =
    getImprovementCandidateReturnStdDev(improvedCandidates);

  if (
    requireBehaviorGap &&
    bestBehaviorImprovement < minBehaviorImprovement
  ) {
    return {
      example: null,
      skippedForBehaviorGap: true,
      teacherReturn,
      behaviorReturn,
      bestReturn,
      bestBehaviorImprovement,
      candidateReturnStdDev,
    };
  }

  const example: ActionRankingImitationExample = {
    trialIndex,
    stepIndex,
    playerIndex,
    playerPointDifferential: pointDifferentialBefore,
    finalPlayerPoints: null,
    finalPointDifferential: improvedCandidates[bestIndex].rolloutPointDifferential,
    pointDifferentialReturn: bestReturn,
    teacherActionKey: teacherKey,
    teacherPointDifferentialReturn: teacherReturn,
    behaviorActionKey: behaviorKey,
    behaviorPointDifferentialReturn: behaviorReturn,
    selectedActionKey: improvedCandidates[bestIndex].key,
    selectedCandidateIndex: bestIndex,
    candidates: improvedCandidates.map((candidate) => ({
      key: candidate.key,
      equivalenceKey: candidate.equivalenceKey,
      move: candidate.move,
      features: candidate.features,
      label: candidate.key === improvedCandidates[bestIndex].key ? 1 : 0,
      immediatePointDelta: candidate.immediatePointDelta,
      immediatePointDifferentialDelta:
        candidate.immediatePointDifferentialDelta,
      rolloutPointDifferential: candidate.rolloutPointDifferential,
      rolloutPointDifferentialReturn: candidate.rolloutPointDifferentialReturn,
      endsRound: candidate.endsRound,
    })),
  };
  return {
    example,
    skippedForBehaviorGap: false,
    teacherReturn,
    behaviorReturn,
    bestReturn,
    bestBehaviorImprovement,
    candidateReturnStdDev,
  };
}

function getCounterfactualPointDifferential(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seeds: readonly string[],
  maxMoves: number
): number {
  const safeSeeds = seeds.length > 0 ? seeds : ["counterfactual"];
  const total = safeSeeds.reduce((sum, seed) => {
    const nextBoard = deepClone(board);
    executeMove(nextBoard, playerIndex, move);
    runTeacherContinuation(nextBoard, seed, maxMoves);
    return sum + getPointDifferential(nextBoard, playerIndex);
  }, 0);
  return total / safeSeeds.length;
}

function getCounterfactualSeeds(
  seed: string,
  candidateIndex: number,
  rolloutCount: number,
  commonRandom: boolean
): string[] {
  const count = Math.max(1, Math.floor(rolloutCount));
  return Array.from({ length: count }, (_, rolloutIndex) =>
    commonRandom
      ? `${seed}:common:${rolloutIndex}`
      : `${seed}:candidate:${candidateIndex}:rollout:${rolloutIndex}`
  );
}

function getImprovementStateBehaviorMove(
  board: BoardState,
  playerIndex: number,
  neuralPlayerIndex: number,
  candidates: ActionRankingCandidate[],
  teacherMove: Move | undefined,
  options: {
    stateSource: "teacher" | "policy";
    statePolicy?: NeuralActionRankingPolicy;
    stateTemperature: number;
    stateSample: boolean;
  },
  random: () => number
): Move | undefined {
  if (
    options.stateSource === "policy" &&
    playerIndex === neuralPlayerIndex &&
    options.statePolicy &&
    candidates.length > 0
  ) {
    return options.statePolicy.chooseCandidate(candidates, {
      temperature: options.stateTemperature,
      random,
      sample: options.stateSample,
    })?.move;
  }

  return teacherMove;
}

function selectImprovementCandidates(
  candidates: ActionRankingCandidate[],
  requiredKeys: readonly string[],
  limit: number,
  random: () => number
): ActionRankingCandidate[] {
  if (candidates.length <= limit) {
    return candidates;
  }

  const selected: ActionRankingCandidate[] = [];
  requiredKeys.forEach((requiredKey) => {
    const requiredCandidate = candidates.find(
      (candidate) => candidate.key === requiredKey
    );
    if (
      requiredCandidate &&
      !selected.some((candidate) => candidate.key === requiredCandidate.key)
    ) {
      selected.push(requiredCandidate);
    }
  });

  candidates
    .slice()
    .sort(
      (a, b) =>
        b.immediatePointDifferentialDelta -
          a.immediatePointDifferentialDelta || random() - 0.5
    )
    .forEach((candidate) => {
      if (
        selected.length < Math.max(1, Math.floor(limit / 2)) &&
        !selected.some((item) => item.key === candidate.key)
      ) {
        selected.push(candidate);
      }
    });

  shuffleCopy(candidates, random).forEach((candidate) => {
    if (
      selected.length < limit &&
      !selected.some((item) => item.key === candidate.key)
    ) {
      selected.push(candidate);
    }
  });

  return selected;
}

function getImprovementCandidateReturnStdDev(
  candidates: readonly { rolloutPointDifferentialReturn?: number | null }[]
): number {
  const returns = candidates
    .map((candidate) => candidate.rolloutPointDifferentialReturn)
    .filter((value): value is number => value != null);
  if (returns.length <= 1) {
    return 0;
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) /
    (returns.length - 1);
  return Math.sqrt(variance);
}

function runTeacherContinuation(
  board: BoardState,
  seed: string,
  maxMoves: number
): void {
  const random = createSeededRandom(seed);
  const activePlayerIndices = getActivePlayerIndices(board);
  const cooldowns = board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? random()
      : Number.POSITIVE_INFINITY
  );

  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.players.forEach((player, playerIndex) => {
    if (activePlayerIndices.includes(playerIndex)) {
      player.socketId = null;
    }
  });

  for (let moveCount = 0; !isGameOver(board) && moveCount < maxMoves; moveCount++) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }
    const move = getBasicAIMove(board, playerIndex, {});
    if (move) {
      executeMove(board, playerIndex, move);
    }
    cooldowns[playerIndex] += getMoveDelay(move?.type, random);
  }
}

function getActivePlayerIndices(board: BoardState): number[] {
  return board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);
}

function emptyTrainingStats(epochs: number): ImitationTrainingStats {
  return {
    epochs,
    examples: 0,
    updates: 0,
    averageLoss: 0,
    accuracy: 0,
  };
}

function shuffleCopy<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function collectImitationExamplesFromDeals(options: {
  playerCount: number;
  dealCount: number;
  seed: string;
  maxMovesPerGame: number;
}): ActionRankingImitationExample[] {
  const examples: ActionRankingImitationExample[] = [];
  for (let dealIndex = 0; dealIndex < options.dealCount; dealIndex++) {
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${dealIndex}`
    );
    const dataset = collectActionRankingImitationDataset(board, {
      maxTrials: 1,
      maxMovesPerTrial: options.maxMovesPerGame,
      seed: `${options.seed}:rollout:${dealIndex}`,
    });
    examples.push(...dataset.examples);
  }
  return examples;
}

export function trainPolicyGradientFromRollouts(
  policy: NeuralActionRankingPolicy,
  options: {
    playerCount: number;
    episodes: number;
    seed: string;
    learningRate: number;
    temperature: number;
    localRewardWeight: number;
    localRewardDiscount: number;
    baselineMode: PolicyGradientBaselineMode;
    commonRandom: boolean;
    creditMode: PolicyGradientCreditMode;
    counterfactualRolloutCount: number;
    counterfactualRolloutMoves: number;
    counterfactualMinReturnGap: number;
    counterfactualTrainingMode: CounterfactualTrainingMode;
    counterfactualValueTargetScale: number;
    counterfactualValueCenterTargets: boolean;
    counterfactualValueHuberDelta: number;
    updateEpochs: number;
    updateScope: PolicyGradientUpdateScope;
    normalizeAdvantages: boolean;
    advantageClip: number;
    maxMovesPerGame: number;
  }
) {
  let finalPointDifferentialTotal = 0;
  let teacherBaselinePointDifferentialTotal = 0;
  let greedyBaselinePointDifferentialTotal = 0;
  let baselinePointDifferentialTotal = 0;
  let baselineAdjustedReturnTotal = 0;
  let sampleMinusGreedyReturnTotal = 0;
  let sampledDecisionCountTotal = 0;
  let exploratoryDecisionCountTotal = 0;
  let counterfactualReturnGapTotal = 0;
  let counterfactualUpdateCount = 0;
  const updates: PolicyGradientUpdate[] = [];
  const counterfactualExamples: ActionRankingImitationExample[] = [];
  const baselineMode = options.baselineMode;
  const updateScope = options.updateScope;
  const creditMode = options.creditMode;

  for (let episode = 0; episode < options.episodes; episode++) {
    const neuralPlayerIndex = episode % options.playerCount;
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${episode}`
    );
    const sharedTimingSeed = `${options.seed}:timing:${episode}`;
    const teacherTimingSeed = options.commonRandom
      ? sharedTimingSeed
      : `${options.seed}:teacher-timing:${episode}`;
    const greedyTimingSeed = options.commonRandom
      ? sharedTimingSeed
      : `${options.seed}:greedy-timing:${episode}`;
    const sampleTimingSeed = options.commonRandom
      ? sharedTimingSeed
      : `${options.seed}:sample-timing:${episode}`;
    const teacherBaseline = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(teacherTimingSeed),
      temperature: 1,
      sample: false,
      maxMovesPerGame: options.maxMovesPerGame,
      neuralPlayerIndices: [],
    });
    const teacherBaselineDifferential =
      teacherBaseline.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const greedyBaseline = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(greedyTimingSeed),
      decisionRandom: createSeededRandom(`${options.seed}:greedy:${episode}`),
      temperature: 1,
      sample: false,
      maxMovesPerGame: options.maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
    });
    const greedyBaselineDifferential =
      greedyBaseline.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const rollout = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(sampleTimingSeed),
      decisionRandom: createSeededRandom(`${options.seed}:sample:${episode}`),
      temperature: options.temperature,
      sample: true,
      maxMovesPerGame: options.maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
      captureTransitionBoards: creditMode === "counterfactual",
    });
    const finalDifferential =
      rollout.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const baselineDifferential =
      baselineMode === "greedy"
        ? greedyBaselineDifferential
        : teacherBaselineDifferential;
    const baselineAdjustedReturn =
      finalDifferential - baselineDifferential;
    const sampleMinusGreedyReturn =
      finalDifferential - greedyBaselineDifferential;

    const localRewardReturns = getDiscountedLocalRewardReturns(
      rollout.transitions,
      options.localRewardDiscount
    );
    sampledDecisionCountTotal += rollout.transitions.length;
    rollout.transitions.forEach((transition, transitionIndex) => {
      const isExploratoryDecision =
        transition.selectedCandidateIndex !== transition.greedyCandidateIndex;
      if (isExploratoryDecision) {
        exploratoryDecisionCountTotal += 1;
      }
      if (updateScope === "exploratory" && !isExploratoryDecision) {
        return;
      }
      if (creditMode === "counterfactual") {
        const result = getCounterfactualTransitionAdvantage(
          transition,
          policy,
          `${options.seed}:counterfactual:${episode}:${transitionIndex}`,
          options.counterfactualRolloutCount,
          options.commonRandom,
          options.counterfactualRolloutMoves
        );
        if (
          !result ||
          Math.abs(result.returnGap) < options.counterfactualMinReturnGap
        ) {
          return;
        }
        counterfactualReturnGapTotal += Math.abs(result.returnGap);
        counterfactualUpdateCount += 1;
        if (options.counterfactualTrainingMode === "pairwise") {
          counterfactualExamples.push(
            createCounterfactualPreferenceExample(
              transition,
              result,
              episode,
              transitionIndex
            )
          );
          return;
        }
        updates.push({
          candidates: transition.candidates,
          selectedCandidateIndex: transition.selectedCandidateIndex,
          rawAdvantage:
            result.returnGap +
            options.localRewardWeight * localRewardReturns[transitionIndex],
        });
        return;
      }
      updates.push({
        candidates: transition.candidates,
        selectedCandidateIndex: transition.selectedCandidateIndex,
        rawAdvantage:
          baselineAdjustedReturn +
          options.localRewardWeight * localRewardReturns[transitionIndex],
      });
    });

    finalPointDifferentialTotal += finalDifferential;
    teacherBaselinePointDifferentialTotal += teacherBaselineDifferential;
    greedyBaselinePointDifferentialTotal += greedyBaselineDifferential;
    baselinePointDifferentialTotal += baselineDifferential;
    baselineAdjustedReturnTotal += baselineAdjustedReturn;
    sampleMinusGreedyReturnTotal += sampleMinusGreedyReturn;
  }

  const advantageStats =
    counterfactualExamples.length > 0 &&
    options.counterfactualTrainingMode !== "policy_gradient"
      ? trainCounterfactualSupervisedBatch(policy, counterfactualExamples, {
          mode: options.counterfactualTrainingMode,
          learningRate: options.learningRate,
          updateEpochs: options.updateEpochs,
          minReturnGap: options.counterfactualMinReturnGap,
          valueTargetScale: options.counterfactualValueTargetScale,
          valueCenterTargets: options.counterfactualValueCenterTargets,
          valueHuberDelta: options.counterfactualValueHuberDelta,
          shuffleSeed: `${options.seed}:counterfactual-shuffle`,
        })
      : applyPolicyGradientBatch(policy, updates, {
          learningRate: options.learningRate,
          temperature: options.temperature,
          updateEpochs: options.updateEpochs,
          shuffleSeed: `${options.seed}:update-shuffle`,
          normalizeAdvantages: options.normalizeAdvantages,
          advantageClip: options.advantageClip,
        });

  return {
    episodes: options.episodes,
    averageFinalPointDifferential:
      options.episodes === 0
        ? 0
        : finalPointDifferentialTotal / options.episodes,
    averageTeacherBaselinePointDifferential:
      options.episodes === 0
        ? 0
        : teacherBaselinePointDifferentialTotal / options.episodes,
    averageGreedyBaselinePointDifferential:
      options.episodes === 0
        ? 0
        : greedyBaselinePointDifferentialTotal / options.episodes,
    averageBaselinePointDifferential:
      options.episodes === 0
        ? 0
        : baselinePointDifferentialTotal / options.episodes,
    averageBaselineAdjustedReturn:
      options.episodes === 0
        ? 0
        : baselineAdjustedReturnTotal / options.episodes,
    averageSampleMinusGreedyReturn:
      options.episodes === 0
        ? 0
        : sampleMinusGreedyReturnTotal / options.episodes,
    averageSampledDecisionCount:
      options.episodes === 0 ? 0 : sampledDecisionCountTotal / options.episodes,
    averageExploratoryDecisionCount:
      options.episodes === 0
        ? 0
        : exploratoryDecisionCountTotal / options.episodes,
    averageCounterfactualReturnGap:
      counterfactualUpdateCount === 0
        ? 0
        : counterfactualReturnGapTotal / counterfactualUpdateCount,
    counterfactualTrainingUpdates: advantageStats.appliedUpdates,
    counterfactualUpdateCount,
    averagePolicyUpdates:
      options.episodes === 0 ? 0 : updates.length / options.episodes,
    averageGradientUpdates:
      options.episodes === 0
        ? 0
        : advantageStats.appliedUpdates / options.episodes,
    averageRawAdvantage: advantageStats.mean,
    rawAdvantageStdDev: advantageStats.stdDev,
  };
}

function applyPolicyGradientBatch(
  policy: NeuralActionRankingPolicy,
  updates: PolicyGradientUpdate[],
  options: {
    learningRate: number;
    temperature: number;
    updateEpochs: number;
    shuffleSeed: string;
    normalizeAdvantages: boolean;
    advantageClip: number;
  }
) {
  const mean =
    updates.length === 0
      ? 0
      : updates.reduce((sum, update) => sum + update.rawAdvantage, 0) /
        updates.length;
  const variance =
    updates.length <= 1
      ? 0
      : updates.reduce((sum, update) => {
          const delta = update.rawAdvantage - mean;
          return sum + delta * delta;
        }, 0) /
        (updates.length - 1);
  const stdDev = Math.sqrt(variance);
  const scale = options.normalizeAdvantages
    ? Math.max(1e-6, stdDev)
    : 20;
  const clip = Math.max(0, options.advantageClip);
  const updateEpochs = Math.max(1, Math.floor(options.updateEpochs));
  const random = createSeededRandom(options.shuffleSeed);
  let appliedUpdates = 0;

  for (let epoch = 0; epoch < updateEpochs; epoch++) {
    shuffleCopy(updates, random).forEach((update) => {
      const centered = options.normalizeAdvantages
        ? update.rawAdvantage - mean
        : update.rawAdvantage;
      const normalized = centered / scale;
      const advantage =
        clip > 0 ? Math.max(-clip, Math.min(clip, normalized)) : normalized;
      policy.trainPolicyGradient(
        update.candidates,
        update.selectedCandidateIndex,
        advantage,
        options.learningRate,
        options.temperature
      );
      appliedUpdates += 1;
    });
  }

  return { mean, stdDev, appliedUpdates };
}

function trainCounterfactualSupervisedBatch(
  policy: NeuralActionRankingPolicy,
  examples: ActionRankingImitationExample[],
  options: {
    mode: "pairwise" | "value";
    learningRate: number;
    updateEpochs: number;
    minReturnGap: number;
    valueTargetScale: number;
    valueCenterTargets: boolean;
    valueHuberDelta: number;
    shuffleSeed: string;
  }
) {
  const signedGaps = examples.map((example) => {
    const selectedReturn =
      example.candidates[0]?.rolloutPointDifferentialReturn ?? 0;
    const greedyReturn =
      example.candidates[1]?.rolloutPointDifferentialReturn ?? 0;
    return selectedReturn - greedyReturn;
  });
  const stats = summarizeValues(signedGaps);
  const trainingStats =
    options.mode === "value"
      ? policy.trainValueRegression(examples, {
          epochs: options.updateEpochs,
          learningRate: options.learningRate,
          centerTargets: options.valueCenterTargets,
          targetScale: options.valueTargetScale,
          huberDelta: options.valueHuberDelta,
          shuffleSeed: options.shuffleSeed,
        })
      : policy.trainPairwisePreferences(examples, {
          epochs: options.updateEpochs,
          learningRate: options.learningRate,
          minReturnGap: options.minReturnGap,
          maxPairsPerExample: 1,
          preferenceScope: "all",
          shuffleSeed: options.shuffleSeed,
        });

  return {
    mean: stats.mean,
    stdDev: stats.stdDev,
    appliedUpdates: trainingStats.updates,
  };
}

function createCounterfactualPreferenceExample(
  transition: RolloutTransition,
  result: { selectedReturn: number; greedyReturn: number },
  episode: number,
  transitionIndex: number
): ActionRankingImitationExample {
  const selected = transition.candidates[transition.selectedCandidateIndex];
  const greedy = transition.candidates[transition.greedyCandidateIndex];
  const selectedWins = result.selectedReturn >= result.greedyReturn;
  const bestReturn = selectedWins ? result.selectedReturn : result.greedyReturn;
  const bestKey = selectedWins ? selected.key : greedy.key;

  return {
    trialIndex: episode,
    stepIndex: transitionIndex,
    playerIndex: transition.playerIndex,
    playerPointDifferential: transition.pointDifferentialBefore,
    finalPlayerPoints: null,
    finalPointDifferential: transition.pointDifferentialBefore + bestReturn,
    pointDifferentialReturn: bestReturn,
    teacherActionKey: null,
    teacherPointDifferentialReturn: null,
    behaviorActionKey: greedy.key,
    behaviorPointDifferentialReturn: result.greedyReturn,
    selectedActionKey: bestKey,
    selectedCandidateIndex: selectedWins ? 0 : 1,
    candidates: [selected, greedy].map((candidate, index) => {
      const rolloutPointDifferentialReturn =
        index === 0 ? result.selectedReturn : result.greedyReturn;
      return {
        key: candidate.key,
        equivalenceKey: candidate.equivalenceKey,
        move: candidate.move,
        features: candidate.features,
        label: candidate.key === bestKey ? 1 : 0,
        immediatePointDelta: candidate.immediatePointDelta,
        immediatePointDifferentialDelta:
          candidate.immediatePointDifferentialDelta,
        rolloutPointDifferential:
          transition.pointDifferentialBefore + rolloutPointDifferentialReturn,
        rolloutPointDifferentialReturn,
        endsRound: candidate.endsRound,
      };
    }),
  };
}

function summarizeValues(values: readonly number[]) {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length <= 1) {
    return { mean, stdDev: 0 };
  }
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) /
    (values.length - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

function getCounterfactualTransitionAdvantage(
  transition: RolloutTransition,
  policy: NeuralActionRankingPolicy,
  seed: string,
  rolloutCount: number,
  commonRandom: boolean,
  maxMoves: number
): { selectedReturn: number; greedyReturn: number; returnGap: number } | null {
  if (
    !transition.board ||
    transition.selectedCandidateIndex < 0 ||
    transition.selectedCandidateIndex >= transition.candidates.length ||
    transition.greedyCandidateIndex < 0 ||
    transition.greedyCandidateIndex >= transition.candidates.length ||
    transition.selectedCandidateIndex === transition.greedyCandidateIndex
  ) {
    return null;
  }

  const selected = transition.candidates[transition.selectedCandidateIndex];
  const greedy = transition.candidates[transition.greedyCandidateIndex];
  const selectedReturn =
    getCounterfactualPolicyPointDifferential(
      transition.board,
      transition.playerIndex,
      selected.move,
      getCounterfactualSeeds(seed, 0, rolloutCount, commonRandom),
      maxMoves,
      policy
    ) - transition.pointDifferentialBefore;
  const greedyReturn =
    getCounterfactualPolicyPointDifferential(
      transition.board,
      transition.playerIndex,
      greedy.move,
      getCounterfactualSeeds(seed, 1, rolloutCount, commonRandom),
      maxMoves,
      policy
    ) - transition.pointDifferentialBefore;

  return {
    selectedReturn,
    greedyReturn,
    returnGap: selectedReturn - greedyReturn,
  };
}

function getCounterfactualPolicyPointDifferential(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seeds: readonly string[],
  maxMoves: number,
  policy: NeuralActionRankingPolicy
): number {
  const safeSeeds = seeds.length > 0 ? seeds : ["policy-counterfactual"];
  const total = safeSeeds.reduce((sum, seed) => {
    const nextBoard = deepClone(board);
    executeMove(nextBoard, playerIndex, move);
    const rollout = runPolicyRollout(nextBoard, {
      policy,
      random: createSeededRandom(seed),
      decisionRandom: createSeededRandom(`${seed}:decision`),
      temperature: 1,
      sample: false,
      maxMovesPerGame: maxMoves,
      neuralPlayerIndices: [playerIndex],
    });
    return sum + (rollout.finalPointDifferentials[playerIndex] ?? 0);
  }, 0);
  return total / safeSeeds.length;
}

function getDiscountedLocalRewardReturns(
  transitions: readonly RolloutTransition[],
  discount: number
): number[] {
  const safeDiscount = Math.max(0, Math.min(1, discount));
  const returns = Array.from({ length: transitions.length }, () => 0);
  let runningReturn = 0;

  for (let index = transitions.length - 1; index >= 0; index--) {
    runningReturn = transitions[index].localReward + safeDiscount * runningReturn;
    returns[index] = runningReturn;
  }

  return returns;
}

export function evaluateNeuralPolicy(
  policy: NeuralActionRankingPolicy,
  options: {
    playerCount?: number;
    games?: number;
    seed?: string;
    maxMovesPerGame?: number;
  } = {}
): PolicyEvaluationResult {
  const playerCount = options.playerCount ?? 4;
  const games = options.games ?? 12;
  const seed = options.seed ?? "action-ranking-eval";
  const maxMovesPerGame = options.maxMovesPerGame ?? DEFAULT_MAX_MOVES_PER_GAME;
  let neuralDifferentialTotal = 0;
  let teacherBaselineDifferentialTotal = 0;
  let baselineAdjustedDifferentialTotal = 0;
  let neuralWins = 0;
  let neuralScoreTotal = 0;
  let teacherScoreTotal = 0;
  let neuralDecisionCountTotal = 0;
  let teacherBaselineDecisionCountTotal = 0;
  let neuralCenterMoveRateTotal = 0;
  let teacherBaselineCenterMoveRateTotal = 0;
  let neuralSolitaireMoveRateTotal = 0;
  let teacherBaselineSolitaireMoveRateTotal = 0;
  let neuralCycleMoveRateTotal = 0;
  let teacherBaselineCycleMoveRateTotal = 0;
  let neuralPounceRemainingTotal = 0;
  let teacherBaselinePounceRemainingTotal = 0;
  let neuralPounceOuts = 0;
  let teacherBaselinePounceOuts = 0;

  for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const neuralPlayerIndex = gameIndex % playerCount;
    const board = createTrainingBoard(playerCount, `${seed}:deal:${gameIndex}`);
    const teacherBaseline = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(`${seed}:baseline:${gameIndex}`),
    temperature: 1,
    sample: false,
    maxMovesPerGame,
    neuralPlayerIndices: [],
  });
    const random = createSeededRandom(`${seed}:sample:${gameIndex}`);
    const rollout = runPolicyRollout(board, {
      policy,
      random,
      temperature: 1,
      sample: false,
      maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
    });
    const neuralScore = rollout.finalScores[neuralPlayerIndex] ?? 0;
    const teacherScores = rollout.finalScores.filter(
      (_, playerIndex) => playerIndex !== neuralPlayerIndex
    );
    const averageTeacherScore =
      teacherScores.reduce((sum, value) => sum + value, 0) /
      Math.max(1, teacherScores.length);
    const neuralDifferential =
      rollout.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const teacherBaselineDifferential =
      teacherBaseline.finalPointDifferentials[neuralPlayerIndex] ?? 0;
    const neuralMoveCounts =
      rollout.moveTypeCountsByPlayer[neuralPlayerIndex] ?? createMoveTypeCounts();
    const teacherBaselineMoveCounts =
      teacherBaseline.moveTypeCountsByPlayer[neuralPlayerIndex] ??
      createMoveTypeCounts();
    const neuralDecisionCount = getTotalMoveCount(neuralMoveCounts);
    const teacherBaselineDecisionCount = getTotalMoveCount(
      teacherBaselineMoveCounts
    );
    const neuralPounceRemaining =
      rollout.finalPounceCounts[neuralPlayerIndex] ?? 0;
    const teacherBaselinePounceRemaining =
      teacherBaseline.finalPounceCounts[neuralPlayerIndex] ?? 0;
    neuralDifferentialTotal += neuralDifferential;
    teacherBaselineDifferentialTotal += teacherBaselineDifferential;
    baselineAdjustedDifferentialTotal +=
      neuralDifferential - teacherBaselineDifferential;
    neuralScoreTotal += neuralScore;
    teacherScoreTotal += averageTeacherScore;
    neuralDecisionCountTotal += neuralDecisionCount;
    teacherBaselineDecisionCountTotal += teacherBaselineDecisionCount;
    neuralCenterMoveRateTotal += getMoveRate(neuralMoveCounts, ["c2c"]);
    teacherBaselineCenterMoveRateTotal += getMoveRate(
      teacherBaselineMoveCounts,
      ["c2c"]
    );
    neuralSolitaireMoveRateTotal += getMoveRate(neuralMoveCounts, [
      "c2s",
      "s2s",
    ]);
    teacherBaselineSolitaireMoveRateTotal += getMoveRate(
      teacherBaselineMoveCounts,
      ["c2s", "s2s"]
    );
    neuralCycleMoveRateTotal += getMoveRate(neuralMoveCounts, [
      "cycle",
      "flip_deck",
    ]);
    teacherBaselineCycleMoveRateTotal += getMoveRate(
      teacherBaselineMoveCounts,
      ["cycle", "flip_deck"]
    );
    neuralPounceRemainingTotal += neuralPounceRemaining;
    teacherBaselinePounceRemainingTotal += teacherBaselinePounceRemaining;
    if (neuralPounceRemaining === 0) {
      neuralPounceOuts += 1;
    }
    if (teacherBaselinePounceRemaining === 0) {
      teacherBaselinePounceOuts += 1;
    }
    if (neuralScore > Math.max(...teacherScores)) {
      neuralWins += 1;
    }
  }

  return {
    games,
    averageNeuralPointDifferential:
      games === 0 ? 0 : neuralDifferentialTotal / games,
    averageTeacherBaselinePointDifferential:
      games === 0 ? 0 : teacherBaselineDifferentialTotal / games,
    averageBaselineAdjustedPointDifferential:
      games === 0 ? 0 : baselineAdjustedDifferentialTotal / games,
    neuralWinRate: games === 0 ? 0 : neuralWins / games,
    averageNeuralScore: games === 0 ? 0 : neuralScoreTotal / games,
    averageTeacherScore: games === 0 ? 0 : teacherScoreTotal / games,
    averageNeuralDecisionCount:
      games === 0 ? 0 : neuralDecisionCountTotal / games,
    averageTeacherBaselineDecisionCount:
      games === 0 ? 0 : teacherBaselineDecisionCountTotal / games,
    averageNeuralCenterMoveRate:
      games === 0 ? 0 : neuralCenterMoveRateTotal / games,
    averageTeacherBaselineCenterMoveRate:
      games === 0 ? 0 : teacherBaselineCenterMoveRateTotal / games,
    averageNeuralSolitaireMoveRate:
      games === 0 ? 0 : neuralSolitaireMoveRateTotal / games,
    averageTeacherBaselineSolitaireMoveRate:
      games === 0 ? 0 : teacherBaselineSolitaireMoveRateTotal / games,
    averageNeuralCycleMoveRate:
      games === 0 ? 0 : neuralCycleMoveRateTotal / games,
    averageTeacherBaselineCycleMoveRate:
      games === 0 ? 0 : teacherBaselineCycleMoveRateTotal / games,
    averageNeuralPounceRemaining:
      games === 0 ? 0 : neuralPounceRemainingTotal / games,
    averageTeacherBaselinePounceRemaining:
      games === 0 ? 0 : teacherBaselinePounceRemainingTotal / games,
    neuralPounceOutRate: games === 0 ? 0 : neuralPounceOuts / games,
    teacherBaselinePounceOutRate:
      games === 0 ? 0 : teacherBaselinePounceOuts / games,
  };
}

export function createTrainingBoard(playerCount: number, seed: string): BoardState {
  const board = createBoard(playerCount);
  const decks = Array.from({ length: playerCount }, (_, playerIndex) =>
    createShuffledDeck(playerIndex, `${seed}:player:${playerIndex}`)
  );
  resetBoard(board, decks);
  board.pileLocs = createDeterministicPileLocations(
    board.piles.length,
    `${seed}:piles`
  );
  board.players.forEach((_, playerIndex) => {
    dealPlayerHand(board, playerIndex);
  });
  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.players.forEach((player) => {
    player.currentPoints = getCurrentPointsFromCards(player);
  });
  return board;
}

export function evaluateNeuralModel(
  model: NeuralActionRankingModel,
  options: {
    playerCount?: number;
    games?: number;
    seed?: string;
    maxMovesPerGame?: number;
  } = {}
): PolicyEvaluationResult {
  return evaluateNeuralPolicy(new NeuralActionRankingPolicy(model), options);
}

export function compareNeuralModels(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  options: {
    playerCount?: number;
    games?: number;
    seed?: string;
    maxMovesPerGame?: number;
  } = {}
): PolicyComparisonResult {
  const policyA = new NeuralActionRankingPolicy(modelA);
  const policyB = new NeuralActionRankingPolicy(modelB);
  const playerCount = options.playerCount ?? 4;
  const games = options.games ?? 12;
  const seed = options.seed ?? "action-ranking-compare";
  const maxMovesPerGame = options.maxMovesPerGame ?? DEFAULT_MAX_MOVES_PER_GAME;
  const pointDifferentialDeltas: number[] = [];
  let modelADifferentialTotal = 0;
  let modelBDifferentialTotal = 0;
  let modelAScoreTotal = 0;
  let modelBScoreTotal = 0;
  let modelABetterCount = 0;
  let modelBBetterCount = 0;
  let tiedDifferentialCount = 0;
  let modelADecisionCountTotal = 0;
  let modelBDecisionCountTotal = 0;
  let modelACenterMoveRateTotal = 0;
  let modelBCenterMoveRateTotal = 0;
  let modelASolitaireMoveRateTotal = 0;
  let modelBSolitaireMoveRateTotal = 0;
  let modelACycleMoveRateTotal = 0;
  let modelBCycleMoveRateTotal = 0;
  let modelAPounceRemainingTotal = 0;
  let modelBPounceRemainingTotal = 0;
  let modelAPounceOuts = 0;
  let modelBPounceOuts = 0;

  for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const neuralPlayerIndex = gameIndex % playerCount;
    const board = createTrainingBoard(playerCount, `${seed}:deal:${gameIndex}`);
    const rolloutA = runPolicyRollout(board, {
      policy: policyA,
      random: createSeededRandom(`${seed}:rollout:${gameIndex}`),
      temperature: 1,
      sample: false,
      maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
    });
    const rolloutB = runPolicyRollout(board, {
      policy: policyB,
      random: createSeededRandom(`${seed}:rollout:${gameIndex}`),
      temperature: 1,
      sample: false,
      maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
    });
    const metricsA = getRolloutPlayerMetrics(rolloutA, neuralPlayerIndex);
    const metricsB = getRolloutPlayerMetrics(rolloutB, neuralPlayerIndex);
    const pointDifferentialDelta =
      metricsA.pointDifferential - metricsB.pointDifferential;

    pointDifferentialDeltas.push(pointDifferentialDelta);
    modelADifferentialTotal += metricsA.pointDifferential;
    modelBDifferentialTotal += metricsB.pointDifferential;
    modelAScoreTotal += metricsA.score;
    modelBScoreTotal += metricsB.score;
    modelADecisionCountTotal += metricsA.decisionCount;
    modelBDecisionCountTotal += metricsB.decisionCount;
    modelACenterMoveRateTotal += metricsA.centerMoveRate;
    modelBCenterMoveRateTotal += metricsB.centerMoveRate;
    modelASolitaireMoveRateTotal += metricsA.solitaireMoveRate;
    modelBSolitaireMoveRateTotal += metricsB.solitaireMoveRate;
    modelACycleMoveRateTotal += metricsA.cycleMoveRate;
    modelBCycleMoveRateTotal += metricsB.cycleMoveRate;
    modelAPounceRemainingTotal += metricsA.pounceRemaining;
    modelBPounceRemainingTotal += metricsB.pounceRemaining;

    if (pointDifferentialDelta > 0) {
      modelABetterCount += 1;
    } else if (pointDifferentialDelta < 0) {
      modelBBetterCount += 1;
    } else {
      tiedDifferentialCount += 1;
    }
    if (metricsA.pounceRemaining === 0) {
      modelAPounceOuts += 1;
    }
    if (metricsB.pounceRemaining === 0) {
      modelBPounceOuts += 1;
    }
  }

  return {
    games,
    averageModelAPointDifferential:
      games === 0 ? 0 : modelADifferentialTotal / games,
    averageModelBPointDifferential:
      games === 0 ? 0 : modelBDifferentialTotal / games,
    averagePointDifferentialDelta:
      games === 0
        ? 0
        : pointDifferentialDeltas.reduce((sum, value) => sum + value, 0) /
          games,
    pointDifferentialDeltaStandardError:
      standardError(pointDifferentialDeltas),
    modelABetterRate: games === 0 ? 0 : modelABetterCount / games,
    modelBBetterRate: games === 0 ? 0 : modelBBetterCount / games,
    tiedPointDifferentialRate:
      games === 0 ? 0 : tiedDifferentialCount / games,
    averageModelAScore: games === 0 ? 0 : modelAScoreTotal / games,
    averageModelBScore: games === 0 ? 0 : modelBScoreTotal / games,
    averageScoreDelta:
      games === 0 ? 0 : (modelAScoreTotal - modelBScoreTotal) / games,
    averageModelADecisionCount:
      games === 0 ? 0 : modelADecisionCountTotal / games,
    averageModelBDecisionCount:
      games === 0 ? 0 : modelBDecisionCountTotal / games,
    averageModelACenterMoveRate:
      games === 0 ? 0 : modelACenterMoveRateTotal / games,
    averageModelBCenterMoveRate:
      games === 0 ? 0 : modelBCenterMoveRateTotal / games,
    averageModelASolitaireMoveRate:
      games === 0 ? 0 : modelASolitaireMoveRateTotal / games,
    averageModelBSolitaireMoveRate:
      games === 0 ? 0 : modelBSolitaireMoveRateTotal / games,
    averageModelACycleMoveRate:
      games === 0 ? 0 : modelACycleMoveRateTotal / games,
    averageModelBCycleMoveRate:
      games === 0 ? 0 : modelBCycleMoveRateTotal / games,
    averageModelAPounceRemaining:
      games === 0 ? 0 : modelAPounceRemainingTotal / games,
    averageModelBPounceRemaining:
      games === 0 ? 0 : modelBPounceRemainingTotal / games,
    modelAPounceOutRate: games === 0 ? 0 : modelAPounceOuts / games,
    modelBPounceOutRate: games === 0 ? 0 : modelBPounceOuts / games,
  };
}

function runPolicyRollout(
  startBoard: BoardState,
  options: {
    policy: NeuralActionRankingPolicy;
    random: () => number;
    decisionRandom?: () => number;
    temperature: number;
    sample: boolean;
    maxMovesPerGame: number;
    neuralPlayerIndices?: number[];
    captureTransitionBoards?: boolean;
  }
): RolloutResult {
  const board = deepClone(startBoard);
  const activePlayerIndices = board.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => !player.isSpectating)
    .map(({ playerIndex }) => playerIndex);
  const neuralPlayers = new Set(
    options.neuralPlayerIndices ?? activePlayerIndices
  );
  const cooldowns = board.players.map((_, playerIndex) =>
    activePlayerIndices.includes(playerIndex)
      ? options.random()
      : Number.POSITIVE_INFINITY
  );
  const transitions: RolloutTransition[] = [];
  const moveTypeCountsByPlayer = board.players.map(() => createMoveTypeCounts());

  board.isActive = true;
  board.isDealt = true;
  board.isPaused = false;
  board.roundStartsAt = undefined;
  board.players.forEach((player, playerIndex) => {
    if (activePlayerIndices.includes(playerIndex)) {
      player.socketId = null;
    }
  });

  for (
    let moveCount = 0;
    !isGameOver(board) && moveCount < options.maxMovesPerGame;
    moveCount++
  ) {
    const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
    if (playerIndex < 0) {
      break;
    }

    const move = neuralPlayers.has(playerIndex)
      ? chooseNeuralMove(board, playerIndex, options, transitions)
      : getBasicAIMove(board, playerIndex, {});

    if (move) {
      executeMove(board, playerIndex, move);
      moveTypeCountsByPlayer[playerIndex][move.type] += 1;
    }
    cooldowns[playerIndex] += getMoveDelay(move?.type, options.random);
  }

  const finalScores = board.players.map(getCurrentPointsFromCards);
  const finalPointDifferentials = board.players.map((_, playerIndex) =>
    getPointDifferential(board, playerIndex)
  );
  const finalPounceCounts = board.players.map(
    (player) => player.pounceDeck.length
  );
  return {
    finalScores,
    finalPointDifferentials,
    finalPounceCounts,
    moveTypeCountsByPlayer,
    transitions,
  };
}

function chooseNeuralMove(
  board: BoardState,
  playerIndex: number,
  options: {
    policy: NeuralActionRankingPolicy;
    random: () => number;
    decisionRandom?: () => number;
    temperature: number;
    sample: boolean;
    captureTransitionBoards?: boolean;
  },
  transitions: RolloutTransition[]
): Move | undefined {
  const candidates = enumerateActionRankingCandidates(board, playerIndex);
  if (candidates.length === 0) {
    return;
  }

  const pointDifferentialBefore = getPointDifferential(board, playerIndex);
  const greedy = options.policy.chooseCandidate(candidates, {
    temperature: 1,
    random: options.decisionRandom ?? options.random,
    sample: false,
  });
  const selected = options.policy.chooseCandidate(candidates, {
    temperature: options.temperature,
    random: options.decisionRandom ?? options.random,
    sample: options.sample,
  });
  if (!selected) {
    return;
  }

  const selectedCandidateIndex = candidates.findIndex(
    (candidate) => candidate.key === selected.key
  );
  const greedyCandidateIndex = greedy
    ? candidates.findIndex((candidate) => candidate.key === greedy.key)
    : selectedCandidateIndex;
  if (selectedCandidateIndex >= 0 && options.sample) {
    transitions.push({
      playerIndex,
      pointDifferentialBefore,
      board: options.captureTransitionBoards ? deepClone(board) : undefined,
      candidates,
      selectedCandidateIndex,
      greedyCandidateIndex,
      localReward: selected.immediatePointDifferentialDelta,
    });
  }
  return selected.move;
}

function getRolloutPlayerMetrics(rollout: RolloutResult, playerIndex: number) {
  const moveCounts =
    rollout.moveTypeCountsByPlayer[playerIndex] ?? createMoveTypeCounts();
  return {
    score: rollout.finalScores[playerIndex] ?? 0,
    pointDifferential: rollout.finalPointDifferentials[playerIndex] ?? 0,
    pounceRemaining: rollout.finalPounceCounts[playerIndex] ?? 0,
    decisionCount: getTotalMoveCount(moveCounts),
    centerMoveRate: getMoveRate(moveCounts, ["c2c"]),
    solitaireMoveRate: getMoveRate(moveCounts, ["c2s", "s2s"]),
    cycleMoveRate: getMoveRate(moveCounts, ["cycle", "flip_deck"]),
  };
}

function createShuffledDeck(player: number, seed: string): CardState[] {
  const random = createSeededRandom(seed);
  const deck = SUITS.flatMap((suit) =>
    VALUES.map((value) => ({ suit, value, player }))
  );
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function createDeterministicPileLocations(
  count: number,
  seed: string
): [number, number, number][] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / Math.max(1, count);
    const ring = 0.28 + 0.2 * (index % 2);
    const jitter = 0.04;
    return [
      clamp01(0.5 + Math.cos(angle) * ring + (random() - 0.5) * jitter),
      clamp01(0.5 + Math.sin(angle) * ring + (random() - 0.5) * jitter),
      random(),
    ];
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  return MOVE_TYPES.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {} as MoveTypeCounts);
}

function getTotalMoveCount(counts: MoveTypeCounts): number {
  return MOVE_TYPES.reduce((sum, type) => sum + counts[type], 0);
}

function getMoveRate(
  counts: MoveTypeCounts,
  moveTypes: readonly Move["type"][]
): number {
  const total = getTotalMoveCount(counts);
  if (total === 0) {
    return 0;
  }
  return moveTypes.reduce((sum, type) => sum + counts[type], 0) / total;
}

function standardError(values: readonly number[]): number {
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
