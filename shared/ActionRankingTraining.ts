import { getBasicAIMove, getBasicAIMoveForStyle } from "./ComputerV1";
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
  ACTION_RANKING_FEATURE_NAMES,
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
  rlOpponentModel?: NeuralActionRankingModel;
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
  rlOpponentMode?: "teacher" | "self" | "champion";
  rlBaselineMode?: "teacher" | "greedy";
  rlCommonRandom?: boolean;
  rlCreditMode?: "episode" | "counterfactual";
  rlCounterfactualScanEpisodes?: number;
  rlCounterfactualRolloutCount?: number;
  rlCounterfactualRolloutMoves?: number;
  rlCounterfactualCandidateLimit?: number;
  rlCounterfactualMinReturnGap?: number;
  rlCounterfactualMaxReturnGap?: number;
  rlCounterfactualRequireBehaviorGap?: boolean;
  rlCounterfactualMinBehaviorImprovement?: number;
  rlCounterfactualStateSource?: "sampled" | "greedy";
  rlCounterfactualTrainingMode?: "policy_gradient" | "pairwise" | "value";
  rlCounterfactualGapStandardErrorMultiplier?: number;
  rlCounterfactualMinBehaviorWinRate?: number;
  rlCounterfactualMaxPolicyMargin?: number;
  rlCounterfactualRequirePolicyChange?: boolean;
  rlCounterfactualPreferenceScope?: "all" | "behavior";
  rlCounterfactualPairwiseTargetMargin?: number;
  rlCounterfactualPairwiseWeightMode?: "uniform" | "return_gap";
  rlCounterfactualPairwiseWeightScale?: number;
  rlCounterfactualPairwiseMaxWeight?: number;
  rlCounterfactualMaxScoreGap?: number;
  rlCounterfactualScoreGapBudget?: number;
  rlCounterfactualStopAfterLabels?: number;
  rlCounterfactualScoreRewardWeight?: number;
  rlCounterfactualPounceRewardWeight?: number;
  rlCounterfactualSkipCycleOverConnector?: boolean;
  rlCounterfactualSkipSolitaireOverUsefulCycle?: boolean;
  rlCounterfactualAnchorWeight?: number;
  rlCounterfactualAnchorMaxExamples?: number;
  rlCounterfactualAnchorTemperature?: number;
  rlCounterfactualBehaviorCorrectionWeight?: number;
  rlCounterfactualBehaviorCorrectionMargin?: number;
  rlCounterfactualConnectorAnchorWeight?: number;
  rlCounterfactualConnectorAnchorMaxExamples?: number;
  rlCounterfactualConnectorAnchorMargin?: number;
  rlCounterfactualConnectorAnchorMaxPolicyMargin?: number;
  rlCounterfactualConnectorAnchorMode?: "connector" | "symmetric";
  rlCounterfactualValueTargetScale?: number;
  rlCounterfactualValueCenterTargets?: boolean;
  rlCounterfactualValueTargetMode?: "absolute" | "residual";
  rlCounterfactualValueHuberDelta?: number;
  rlUpdateEpochs?: number;
  rlUpdateScope?: "all" | "exploratory";
  rlTrainableLayers?: "all" | "output";
  rlNormalizeAdvantages?: boolean;
  rlAdvantageClip?: number;
  improvementStates?: number;
  improvementStateSource?: "teacher" | "policy";
  improvementStateTemperature?: number;
  improvementStateSample?: boolean;
  improvementMaxPolicyScoreGap?: number;
  improvementMaxWinnerPolicyScoreGap?: number;
  improvementMaxCandidatePolicyScoreGap?: number;
  improvementPolicyCandidateLimit?: number;
  improvementCandidateLimit?: number;
  improvementRolloutMoves?: number;
  improvementRolloutCount?: number;
  improvementCommonRandom?: boolean;
  improvementContinuationMode?: "teacher" | "policy";
  improvementTrainingMode?: "softmax" | "pairwise" | "value";
  improvementMinReturnGap?: number;
  improvementMaxPairsPerExample?: number;
  improvementPreferenceTemperature?: number;
  improvementPreferenceScope?: "all" | "behavior";
  improvementPairwiseTargetMargin?: number;
  improvementValueTargetScale?: number;
  improvementValueCenterTargets?: boolean;
  improvementValueTargetMode?: "absolute" | "residual";
  improvementValueHuberDelta?: number;
  improvementScoreRewardWeight?: number;
  improvementRequireBehaviorGap?: boolean;
  improvementMinBehaviorImprovement?: number;
  improvementBehaviorGapStandardErrorMultiplier?: number;
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
    averageBestBehaviorImprovementStandardError: number;
    averageCandidateReturnStdDev: number;
    skippedBehaviorGapCount: number;
    skippedBehaviorConfidenceCount: number;
    skippedPolicyScoreGapCount: number;
    skippedPolicyWinnerScoreGapCount: number;
    skippedPolicyCandidateSupportCount: number;
    filteredPolicyCandidateCount: number;
    scannedStateCount: number;
    stats: ImitationTrainingStats;
  };
  reinforcement: {
    opponentMode: "teacher" | "self" | "champion";
    averageTrainingPlayerCount: number;
    episodes: number;
    counterfactualScannedEpisodes: number;
    counterfactualStoppedAfterLabelTarget: boolean;
    averageFinalPointDifferential: number;
    averageTeacherBaselinePointDifferential: number;
    averageGreedyBaselinePointDifferential: number;
    averageBaselinePointDifferential: number;
    averageBaselineAdjustedReturn: number;
    averageSampleMinusGreedyReturn: number;
    averageSampledDecisionCount: number;
    averageCounterfactualScannedDecisionCount: number;
    averageExploratoryDecisionCount: number;
    averageCounterfactualReturnGap: number;
    averageCounterfactualCandidateCount: number;
    counterfactualTrainingUpdates: number;
    counterfactualUpdateCount: number;
    counterfactualMaxReturnGapSkippedCount: number;
    counterfactualBehaviorGapSkippedCount: number;
    counterfactualBehaviorConfidenceSkippedCount: number;
    counterfactualBehaviorWinRateSkippedCount: number;
    counterfactualPolicyMarginSkippedCount: number;
    counterfactualPolicyChangeSkippedCount: number;
    counterfactualConfidenceSkippedCount: number;
    counterfactualScoreGapSkippedCount: number;
    counterfactualScoreGapBudgetSkippedCount: number;
    counterfactualConnectorCycleSkippedCount: number;
    counterfactualUsefulCycleSkippedCount: number;
    averageCounterfactualScoreGap: number;
    averageCounterfactualBehaviorWinRate: number;
    counterfactualAveragePairWeight: number;
    counterfactualAnchorExamples: number;
    counterfactualAnchorUpdates: number;
    counterfactualBehaviorCorrectionUpdates: number;
    counterfactualConnectorAnchorExamples: number;
    counterfactualConnectorAnchorUpdates: number;
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

export type SelfPlayComparisonOptions = {
  playerCount?: number;
  games?: number;
  seed?: string;
  maxMovesPerGame?: number;
  swapSeats?: boolean;
};

export type CounterfactualRlLabelAudit = {
  examples: ActionRankingImitationExample[];
  counterfactualScannedEpisodes: number;
  stoppedAfterLabelTarget: boolean;
  sampledDecisionCount: number;
  exploratoryDecisionCount: number;
  noResultSkippedCount: number;
  returnGapSkippedCount: number;
  policyGradientGreedySkippedCount: number;
  policyMarginSkippedCount: number;
  policyChangeSkippedCount: number;
  behaviorGapSkippedCount: number;
  behaviorConfidenceSkippedCount: number;
  behaviorWinRateSkippedCount: number;
  confidenceSkippedCount: number;
  scoreGapSkippedCount: number;
  scoreGapBudgetSkippedCount: number;
  connectorCycleSkippedCount: number;
  usefulCycleSkippedCount: number;
  maxReturnGapSkippedCount: number;
  averageCounterfactualReturnGap: number;
  averageCounterfactualCandidateCount: number;
  averageCounterfactualScoreGap: number;
  averageCounterfactualBehaviorWinRate: number;
};

type RolloutTransition = {
  playerIndex: number;
  pointDifferentialBefore: number;
  scoreBefore: number;
  pounceRemainingBefore: number;
  board?: BoardState;
  candidates: ActionRankingCandidate[];
  selectedCandidateIndex: number;
  greedyCandidateIndex: number;
  localReward: number;
};

type BasicMoveProvider = (
  board: BoardState,
  playerIndex: number
) => Move | undefined;

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

type CounterfactualSupervisedLabel = {
  example: ActionRankingImitationExample;
  returnGap: number;
  candidateCount: number;
  behaviorWinRate: number;
  scoreGap: number | null;
};

type PolicyGradientOpponentMode = "teacher" | "self" | "champion";
type PolicyGradientBaselineMode = "teacher" | "greedy";
type PolicyGradientCreditMode = "episode" | "counterfactual";
type CounterfactualTrainingMode = "policy_gradient" | "pairwise" | "value";
type CounterfactualStateSource = "sampled" | "greedy";
type PolicyGradientUpdateScope = "all" | "exploratory";

type CounterfactualCandidateReturn = {
  candidate: ActionRankingCandidate;
  candidateIndex: number;
  rolloutPointDifferentialReturn: number;
  rolloutScoreReturn: number;
  rolloutPounceProgressReturn: number;
  rolloutObjectiveReturn: number;
  rolloutObjectiveReturns: number[];
};

type CounterfactualTransitionResult = {
  candidates: CounterfactualCandidateReturn[];
  selectedReturn: number;
  greedyReturn: number;
  selectedPointDifferentialReturn: number;
  greedyPointDifferentialReturn: number;
  returnGap: number;
  returnGapStandardError: number;
  trainingGap: number;
  trainingGapStandardError: number;
  behaviorGap: number;
  behaviorGapStandardError: number;
  behaviorWinRate: number;
};

type CounterfactualOutcome = {
  pointDifferential: number;
  score: number;
  pounceRemaining: number;
};

type RewardImprovementCandidate = ActionRankingCandidate & {
  rolloutPointDifferential: number;
  rolloutPointDifferentialReturn: number;
  rolloutPointDifferentialReturns: number[];
  rolloutScore: number;
  rolloutScoreReturn: number;
  rolloutObjectiveReturn: number;
  rolloutObjectiveReturns: number[];
};

type RewardImprovementCollection = {
  examples: ActionRankingImitationExample[];
  averageTeacherReturn: number;
  averageBehaviorReturn: number;
  averageBestReturn: number;
  averageImprovement: number;
  averageBestBehaviorImprovement: number;
  averageBestBehaviorImprovementStandardError: number;
  averageCandidateReturnStdDev: number;
  skippedBehaviorGapCount: number;
  skippedBehaviorConfidenceCount: number;
  skippedPolicyScoreGapCount: number;
  skippedPolicyWinnerScoreGapCount: number;
  skippedPolicyCandidateSupportCount: number;
  filteredPolicyCandidateCount: number;
  scannedStateCount: number;
};

type RewardImprovementExampleResult = {
  example: ActionRankingImitationExample | null;
  skippedForBehaviorGap: boolean;
  skippedForBehaviorConfidence: boolean;
  teacherReturn: number | null;
  behaviorReturn: number | null;
  bestReturn: number | null;
  bestBehaviorImprovement: number;
  bestBehaviorImprovementStandardError: number;
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
    maxPolicyScoreGap: options.improvementMaxPolicyScoreGap ?? 0,
    maxWinnerPolicyScoreGap: options.improvementMaxWinnerPolicyScoreGap ?? 0,
    maxCandidatePolicyScoreGap:
      options.improvementMaxCandidatePolicyScoreGap ?? 0,
    policyCandidateLimit: options.improvementPolicyCandidateLimit ?? 0,
    candidateLimit: options.improvementCandidateLimit ?? 6,
    rolloutMoves: options.improvementRolloutMoves ?? 450,
    rolloutCount: options.improvementRolloutCount ?? 1,
    commonRandom: options.improvementCommonRandom ?? true,
    continuationMode: options.improvementContinuationMode ?? "teacher",
    continuationPolicy: policy,
    requireBehaviorGap: options.improvementRequireBehaviorGap ?? false,
    minBehaviorImprovement: options.improvementMinBehaviorImprovement ?? 2,
    behaviorGapStandardErrorMultiplier:
      options.improvementBehaviorGapStandardErrorMultiplier ?? 0,
    scoreRewardWeight: options.improvementScoreRewardWeight ?? 0,
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
          pairwiseTargetMargin: options.improvementPairwiseTargetMargin ?? 0,
          targetTemperature: options.improvementTargetTemperature ?? 4,
          valueTargetScale: options.improvementValueTargetScale ?? 4,
          valueCenterTargets: options.improvementValueCenterTargets ?? true,
          valueTargetMode: options.improvementValueTargetMode ?? "absolute",
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
    opponentMode: options.rlOpponentMode ?? "teacher",
    opponentPolicy: options.rlOpponentModel
      ? new NeuralActionRankingPolicy(options.rlOpponentModel)
      : undefined,
    baselineMode: options.rlBaselineMode ?? "teacher",
    commonRandom: options.rlCommonRandom ?? true,
    creditMode: options.rlCreditMode ?? "episode",
    counterfactualScanEpisodes:
      options.rlCounterfactualScanEpisodes ?? rlEpisodes,
    counterfactualRolloutCount: options.rlCounterfactualRolloutCount ?? 1,
    counterfactualRolloutMoves:
      options.rlCounterfactualRolloutMoves ?? Math.min(450, maxMovesPerGame),
    counterfactualCandidateLimit: options.rlCounterfactualCandidateLimit ?? 2,
    counterfactualMinReturnGap: options.rlCounterfactualMinReturnGap ?? 1,
    counterfactualMaxReturnGap: options.rlCounterfactualMaxReturnGap ?? 0,
    counterfactualRequireBehaviorGap:
      options.rlCounterfactualRequireBehaviorGap ?? false,
    counterfactualMinBehaviorImprovement:
      options.rlCounterfactualMinBehaviorImprovement ??
      options.rlCounterfactualMinReturnGap ??
      1,
    counterfactualStateSource:
      options.rlCounterfactualStateSource ?? "sampled",
    counterfactualTrainingMode:
      options.rlCounterfactualTrainingMode ?? "policy_gradient",
    counterfactualGapStandardErrorMultiplier:
      options.rlCounterfactualGapStandardErrorMultiplier ?? 0,
    counterfactualMinBehaviorWinRate:
      options.rlCounterfactualMinBehaviorWinRate ?? 0,
    counterfactualMaxPolicyMargin:
      options.rlCounterfactualMaxPolicyMargin ?? 0,
    counterfactualRequirePolicyChange:
      options.rlCounterfactualRequirePolicyChange ?? false,
    counterfactualPreferenceScope:
      options.rlCounterfactualPreferenceScope ?? "all",
    counterfactualPairwiseTargetMargin:
      options.rlCounterfactualPairwiseTargetMargin ?? 0,
    counterfactualPairwiseWeightMode:
      options.rlCounterfactualPairwiseWeightMode ?? "uniform",
    counterfactualPairwiseWeightScale:
      options.rlCounterfactualPairwiseWeightScale ?? 1,
    counterfactualPairwiseMaxWeight:
      options.rlCounterfactualPairwiseMaxWeight ?? 1,
    counterfactualMaxScoreGap: options.rlCounterfactualMaxScoreGap ?? 0,
    counterfactualScoreGapBudget:
      options.rlCounterfactualScoreGapBudget ?? 0,
    counterfactualStopAfterLabels:
      options.rlCounterfactualStopAfterLabels ?? 0,
    counterfactualScoreRewardWeight:
      options.rlCounterfactualScoreRewardWeight ?? 0,
    counterfactualPounceRewardWeight:
      options.rlCounterfactualPounceRewardWeight ?? 0,
    counterfactualSkipCycleOverConnector:
      options.rlCounterfactualSkipCycleOverConnector ?? false,
    counterfactualSkipSolitaireOverUsefulCycle:
      options.rlCounterfactualSkipSolitaireOverUsefulCycle ?? false,
    counterfactualAnchorWeight: options.rlCounterfactualAnchorWeight ?? 0,
    counterfactualAnchorMaxExamples:
      options.rlCounterfactualAnchorMaxExamples ?? 512,
    counterfactualAnchorTemperature:
      options.rlCounterfactualAnchorTemperature ?? 1,
    counterfactualBehaviorCorrectionWeight:
      options.rlCounterfactualBehaviorCorrectionWeight ?? 0,
    counterfactualBehaviorCorrectionMargin:
      options.rlCounterfactualBehaviorCorrectionMargin ?? 0.05,
    counterfactualConnectorAnchorWeight:
      options.rlCounterfactualConnectorAnchorWeight ?? 0,
    counterfactualConnectorAnchorMaxExamples:
      options.rlCounterfactualConnectorAnchorMaxExamples ?? 512,
    counterfactualConnectorAnchorMargin:
      options.rlCounterfactualConnectorAnchorMargin ?? 0.05,
    counterfactualConnectorAnchorMaxPolicyMargin:
      options.rlCounterfactualConnectorAnchorMaxPolicyMargin ?? 0,
    counterfactualConnectorAnchorMode:
      options.rlCounterfactualConnectorAnchorMode ?? "connector",
    counterfactualValueTargetScale:
      options.rlCounterfactualValueTargetScale ?? 4,
    counterfactualValueCenterTargets:
      options.rlCounterfactualValueCenterTargets ?? true,
    counterfactualValueTargetMode:
      options.rlCounterfactualValueTargetMode ?? "absolute",
    counterfactualValueHuberDelta:
      options.rlCounterfactualValueHuberDelta ?? 0,
    updateEpochs: options.rlUpdateEpochs ?? 1,
    updateScope: options.rlUpdateScope ?? "all",
    trainableLayers: options.rlTrainableLayers ?? "all",
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
      averageBestBehaviorImprovementStandardError:
        improvement.averageBestBehaviorImprovementStandardError,
      averageCandidateReturnStdDev: improvement.averageCandidateReturnStdDev,
      skippedBehaviorGapCount: improvement.skippedBehaviorGapCount,
      skippedBehaviorConfidenceCount:
        improvement.skippedBehaviorConfidenceCount,
      skippedPolicyScoreGapCount: improvement.skippedPolicyScoreGapCount,
      skippedPolicyWinnerScoreGapCount:
        improvement.skippedPolicyWinnerScoreGapCount,
      skippedPolicyCandidateSupportCount:
        improvement.skippedPolicyCandidateSupportCount,
      filteredPolicyCandidateCount: improvement.filteredPolicyCandidateCount,
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
  maxPolicyScoreGap: number;
  maxWinnerPolicyScoreGap: number;
  maxCandidatePolicyScoreGap: number;
  policyCandidateLimit: number;
  candidateLimit: number;
  rolloutMoves: number;
  rolloutCount: number;
  commonRandom: boolean;
  continuationMode: "teacher" | "policy";
  continuationPolicy?: NeuralActionRankingPolicy;
  requireBehaviorGap: boolean;
  minBehaviorImprovement: number;
  behaviorGapStandardErrorMultiplier: number;
  scoreRewardWeight: number;
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
      averageBestBehaviorImprovementStandardError: 0,
      averageCandidateReturnStdDev: 0,
      skippedBehaviorGapCount: 0,
      skippedBehaviorConfidenceCount: 0,
      skippedPolicyScoreGapCount: 0,
      skippedPolicyWinnerScoreGapCount: 0,
      skippedPolicyCandidateSupportCount: 0,
      filteredPolicyCandidateCount: 0,
      scannedStateCount: 0,
    };
  }

  const examples: ActionRankingImitationExample[] = [];
  let teacherReturnTotal = 0;
  let behaviorReturnTotal = 0;
  let bestReturnTotal = 0;
  let bestBehaviorImprovementTotal = 0;
  let bestBehaviorImprovementStandardErrorTotal = 0;
  let candidateReturnStdDevTotal = 0;
  let skippedBehaviorGapCount = 0;
  let skippedBehaviorConfidenceCount = 0;
  let skippedPolicyScoreGapCount = 0;
  let skippedPolicyWinnerScoreGapCount = 0;
  let skippedPolicyCandidateSupportCount = 0;
  let filteredPolicyCandidateCount = 0;
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
        const policyTopScoreGap = getPolicyTopScoreGap(
          candidates,
          options.statePolicy
        );
        if (
          options.maxPolicyScoreGap > 0 &&
          policyTopScoreGap != null &&
          policyTopScoreGap > options.maxPolicyScoreGap
        ) {
          skippedPolicyScoreGapCount += 1;
        } else {
          const behaviorKey = getActionRankingMoveKey(behaviorMove);
          const teacherKey = teacherMove
            ? getActionRankingMoveKey(teacherMove)
            : null;
          const requiredKeys = [behaviorKey, teacherKey].filter(
            (key): key is string => key != null
          );
          const policyKeys = getPolicyCandidateKeys(
            candidates,
            options.statePolicy,
            options.policyCandidateLimit
          );
          const candidatePool = filterPolicySupportedCandidates(
            candidates,
            options.statePolicy,
            options.maxCandidatePolicyScoreGap,
            requiredKeys
          );
          filteredPolicyCandidateCount += candidates.length - candidatePool.length;
          if (candidatePool.length <= 1) {
            skippedPolicyCandidateSupportCount += 1;
            continue;
          }
          const selectedCandidates = selectImprovementCandidates(
            candidatePool,
            [...requiredKeys, ...policyKeys],
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
            options.continuationMode,
            options.continuationPolicy,
            options.requireBehaviorGap,
            options.minBehaviorImprovement,
            options.behaviorGapStandardErrorMultiplier,
            options.scoreRewardWeight
          );
          if (result.skippedForBehaviorGap) {
            skippedBehaviorGapCount += 1;
          }
          if (result.skippedForBehaviorConfidence) {
            skippedBehaviorConfidenceCount += 1;
          }
          if (result.example) {
            const winnerScoreGap = getPolicyWinnerScoreGap(
              result.example,
              options.statePolicy
            );
            if (
              options.maxWinnerPolicyScoreGap > 0 &&
              winnerScoreGap != null &&
              winnerScoreGap > options.maxWinnerPolicyScoreGap
            ) {
              skippedPolicyWinnerScoreGapCount += 1;
            } else {
              teacherReturnTotal += result.teacherReturn ?? 0;
              behaviorReturnTotal += result.behaviorReturn ?? 0;
              bestReturnTotal += result.bestReturn ?? 0;
              bestBehaviorImprovementTotal += result.bestBehaviorImprovement;
              bestBehaviorImprovementStandardErrorTotal +=
                result.bestBehaviorImprovementStandardError;
              candidateReturnStdDevTotal += result.candidateReturnStdDev;
              examples.push(result.example);
            }
          }
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
    averageBestBehaviorImprovementStandardError:
      examples.length === 0
        ? 0
        : bestBehaviorImprovementStandardErrorTotal / examples.length,
    averageCandidateReturnStdDev:
      examples.length === 0 ? 0 : candidateReturnStdDevTotal / examples.length,
    skippedBehaviorGapCount,
    skippedBehaviorConfidenceCount,
    skippedPolicyScoreGapCount,
    skippedPolicyWinnerScoreGapCount,
    skippedPolicyCandidateSupportCount,
    filteredPolicyCandidateCount,
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
    pairwiseTargetMargin: number;
    targetTemperature: number;
    valueTargetScale: number;
    valueCenterTargets: boolean;
    valueTargetMode: "absolute" | "residual";
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
      targetMargin: options.pairwiseTargetMargin,
      shuffleSeed: options.shuffleSeed,
    });
  }

  if (options.mode === "value") {
    return policy.trainValueRegression(examples, {
      epochs: options.epochs,
      learningRate: options.learningRate,
      targetScale: options.valueTargetScale,
      centerTargets: options.valueCenterTargets,
      targetMode: options.valueTargetMode,
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
  continuationMode: "teacher" | "policy",
  continuationPolicy: NeuralActionRankingPolicy | undefined,
  requireBehaviorGap: boolean,
  minBehaviorImprovement: number,
  behaviorGapStandardErrorMultiplier: number,
  scoreRewardWeight: number
): RewardImprovementExampleResult {
  const pointDifferentialBefore = getPointDifferential(board, playerIndex);
  const scoreBefore = getCurrentPointsFromCards(board.players[playerIndex]);
  const safeScoreWeight = Number.isFinite(scoreRewardWeight)
    ? scoreRewardWeight
    : 0;
  const behaviorKey = getActionRankingMoveKey(behaviorMove);
  const teacherKey = teacherMove ? getActionRankingMoveKey(teacherMove) : null;
  const improvedCandidates = candidates.map<RewardImprovementCandidate>(
    (candidate, candidateIndex) => {
      const outcomes = getCounterfactualOutcomes(
        board,
        playerIndex,
        candidate.move,
        getCounterfactualSeeds(seed, candidateIndex, rolloutCount, commonRandom),
        rolloutMoves,
        continuationMode,
        continuationPolicy
      );
      const finalPointDifferentials = outcomes.map(
        (outcome) => outcome.pointDifferential
      );
      const finalScores = outcomes.map((outcome) => outcome.score);
      const finalPointDifferential = meanNumbers(finalPointDifferentials);
      const finalScore = meanNumbers(finalScores);
      const pointDifferentialReturns = finalPointDifferentials.map(
        (value) => value - pointDifferentialBefore
      );
      const scoreReturns = finalScores.map((value) => value - scoreBefore);
      const objectiveReturns = pointDifferentialReturns.map(
        (value, index) => value + safeScoreWeight * (scoreReturns[index] ?? 0)
      );
      return {
        ...candidate,
        rolloutPointDifferential: finalPointDifferential,
        rolloutPointDifferentialReturn:
          finalPointDifferential - pointDifferentialBefore,
        rolloutPointDifferentialReturns: pointDifferentialReturns,
        rolloutScore: finalScore,
        rolloutScoreReturn: finalScore - scoreBefore,
        rolloutObjectiveReturn: meanNumbers(objectiveReturns),
        rolloutObjectiveReturns: objectiveReturns,
      };
    }
  );
  const bestIndex = improvedCandidates.reduce((best, candidate, index) => {
    return index === 0 ||
      candidate.rolloutObjectiveReturn >
        improvedCandidates[best].rolloutObjectiveReturn
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
      bestBehaviorImprovementStandardError: 0,
      candidateReturnStdDev: 0,
      skippedForBehaviorConfidence: false,
    };
  }

  const teacherReturn =
    teacherKey == null
      ? null
      : improvedCandidates.find((candidate) => candidate.key === teacherKey)
          ?.rolloutObjectiveReturn ?? null;
  const behaviorReturn =
    improvedCandidates.find((candidate) => candidate.key === behaviorKey)
      ?.rolloutObjectiveReturn ?? null;
  const bestReturn = improvedCandidates[bestIndex].rolloutObjectiveReturn;
  const bestBehaviorImprovement =
    behaviorReturn == null ? 0 : bestReturn - behaviorReturn;
  const behaviorCandidate = improvedCandidates.find(
    (candidate) => candidate.key === behaviorKey
  );
  const bestBehaviorImprovementStandardError =
    behaviorCandidate == null
      ? 0
      : getPairedReturnGapStandardError(
          improvedCandidates[bestIndex],
          behaviorCandidate
        );
  const candidateReturnStdDev =
    getImprovementCandidateReturnStdDev(improvedCandidates);

  const behaviorGapLowerBound =
    bestBehaviorImprovement -
    Math.max(0, behaviorGapStandardErrorMultiplier) *
      bestBehaviorImprovementStandardError;
  if (requireBehaviorGap && bestBehaviorImprovement < minBehaviorImprovement) {
    return {
      example: null,
      skippedForBehaviorGap: true,
      skippedForBehaviorConfidence: false,
      teacherReturn,
      behaviorReturn,
      bestReturn,
      bestBehaviorImprovement,
      bestBehaviorImprovementStandardError,
      candidateReturnStdDev,
    };
  }
  if (requireBehaviorGap && behaviorGapLowerBound < minBehaviorImprovement) {
    return {
      example: null,
      skippedForBehaviorGap: false,
      skippedForBehaviorConfidence: true,
      teacherReturn,
      behaviorReturn,
      bestReturn,
      bestBehaviorImprovement,
      bestBehaviorImprovementStandardError,
      candidateReturnStdDev,
    };
  }

  const example: ActionRankingImitationExample = {
    trialIndex,
    stepIndex,
    playerIndex,
    playerPointDifferential: pointDifferentialBefore,
    finalPlayerPoints: improvedCandidates[bestIndex].rolloutScore,
    finalPointDifferential:
      improvedCandidates[bestIndex].rolloutPointDifferential,
    pointDifferentialReturn:
      improvedCandidates[bestIndex].rolloutPointDifferentialReturn,
    teacherActionKey: teacherKey,
    teacherPointDifferentialReturn:
      teacherKey == null
        ? null
        : improvedCandidates.find((candidate) => candidate.key === teacherKey)
            ?.rolloutPointDifferentialReturn ?? null,
    teacherObjectiveReturn: teacherReturn,
    behaviorActionKey: behaviorKey,
    behaviorPointDifferentialReturn:
      improvedCandidates.find((candidate) => candidate.key === behaviorKey)
        ?.rolloutPointDifferentialReturn ?? null,
    behaviorObjectiveReturn: behaviorReturn,
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
      rolloutScore: candidate.rolloutScore,
      rolloutScoreReturn: candidate.rolloutScoreReturn,
      rolloutObjectiveReturn: candidate.rolloutObjectiveReturn,
      endsRound: candidate.endsRound,
    })),
  };
  return {
    example,
    skippedForBehaviorGap: false,
    skippedForBehaviorConfidence: false,
    teacherReturn,
    behaviorReturn,
    bestReturn,
    bestBehaviorImprovement,
    bestBehaviorImprovementStandardError,
    candidateReturnStdDev,
  };
}

function getCounterfactualPointDifferential(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seeds: readonly string[],
  maxMoves: number,
  continuationMode: "teacher" | "policy" = "teacher",
  continuationPolicy?: NeuralActionRankingPolicy
): number {
  return meanNumbers(
    getCounterfactualPointDifferentials(
      board,
      playerIndex,
      move,
      seeds,
      maxMoves,
      continuationMode,
      continuationPolicy
    )
  );
}

function getCounterfactualPointDifferentials(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seeds: readonly string[],
  maxMoves: number,
  continuationMode: "teacher" | "policy" = "teacher",
  continuationPolicy?: NeuralActionRankingPolicy
): number[] {
  return getCounterfactualOutcomes(
    board,
    playerIndex,
    move,
    seeds,
    maxMoves,
    continuationMode,
    continuationPolicy
  ).map((outcome) => outcome.pointDifferential);
}

function getCounterfactualOutcomes(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seeds: readonly string[],
  maxMoves: number,
  continuationMode: "teacher" | "policy" = "teacher",
  continuationPolicy?: NeuralActionRankingPolicy
): CounterfactualOutcome[] {
  const safeSeeds = seeds.length > 0 ? seeds : ["counterfactual"];
  return safeSeeds.map((seed) => {
    if (continuationMode === "policy" && continuationPolicy) {
      return getCounterfactualPolicyOutcome(
        board,
        playerIndex,
        move,
        seed,
        maxMoves,
        continuationPolicy
      );
    }

    const nextBoard = deepClone(board);
    executeMove(nextBoard, playerIndex, move);
    runTeacherContinuation(nextBoard, seed, maxMoves);
    return {
      pointDifferential: getPointDifferential(nextBoard, playerIndex),
      score: getCurrentPointsFromCards(nextBoard.players[playerIndex]),
      pounceRemaining: nextBoard.players[playerIndex]?.pounceDeck.length ?? 0,
    };
  });
}

function getPairedReturnGapStandardError(
  winner: RewardImprovementCandidate,
  loser: RewardImprovementCandidate
): number {
  const count = Math.min(
    winner.rolloutObjectiveReturns.length,
    loser.rolloutObjectiveReturns.length
  );
  if (count <= 1) {
    return 0;
  }
  const gaps = Array.from(
    { length: count },
    (_, index) =>
      winner.rolloutObjectiveReturns[index] -
      loser.rolloutObjectiveReturns[index]
  );
  return getSampleStandardDeviation(gaps) / Math.sqrt(count);
}

function meanNumbers(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getSampleStandardDeviation(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const average = meanNumbers(values);
  const variance =
    values.reduce((sum, value) => {
      const delta = value - average;
      return sum + delta * delta;
    }, 0) /
    (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
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

function getPolicyTopScoreGap(
  candidates: ActionRankingCandidate[],
  policy: NeuralActionRankingPolicy | undefined
): number | null {
  if (!policy || candidates.length <= 1) {
    return null;
  }
  const ranked = policy.rankCandidates(candidates);
  return ranked.length <= 1 ? null : ranked[0].score - ranked[1].score;
}

function getPolicyWinnerScoreGap(
  example: ActionRankingImitationExample,
  policy: NeuralActionRankingPolicy | undefined
): number | null {
  if (!policy || !example.selectedActionKey || example.candidates.length <= 1) {
    return null;
  }
  const ranked = policy.rankCandidates(example.candidates);
  const top = ranked[0];
  const winner = ranked.find(
    (prediction) => prediction.candidate.key === example.selectedActionKey
  );
  if (!top || !winner) {
    return null;
  }
  return top.score - winner.score;
}

function getPolicyCandidateKeys(
  candidates: ActionRankingCandidate[],
  policy: NeuralActionRankingPolicy | undefined,
  limit: number
): string[] {
  if (!policy || limit <= 0 || candidates.length === 0) {
    return [];
  }
  return policy
    .rankCandidates(candidates)
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((prediction) => prediction.candidate.key);
}

function filterPolicySupportedCandidates(
  candidates: ActionRankingCandidate[],
  policy: NeuralActionRankingPolicy | undefined,
  maxScoreGap: number,
  requiredKeys: readonly string[]
): ActionRankingCandidate[] {
  if (!policy || maxScoreGap <= 0 || candidates.length <= 1) {
    return candidates;
  }
  const requiredKeySet = new Set(requiredKeys);
  const ranked = policy.rankCandidates(candidates);
  const topScore = ranked[0]?.score;
  if (topScore == null) {
    return candidates;
  }
  const allowedKeys = new Set(
    ranked
      .filter(
        (prediction) =>
          requiredKeySet.has(prediction.candidate.key) ||
          topScore - prediction.score <= maxScoreGap
      )
      .map((prediction) => prediction.candidate.key)
  );
  return candidates.filter((candidate) => allowedKeys.has(candidate.key));
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
    opponentMode: PolicyGradientOpponentMode;
    opponentPolicy?: NeuralActionRankingPolicy;
    baselineMode: PolicyGradientBaselineMode;
    commonRandom: boolean;
    creditMode: PolicyGradientCreditMode;
    counterfactualScanEpisodes: number;
    counterfactualRolloutCount: number;
    counterfactualRolloutMoves: number;
    counterfactualCandidateLimit: number;
    counterfactualMinReturnGap: number;
    counterfactualMaxReturnGap: number;
    counterfactualRequireBehaviorGap: boolean;
    counterfactualMinBehaviorImprovement: number;
    counterfactualStateSource: CounterfactualStateSource;
    counterfactualTrainingMode: CounterfactualTrainingMode;
    counterfactualGapStandardErrorMultiplier: number;
    counterfactualMinBehaviorWinRate: number;
    counterfactualMaxPolicyMargin: number;
    counterfactualRequirePolicyChange: boolean;
    counterfactualPreferenceScope: "all" | "behavior";
    counterfactualPairwiseTargetMargin: number;
    counterfactualPairwiseWeightMode: "uniform" | "return_gap";
    counterfactualPairwiseWeightScale: number;
    counterfactualPairwiseMaxWeight: number;
    counterfactualMaxScoreGap: number;
    counterfactualScoreGapBudget: number;
    counterfactualStopAfterLabels: number;
    counterfactualScoreRewardWeight: number;
    counterfactualPounceRewardWeight: number;
    counterfactualSkipCycleOverConnector: boolean;
    counterfactualSkipSolitaireOverUsefulCycle: boolean;
    counterfactualAnchorWeight: number;
    counterfactualAnchorMaxExamples: number;
    counterfactualAnchorTemperature: number;
    counterfactualBehaviorCorrectionWeight: number;
    counterfactualBehaviorCorrectionMargin: number;
    counterfactualConnectorAnchorWeight: number;
    counterfactualConnectorAnchorMaxExamples: number;
    counterfactualConnectorAnchorMargin: number;
    counterfactualConnectorAnchorMaxPolicyMargin: number;
    counterfactualConnectorAnchorMode: "connector" | "symmetric";
    counterfactualValueTargetScale: number;
    counterfactualValueCenterTargets: boolean;
    counterfactualValueTargetMode: "absolute" | "residual";
    counterfactualValueHuberDelta: number;
    updateEpochs: number;
    updateScope: PolicyGradientUpdateScope;
    trainableLayers: "all" | "output";
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
  let trainingPlayerCountTotal = 0;
  let sampledDecisionCountTotal = 0;
  let counterfactualScannedDecisionCountTotal = 0;
  let exploratoryDecisionCountTotal = 0;
  let counterfactualReturnGapTotal = 0;
  let counterfactualCandidateCountTotal = 0;
  let counterfactualUpdateCount = 0;
  let counterfactualMaxReturnGapSkippedCount = 0;
  let counterfactualBehaviorGapSkippedCount = 0;
  let counterfactualBehaviorConfidenceSkippedCount = 0;
  let counterfactualBehaviorWinRateSkippedCount = 0;
  let counterfactualPolicyMarginSkippedCount = 0;
  let counterfactualPolicyChangeSkippedCount = 0;
  let counterfactualConfidenceSkippedCount = 0;
  let counterfactualScoreGapSkippedCount = 0;
  let counterfactualScoreGapBudgetSkippedCount = 0;
  let counterfactualConnectorCycleSkippedCount = 0;
  let counterfactualUsefulCycleSkippedCount = 0;
  let counterfactualBehaviorWinRateTotal = 0;
  let counterfactualScoreGapTotal = 0;
  let counterfactualScoreGapCount = 0;
  const updates: PolicyGradientUpdate[] = [];
  const counterfactualSupervisedLabels: CounterfactualSupervisedLabel[] = [];
  const counterfactualAnchorExamples: ActionRankingImitationExample[] = [];
  const baselineMode = options.baselineMode;
  const useSelfPlayOpponents = options.opponentMode === "self";
  const useChampionOpponents = options.opponentMode === "champion";
  if (useChampionOpponents && !options.opponentPolicy) {
    throw new Error("Champion opponent mode requires a frozen opponent policy.");
  }
  const updateScope = options.updateScope;
  const creditMode = options.creditMode;
  const useGreedyCounterfactualStates =
    creditMode === "counterfactual" &&
    options.counterfactualStateSource === "greedy" &&
    options.counterfactualTrainingMode !== "policy_gradient";
  const counterfactualScannedEpisodes =
    creditMode === "counterfactual" &&
    options.counterfactualTrainingMode !== "policy_gradient"
      ? Math.max(
          options.episodes,
          Number.isFinite(options.counterfactualScanEpisodes)
            ? Math.floor(options.counterfactualScanEpisodes)
            : options.episodes
        )
      : options.episodes;
  let completedCounterfactualScanEpisodes = 0;
  let counterfactualStoppedAfterLabelTarget = false;

  for (let episode = 0; episode < counterfactualScannedEpisodes; episode++) {
    const includeEpisodeMetrics = episode < options.episodes;
    const neuralPlayerIndex = episode % options.playerCount;
    const activePlayerIndices = Array.from(
      { length: options.playerCount },
      (_, index) => index
    );
    const learningPlayerIndices = useSelfPlayOpponents
      ? activePlayerIndices
      : [neuralPlayerIndex];
    const learningPlayerSet = new Set(learningPlayerIndices);
    const policyByPlayer = useChampionOpponents
      ? (playerIndex: number) =>
          learningPlayerSet.has(playerIndex)
            ? policy
            : options.opponentPolicy
      : undefined;
    const rolloutNeuralPlayerIndices = useChampionOpponents
      ? activePlayerIndices
      : learningPlayerIndices;
    const samplePlayerIndices = useChampionOpponents
      ? learningPlayerIndices
      : undefined;
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
    const teacherBaseline = includeEpisodeMetrics
      ? runPolicyRollout(board, {
          policy,
          random: createSeededRandom(teacherTimingSeed),
          temperature: 1,
          sample: false,
          maxMovesPerGame: options.maxMovesPerGame,
          neuralPlayerIndices: [],
        })
      : null;
    const teacherBaselineDifferential = getMeanPlayerPointDifferential(
      teacherBaseline,
      learningPlayerIndices
    );
    const greedyBaseline = includeEpisodeMetrics
      ? runPolicyRollout(board, {
          policy,
          random: createSeededRandom(greedyTimingSeed),
          decisionRandom: createSeededRandom(`${options.seed}:greedy:${episode}`),
          temperature: 1,
          sample: false,
          maxMovesPerGame: options.maxMovesPerGame,
          neuralPlayerIndices: rolloutNeuralPlayerIndices,
          policyByPlayer,
        })
      : null;
    const greedyBaselineDifferential = getMeanPlayerPointDifferential(
      greedyBaseline,
      learningPlayerIndices
    );
    const rollout = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(sampleTimingSeed),
      decisionRandom: createSeededRandom(`${options.seed}:sample:${episode}`),
      temperature: useGreedyCounterfactualStates ? 1 : options.temperature,
      sample: !useGreedyCounterfactualStates,
      maxMovesPerGame: options.maxMovesPerGame,
      neuralPlayerIndices: rolloutNeuralPlayerIndices,
      policyByPlayer,
      samplePlayerIndices,
      capturePlayerIndices: learningPlayerIndices,
      captureTransitions: useGreedyCounterfactualStates,
      captureTransitionBoards: creditMode === "counterfactual",
    });
    const finalDifferential = getMeanPlayerPointDifferential(
      rollout,
      learningPlayerIndices
    );
    const baselineDifferential =
      baselineMode === "greedy"
        ? greedyBaselineDifferential
        : teacherBaselineDifferential;
    const baselineAdjustedReturn =
      finalDifferential - baselineDifferential;
    const sampleMinusGreedyReturn =
      finalDifferential - greedyBaselineDifferential;
    const baselineRollout =
      baselineMode === "greedy" ? greedyBaseline : teacherBaseline;

    const localRewardReturns = getDiscountedLocalRewardReturns(
      rollout.transitions,
      options.localRewardDiscount
    );
    if (includeEpisodeMetrics) {
      trainingPlayerCountTotal += learningPlayerIndices.length;
      sampledDecisionCountTotal += rollout.transitions.length;
    }
    counterfactualScannedDecisionCountTotal += rollout.transitions.length;
    rollout.transitions.forEach((transition, transitionIndex) => {
      if (
        creditMode === "counterfactual" &&
        (options.counterfactualAnchorWeight > 0 ||
          options.counterfactualConnectorAnchorWeight > 0) &&
        transition.candidates.length > 1
      ) {
        counterfactualAnchorExamples.push(
          createCounterfactualAnchorExample(
            transition,
            episode,
            transitionIndex
          )
        );
      }
      const isExploratoryDecision =
        transition.selectedCandidateIndex !== transition.greedyCandidateIndex;
      if (isExploratoryDecision) {
        if (includeEpisodeMetrics) {
          exploratoryDecisionCountTotal += 1;
        }
      }
      const applyExploratoryFilter =
        updateScope === "exploratory" && !useGreedyCounterfactualStates;
      if (applyExploratoryFilter && !isExploratoryDecision) {
        return;
      }
      if (creditMode === "counterfactual") {
        const policyTopScoreGap = getPolicyTopScoreGap(
          transition.candidates,
          policy
        );
        if (
          options.counterfactualMaxPolicyMargin > 0 &&
          policyTopScoreGap != null &&
          policyTopScoreGap > options.counterfactualMaxPolicyMargin
        ) {
          counterfactualPolicyMarginSkippedCount += 1;
          return;
        }
        const result = getCounterfactualTransitionResult(
          transition,
          policy,
          `${options.seed}:counterfactual:${episode}:${transitionIndex}`,
          options.counterfactualRolloutCount,
          options.commonRandom,
          options.counterfactualRolloutMoves,
          options.counterfactualTrainingMode === "policy_gradient"
            ? 2
            : options.counterfactualCandidateLimit,
          options.counterfactualTrainingMode === "policy_gradient"
            ? 0
            : options.counterfactualMaxScoreGap,
          options.counterfactualScoreRewardWeight,
          options.counterfactualPounceRewardWeight,
          useSelfPlayOpponents || useChampionOpponents
            ? learningPlayerIndices
            : [transition.playerIndex],
          useChampionOpponents ? options.opponentPolicy : undefined
        );
        const counterfactualGap =
          options.counterfactualTrainingMode === "policy_gradient"
            ? result?.returnGap
            : result?.trainingGap;
        const counterfactualGapStandardError =
          options.counterfactualTrainingMode === "policy_gradient"
            ? result?.returnGapStandardError
            : result?.trainingGapStandardError;
        const behaviorGapLowerBound =
          result == null
            ? null
            : result.behaviorGap -
              Math.max(0, options.counterfactualGapStandardErrorMultiplier) *
                result.behaviorGapStandardError;
        const counterfactualGapLowerBound =
          counterfactualGap == null
            ? null
            : Math.abs(counterfactualGap) -
              Math.max(0, options.counterfactualGapStandardErrorMultiplier) *
                (counterfactualGapStandardError ?? 0);
        if (
          !result ||
          counterfactualGap == null ||
          (options.counterfactualTrainingMode === "policy_gradient" &&
            !isExploratoryDecision) ||
          Math.abs(counterfactualGap) < options.counterfactualMinReturnGap
        ) {
          return;
        }
        if (
          options.counterfactualTrainingMode !== "policy_gradient" &&
          options.counterfactualRequireBehaviorGap &&
          result.behaviorGap < options.counterfactualMinBehaviorImprovement
        ) {
          counterfactualBehaviorGapSkippedCount += 1;
          return;
        }
        if (
          options.counterfactualTrainingMode !== "policy_gradient" &&
          options.counterfactualRequireBehaviorGap &&
          (behaviorGapLowerBound == null ||
            behaviorGapLowerBound <
              options.counterfactualMinBehaviorImprovement)
        ) {
          counterfactualBehaviorConfidenceSkippedCount += 1;
          return;
        }
        if (
          counterfactualGapLowerBound == null ||
          counterfactualGapLowerBound < options.counterfactualMinReturnGap
        ) {
          counterfactualConfidenceSkippedCount += 1;
          return;
        }
        if (
          options.counterfactualTrainingMode !== "policy_gradient" &&
          getSafeWinRateThreshold(options.counterfactualMinBehaviorWinRate) >
            0 &&
          result.behaviorWinRate <
            getSafeWinRateThreshold(options.counterfactualMinBehaviorWinRate)
        ) {
          counterfactualBehaviorWinRateSkippedCount += 1;
          return;
        }
        if (
          options.counterfactualMaxReturnGap > 0 &&
          Math.abs(counterfactualGap) > options.counterfactualMaxReturnGap
        ) {
          counterfactualMaxReturnGapSkippedCount += 1;
          return;
        }
        if (
          options.counterfactualTrainingMode !== "policy_gradient" &&
          options.counterfactualRequirePolicyChange &&
          isCounterfactualBestGreedy(transition, result)
        ) {
          counterfactualPolicyChangeSkippedCount += 1;
          return;
        }
        if (
          options.counterfactualTrainingMode !== "policy_gradient" &&
          options.counterfactualSkipCycleOverConnector &&
          shouldSkipCycleOverConnectorLabel(result)
        ) {
          counterfactualConnectorCycleSkippedCount += 1;
          return;
        }
        if (
          options.counterfactualTrainingMode !== "policy_gradient" &&
          options.counterfactualSkipSolitaireOverUsefulCycle &&
          shouldSkipSolitaireOverUsefulCycleLabel(result)
        ) {
          counterfactualUsefulCycleSkippedCount += 1;
          return;
        }
        const scoreGap = getCounterfactualBestVsGreedyScoreGap(
          transition,
          result,
          policy
        );
        if (
          options.counterfactualTrainingMode !== "policy_gradient" &&
          options.counterfactualMaxScoreGap > 0 &&
          scoreGap != null &&
          scoreGap > options.counterfactualMaxScoreGap
        ) {
          counterfactualScoreGapSkippedCount += 1;
          return;
        }
        if (options.counterfactualTrainingMode !== "policy_gradient") {
          counterfactualSupervisedLabels.push({
            example: createCounterfactualSupervisedExample(
              transition,
              result,
              episode,
              transitionIndex
            ),
            returnGap: Math.abs(counterfactualGap),
            candidateCount: result.candidates.length,
            behaviorWinRate: result.behaviorWinRate,
            scoreGap,
          });
          return;
        }
        counterfactualReturnGapTotal += Math.abs(counterfactualGap);
        counterfactualCandidateCountTotal += result.candidates.length;
        counterfactualBehaviorWinRateTotal += result.behaviorWinRate;
        if (scoreGap != null) {
          counterfactualScoreGapTotal += scoreGap;
          counterfactualScoreGapCount += 1;
        }
        counterfactualUpdateCount += 1;
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
          getPlayerPointDifferentialReturn(
            rollout,
            baselineRollout,
            transition.playerIndex
          ) +
          options.localRewardWeight * localRewardReturns[transitionIndex],
      });
    });

    if (includeEpisodeMetrics) {
      finalPointDifferentialTotal += finalDifferential;
      teacherBaselinePointDifferentialTotal += teacherBaselineDifferential;
      greedyBaselinePointDifferentialTotal += greedyBaselineDifferential;
      baselinePointDifferentialTotal += baselineDifferential;
      baselineAdjustedReturnTotal += baselineAdjustedReturn;
      sampleMinusGreedyReturnTotal += sampleMinusGreedyReturn;
    }

    completedCounterfactualScanEpisodes += 1;
    if (
      shouldStopAfterCounterfactualLabels(
        counterfactualSupervisedLabels.length,
        options.counterfactualStopAfterLabels,
        options.counterfactualTrainingMode
      ) &&
      episode + 1 >= options.episodes
    ) {
      counterfactualStoppedAfterLabelTarget = true;
      break;
    }
  }

  const selectedCounterfactualLabels = selectCounterfactualSupervisedLabels(
    counterfactualSupervisedLabels,
    options.counterfactualScoreGapBudget
  );
  if (
    options.counterfactualTrainingMode !== "policy_gradient" &&
    options.counterfactualScoreGapBudget > 0
  ) {
    counterfactualScoreGapBudgetSkippedCount +=
      counterfactualSupervisedLabels.length - selectedCounterfactualLabels.length;
  }
  selectedCounterfactualLabels.forEach((label) => {
    counterfactualReturnGapTotal += label.returnGap;
    counterfactualCandidateCountTotal += label.candidateCount;
    counterfactualBehaviorWinRateTotal += label.behaviorWinRate;
    if (label.scoreGap != null) {
      counterfactualScoreGapTotal += label.scoreGap;
      counterfactualScoreGapCount += 1;
    }
    counterfactualUpdateCount += 1;
  });
  const counterfactualExamples = selectedCounterfactualLabels.map(
    (label) => label.example
  );

  const advantageStats =
    counterfactualExamples.length > 0 &&
    options.counterfactualTrainingMode !== "policy_gradient"
      ? trainCounterfactualSupervisedBatch(policy, counterfactualExamples, {
          mode: options.counterfactualTrainingMode,
          learningRate: options.learningRate,
          updateEpochs: options.updateEpochs,
          minReturnGap: options.counterfactualMinReturnGap,
          preferenceScope: options.counterfactualPreferenceScope,
          pairwiseTargetMargin: options.counterfactualPairwiseTargetMargin,
          pairwiseWeightMode: options.counterfactualPairwiseWeightMode,
          pairwiseWeightScale: options.counterfactualPairwiseWeightScale,
          pairwiseMaxWeight: options.counterfactualPairwiseMaxWeight,
          anchorExamples: counterfactualAnchorExamples,
          anchorWeight: options.counterfactualAnchorWeight,
          anchorMaxExamples: options.counterfactualAnchorMaxExamples,
          anchorTemperature: options.counterfactualAnchorTemperature,
          behaviorCorrectionWeight:
            options.counterfactualBehaviorCorrectionWeight,
          behaviorCorrectionMargin:
            options.counterfactualBehaviorCorrectionMargin,
          connectorAnchorWeight: options.counterfactualConnectorAnchorWeight,
          connectorAnchorMaxExamples:
            options.counterfactualConnectorAnchorMaxExamples,
          connectorAnchorMargin:
            options.counterfactualConnectorAnchorMargin,
          connectorAnchorMaxPolicyMargin:
            options.counterfactualConnectorAnchorMaxPolicyMargin,
          connectorAnchorMode: options.counterfactualConnectorAnchorMode,
          valueTargetScale: options.counterfactualValueTargetScale,
          valueCenterTargets: options.counterfactualValueCenterTargets,
          valueTargetMode: options.counterfactualValueTargetMode,
          valueHuberDelta: options.counterfactualValueHuberDelta,
          trainableLayers: options.trainableLayers,
          shuffleSeed: `${options.seed}:counterfactual-shuffle`,
        })
      : applyPolicyGradientBatch(policy, updates, {
          learningRate: options.learningRate,
          temperature: options.temperature,
          updateEpochs: options.updateEpochs,
          shuffleSeed: `${options.seed}:update-shuffle`,
          trainableLayers: options.trainableLayers,
          normalizeAdvantages: options.normalizeAdvantages,
          advantageClip: options.advantageClip,
        });

  return {
    opponentMode: options.opponentMode,
    averageTrainingPlayerCount:
      options.episodes === 0 ? 0 : trainingPlayerCountTotal / options.episodes,
    episodes: options.episodes,
    counterfactualScannedEpisodes: completedCounterfactualScanEpisodes,
    counterfactualStoppedAfterLabelTarget,
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
    averageCounterfactualScannedDecisionCount:
      completedCounterfactualScanEpisodes === 0
        ? 0
        : counterfactualScannedDecisionCountTotal /
          completedCounterfactualScanEpisodes,
    averageExploratoryDecisionCount:
      options.episodes === 0
        ? 0
        : exploratoryDecisionCountTotal / options.episodes,
    averageCounterfactualReturnGap:
      counterfactualUpdateCount === 0
        ? 0
        : counterfactualReturnGapTotal / counterfactualUpdateCount,
    averageCounterfactualCandidateCount:
      counterfactualUpdateCount === 0
        ? 0
        : counterfactualCandidateCountTotal / counterfactualUpdateCount,
    counterfactualTrainingUpdates: advantageStats.appliedUpdates,
    counterfactualUpdateCount,
    counterfactualMaxReturnGapSkippedCount,
    counterfactualBehaviorGapSkippedCount,
    counterfactualBehaviorConfidenceSkippedCount,
    counterfactualBehaviorWinRateSkippedCount,
    counterfactualPolicyMarginSkippedCount,
    counterfactualPolicyChangeSkippedCount,
    counterfactualConfidenceSkippedCount,
    counterfactualScoreGapSkippedCount,
    counterfactualScoreGapBudgetSkippedCount,
    counterfactualConnectorCycleSkippedCount,
    counterfactualUsefulCycleSkippedCount,
    averageCounterfactualScoreGap:
      counterfactualScoreGapCount === 0
        ? 0
        : counterfactualScoreGapTotal / counterfactualScoreGapCount,
    averageCounterfactualBehaviorWinRate:
      counterfactualUpdateCount === 0
        ? 0
        : counterfactualBehaviorWinRateTotal / counterfactualUpdateCount,
    counterfactualAveragePairWeight: advantageStats.averagePairWeight,
    counterfactualAnchorExamples: advantageStats.anchorExamples,
    counterfactualAnchorUpdates: advantageStats.anchorUpdates,
    counterfactualBehaviorCorrectionUpdates:
      advantageStats.behaviorCorrectionUpdates,
    counterfactualConnectorAnchorExamples:
      advantageStats.connectorAnchorExamples,
    counterfactualConnectorAnchorUpdates:
      advantageStats.connectorAnchorUpdates,
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

export function collectCounterfactualRlLabelAudit(
  policy: NeuralActionRankingPolicy,
  options: {
    playerCount: number;
    episodes: number;
    seed: string;
    temperature: number;
    commonRandom: boolean;
    counterfactualRolloutCount: number;
    counterfactualRolloutMoves: number;
    counterfactualCandidateLimit: number;
    counterfactualMinReturnGap: number;
    counterfactualMaxReturnGap: number;
    counterfactualRequireBehaviorGap: boolean;
    counterfactualMinBehaviorImprovement: number;
    counterfactualStateSource: CounterfactualStateSource;
    counterfactualTrainingMode: CounterfactualTrainingMode;
    counterfactualGapStandardErrorMultiplier: number;
    counterfactualMinBehaviorWinRate: number;
    counterfactualMaxPolicyMargin: number;
    counterfactualRequirePolicyChange: boolean;
    counterfactualMaxScoreGap: number;
    counterfactualScoreGapBudget: number;
    counterfactualStopAfterLabels: number;
    counterfactualScoreRewardWeight: number;
    counterfactualPounceRewardWeight: number;
    counterfactualSkipCycleOverConnector: boolean;
    counterfactualSkipSolitaireOverUsefulCycle: boolean;
    updateScope: PolicyGradientUpdateScope;
    maxMovesPerGame: number;
  }
): CounterfactualRlLabelAudit {
  const counterfactualSupervisedLabels: CounterfactualSupervisedLabel[] = [];
  let sampledDecisionCount = 0;
  let exploratoryDecisionCount = 0;
  let noResultSkippedCount = 0;
  let returnGapSkippedCount = 0;
  let policyGradientGreedySkippedCount = 0;
  let policyMarginSkippedCount = 0;
  let behaviorGapSkippedCount = 0;
  let behaviorConfidenceSkippedCount = 0;
  let behaviorWinRateSkippedCount = 0;
  let confidenceSkippedCount = 0;
  let maxReturnGapSkippedCount = 0;
  let policyChangeSkippedCount = 0;
  let scoreGapSkippedCount = 0;
  let scoreGapBudgetSkippedCount = 0;
  let connectorCycleSkippedCount = 0;
  let usefulCycleSkippedCount = 0;
  let counterfactualReturnGapTotal = 0;
  let counterfactualCandidateCountTotal = 0;
  let counterfactualBehaviorWinRateTotal = 0;
  let counterfactualScoreGapTotal = 0;
  let counterfactualScoreGapCount = 0;
  let counterfactualScannedEpisodes = 0;
  let stoppedAfterLabelTarget = false;
  const useGreedyCounterfactualStates =
    options.counterfactualStateSource === "greedy" &&
    options.counterfactualTrainingMode !== "policy_gradient";

  for (let episode = 0; episode < options.episodes; episode++) {
    const neuralPlayerIndex = episode % options.playerCount;
    const board = createTrainingBoard(
      options.playerCount,
      `${options.seed}:deal:${episode}`
    );
    const sharedTimingSeed = `${options.seed}:timing:${episode}`;
    const sampleTimingSeed = options.commonRandom
      ? sharedTimingSeed
      : `${options.seed}:sample-timing:${episode}`;
    const rollout = runPolicyRollout(board, {
      policy,
      random: createSeededRandom(sampleTimingSeed),
      decisionRandom: createSeededRandom(`${options.seed}:sample:${episode}`),
      temperature: useGreedyCounterfactualStates ? 1 : options.temperature,
      sample: !useGreedyCounterfactualStates,
      maxMovesPerGame: options.maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
      captureTransitions: useGreedyCounterfactualStates,
      captureTransitionBoards: true,
    });

    sampledDecisionCount += rollout.transitions.length;
    rollout.transitions.forEach((transition, transitionIndex) => {
      const isExploratoryDecision =
        transition.selectedCandidateIndex !== transition.greedyCandidateIndex;
      if (isExploratoryDecision) {
        exploratoryDecisionCount += 1;
      }
      const applyExploratoryFilter =
        options.updateScope === "exploratory" && !useGreedyCounterfactualStates;
      if (applyExploratoryFilter && !isExploratoryDecision) {
        return;
      }

      const policyTopScoreGap = getPolicyTopScoreGap(
        transition.candidates,
        policy
      );
      if (
        options.counterfactualMaxPolicyMargin > 0 &&
        policyTopScoreGap != null &&
        policyTopScoreGap > options.counterfactualMaxPolicyMargin
      ) {
        policyMarginSkippedCount += 1;
        return;
      }

      const result = getCounterfactualTransitionResult(
        transition,
        policy,
        `${options.seed}:counterfactual:${episode}:${transitionIndex}`,
        options.counterfactualRolloutCount,
        options.commonRandom,
        options.counterfactualRolloutMoves,
        options.counterfactualTrainingMode === "policy_gradient"
          ? 2
          : options.counterfactualCandidateLimit,
        options.counterfactualTrainingMode === "policy_gradient"
          ? 0
          : options.counterfactualMaxScoreGap,
        options.counterfactualScoreRewardWeight,
        options.counterfactualPounceRewardWeight
      );
      const counterfactualGap =
        options.counterfactualTrainingMode === "policy_gradient"
          ? result?.returnGap
          : result?.trainingGap;
      const counterfactualGapStandardError =
        options.counterfactualTrainingMode === "policy_gradient"
          ? result?.returnGapStandardError
          : result?.trainingGapStandardError;
      const behaviorGapLowerBound =
        result == null
          ? null
          : result.behaviorGap -
            Math.max(0, options.counterfactualGapStandardErrorMultiplier) *
              result.behaviorGapStandardError;
      const counterfactualGapLowerBound =
        counterfactualGap == null
          ? null
          : Math.abs(counterfactualGap) -
            Math.max(0, options.counterfactualGapStandardErrorMultiplier) *
              (counterfactualGapStandardError ?? 0);

      if (!result || counterfactualGap == null) {
        noResultSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualTrainingMode === "policy_gradient" &&
        !isExploratoryDecision
      ) {
        policyGradientGreedySkippedCount += 1;
        return;
      }
      if (Math.abs(counterfactualGap) < options.counterfactualMinReturnGap) {
        returnGapSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualTrainingMode !== "policy_gradient" &&
        options.counterfactualRequireBehaviorGap &&
        result.behaviorGap < options.counterfactualMinBehaviorImprovement
      ) {
        behaviorGapSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualTrainingMode !== "policy_gradient" &&
        options.counterfactualRequireBehaviorGap &&
        (behaviorGapLowerBound == null ||
          behaviorGapLowerBound < options.counterfactualMinBehaviorImprovement)
      ) {
        behaviorConfidenceSkippedCount += 1;
        return;
      }
      if (
        counterfactualGapLowerBound == null ||
        counterfactualGapLowerBound < options.counterfactualMinReturnGap
      ) {
        confidenceSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualTrainingMode !== "policy_gradient" &&
        getSafeWinRateThreshold(options.counterfactualMinBehaviorWinRate) > 0 &&
        result.behaviorWinRate <
          getSafeWinRateThreshold(options.counterfactualMinBehaviorWinRate)
      ) {
        behaviorWinRateSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualMaxReturnGap > 0 &&
        Math.abs(counterfactualGap) > options.counterfactualMaxReturnGap
      ) {
        maxReturnGapSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualTrainingMode !== "policy_gradient" &&
        options.counterfactualRequirePolicyChange &&
        isCounterfactualBestGreedy(transition, result)
      ) {
        policyChangeSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualTrainingMode !== "policy_gradient" &&
        options.counterfactualSkipCycleOverConnector &&
        shouldSkipCycleOverConnectorLabel(result)
      ) {
        connectorCycleSkippedCount += 1;
        return;
      }
      if (
        options.counterfactualTrainingMode !== "policy_gradient" &&
        options.counterfactualSkipSolitaireOverUsefulCycle &&
        shouldSkipSolitaireOverUsefulCycleLabel(result)
      ) {
        usefulCycleSkippedCount += 1;
        return;
      }

      const scoreGap = getCounterfactualBestVsGreedyScoreGap(
        transition,
        result,
        policy
      );
      if (
        options.counterfactualTrainingMode !== "policy_gradient" &&
        options.counterfactualMaxScoreGap > 0 &&
        scoreGap != null &&
        scoreGap > options.counterfactualMaxScoreGap
      ) {
        scoreGapSkippedCount += 1;
        return;
      }

      counterfactualSupervisedLabels.push({
        example: createCounterfactualSupervisedExample(
          transition,
          result,
          episode,
          transitionIndex
        ),
        returnGap: Math.abs(counterfactualGap),
        candidateCount: result.candidates.length,
        behaviorWinRate: result.behaviorWinRate,
        scoreGap,
      });
    });

    counterfactualScannedEpisodes += 1;
    if (
      shouldStopAfterCounterfactualLabels(
        counterfactualSupervisedLabels.length,
        options.counterfactualStopAfterLabels,
        options.counterfactualTrainingMode
      )
    ) {
      stoppedAfterLabelTarget = true;
      break;
    }
  }

  const selectedCounterfactualLabels = selectCounterfactualSupervisedLabels(
    counterfactualSupervisedLabels,
    options.counterfactualScoreGapBudget
  );
  if (
    options.counterfactualTrainingMode !== "policy_gradient" &&
    options.counterfactualScoreGapBudget > 0
  ) {
    scoreGapBudgetSkippedCount +=
      counterfactualSupervisedLabels.length - selectedCounterfactualLabels.length;
  }
  selectedCounterfactualLabels.forEach((label) => {
    counterfactualReturnGapTotal += label.returnGap;
    counterfactualCandidateCountTotal += label.candidateCount;
    counterfactualBehaviorWinRateTotal += label.behaviorWinRate;
    if (label.scoreGap != null) {
      counterfactualScoreGapTotal += label.scoreGap;
      counterfactualScoreGapCount += 1;
    }
  });
  const examples = selectedCounterfactualLabels.map((label) => label.example);

  return {
    examples,
    counterfactualScannedEpisodes,
    stoppedAfterLabelTarget,
    sampledDecisionCount,
    exploratoryDecisionCount,
    noResultSkippedCount,
    returnGapSkippedCount,
    policyGradientGreedySkippedCount,
    policyMarginSkippedCount,
    behaviorGapSkippedCount,
    behaviorConfidenceSkippedCount,
    behaviorWinRateSkippedCount,
    confidenceSkippedCount,
    policyChangeSkippedCount,
    scoreGapSkippedCount,
    scoreGapBudgetSkippedCount,
    connectorCycleSkippedCount,
    usefulCycleSkippedCount,
    maxReturnGapSkippedCount,
    averageCounterfactualReturnGap:
      examples.length === 0 ? 0 : counterfactualReturnGapTotal / examples.length,
    averageCounterfactualCandidateCount:
      examples.length === 0
        ? 0
        : counterfactualCandidateCountTotal / examples.length,
    averageCounterfactualScoreGap:
      counterfactualScoreGapCount === 0
        ? 0
        : counterfactualScoreGapTotal / counterfactualScoreGapCount,
    averageCounterfactualBehaviorWinRate:
      examples.length === 0
        ? 0
        : counterfactualBehaviorWinRateTotal / examples.length,
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
    trainableLayers: "all" | "output";
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
        options.temperature,
        0,
        options.trainableLayers
      );
      appliedUpdates += 1;
    });
  }

  return {
    mean,
    stdDev,
    appliedUpdates,
    averagePairWeight: 0,
    anchorExamples: 0,
    anchorUpdates: 0,
    behaviorCorrectionUpdates: 0,
    connectorAnchorExamples: 0,
    connectorAnchorUpdates: 0,
  };
}

function trainCounterfactualSupervisedBatch(
  policy: NeuralActionRankingPolicy,
  examples: ActionRankingImitationExample[],
  options: {
    mode: "pairwise" | "value";
    learningRate: number;
    updateEpochs: number;
    minReturnGap: number;
    preferenceScope: "all" | "behavior";
    pairwiseTargetMargin: number;
    pairwiseWeightMode: "uniform" | "return_gap";
    pairwiseWeightScale: number;
    pairwiseMaxWeight: number;
    anchorExamples: ActionRankingImitationExample[];
    anchorWeight: number;
    anchorMaxExamples: number;
    anchorTemperature: number;
    behaviorCorrectionWeight: number;
    behaviorCorrectionMargin: number;
    connectorAnchorWeight: number;
    connectorAnchorMaxExamples: number;
    connectorAnchorMargin: number;
    connectorAnchorMaxPolicyMargin: number;
    connectorAnchorMode: "connector" | "symmetric";
    valueTargetScale: number;
    valueCenterTargets: boolean;
    valueTargetMode: "absolute" | "residual";
    valueHuberDelta: number;
    trainableLayers: "all" | "output";
    shuffleSeed: string;
  }
) {
  const anchorPolicy =
    (options.anchorWeight > 0 || options.connectorAnchorWeight > 0) &&
    options.anchorExamples.length > 0
      ? new NeuralActionRankingPolicy(policy.getModel())
      : null;
  const signedGaps = examples.map((example) => {
    const returns = example.candidates
      .map((candidate) => getCounterfactualTrainingReturn(candidate))
      .filter((value): value is number => value != null);
    return returns.length === 0
      ? 0
      : Math.max(...returns) - Math.min(...returns);
  });
  const stats = summarizeValues(signedGaps);
  const trainingStats =
    options.mode === "value"
      ? policy.trainValueRegression(examples, {
          epochs: options.updateEpochs,
          learningRate: options.learningRate,
          centerTargets: options.valueCenterTargets,
          targetScale: options.valueTargetScale,
          targetMode: options.valueTargetMode,
          huberDelta: options.valueHuberDelta,
          trainableLayers: options.trainableLayers,
          shuffleSeed: options.shuffleSeed,
        })
      : policy.trainPairwisePreferences(examples, {
          epochs: options.updateEpochs,
          learningRate: options.learningRate,
          minReturnGap: options.minReturnGap,
          maxPairsPerExample: 1,
          preferenceScope: options.preferenceScope,
          targetMargin: options.pairwiseTargetMargin,
          pairWeightMode: options.pairwiseWeightMode,
          pairWeightScale: options.pairwiseWeightScale,
          pairWeightMax: options.pairwiseMaxWeight,
          trainableLayers: options.trainableLayers,
          shuffleSeed: options.shuffleSeed,
        });
  const behaviorCorrectionStats =
    options.behaviorCorrectionWeight <= 0 || examples.length === 0
      ? emptyTrainingStats(0)
      : policy.trainPairwisePreferences(examples, {
          epochs: options.updateEpochs,
          learningRate: options.learningRate * options.behaviorCorrectionWeight,
          minReturnGap: 0,
          maxPairsPerExample: 1,
          preferenceScope: "behavior",
          targetMargin: options.behaviorCorrectionMargin,
          trainableLayers: options.trainableLayers,
          shuffleSeed: `${options.shuffleSeed}:behavior-correction`,
        });
  const anchorExamples =
    anchorPolicy == null || options.anchorWeight <= 0
      ? []
      : createCounterfactualAnchorTargets(
          options.anchorExamples,
          anchorPolicy,
          options.anchorMaxExamples,
          `${options.shuffleSeed}:anchor-select`
        );
  const anchorStats =
    anchorExamples.length === 0
      ? emptyTrainingStats(0)
      : policy.trainRewardTargets(anchorExamples, {
          epochs: options.updateEpochs,
          learningRate: options.learningRate * options.anchorWeight,
          targetTemperature: options.anchorTemperature,
          trainableLayers: options.trainableLayers,
          shuffleSeed: `${options.shuffleSeed}:anchor`,
        });
  const connectorAnchorExamples =
    anchorPolicy == null || options.connectorAnchorWeight <= 0
      ? []
      : createConnectorCycleAnchorTargets(
          options.anchorExamples,
          anchorPolicy,
          options.connectorAnchorMaxExamples,
          options.connectorAnchorMaxPolicyMargin,
          options.connectorAnchorMode,
          `${options.shuffleSeed}:connector-anchor-select`
        );
  const connectorAnchorStats =
    connectorAnchorExamples.length === 0
      ? emptyTrainingStats(0)
      : policy.trainPairwisePreferences(connectorAnchorExamples, {
          epochs: options.updateEpochs,
          learningRate: options.learningRate * options.connectorAnchorWeight,
          minReturnGap: 0,
          maxPairsPerExample: 1,
          preferenceScope: "behavior",
          targetMargin: options.connectorAnchorMargin,
          trainableLayers: options.trainableLayers,
          shuffleSeed: `${options.shuffleSeed}:connector-anchor`,
        });

  return {
    mean: stats.mean,
    stdDev: stats.stdDev,
    appliedUpdates:
      trainingStats.updates +
      behaviorCorrectionStats.updates +
      anchorStats.updates +
      connectorAnchorStats.updates,
    averagePairWeight: trainingStats.averagePairWeight ?? 0,
    anchorExamples: anchorExamples.length,
    anchorUpdates: anchorStats.updates,
    behaviorCorrectionUpdates: behaviorCorrectionStats.updates,
    connectorAnchorExamples: connectorAnchorExamples.length,
    connectorAnchorUpdates: connectorAnchorStats.updates,
  };
}

function createCounterfactualAnchorTargets(
  examples: ActionRankingImitationExample[],
  anchorPolicy: NeuralActionRankingPolicy,
  maxExamples: number,
  seed: string
): ActionRankingImitationExample[] {
  const selectedExamples =
    maxExamples > 0 && examples.length > maxExamples
      ? shuffleCopy(examples, createSeededRandom(seed)).slice(0, maxExamples)
      : examples;

  return selectedExamples.map((example) => {
    const anchorScores = example.candidates.map((candidate) =>
      anchorPolicy.scoreFeatures(candidate.features)
    );
    const selectedCandidateIndex = anchorScores.reduce(
      (bestIndex, score, index) =>
        index === 0 || score > anchorScores[bestIndex] ? index : bestIndex,
      0
    );
    return {
      ...example,
      finalPlayerPoints: null,
      finalPointDifferential: null,
      pointDifferentialReturn: null,
      selectedActionKey:
        example.candidates[selectedCandidateIndex]?.key ?? null,
      selectedCandidateIndex,
      candidates: example.candidates.map((candidate, candidateIndex) => ({
        ...candidate,
        label: candidateIndex === selectedCandidateIndex ? 1 : 0,
        rolloutPointDifferentialReturn: anchorScores[candidateIndex],
      })),
    };
  });
}

function createConnectorCycleAnchorTargets(
  examples: ActionRankingImitationExample[],
  anchorPolicy: NeuralActionRankingPolicy,
  maxExamples: number,
  maxPolicyMargin: number,
  mode: "connector" | "symmetric",
  seed: string
): ActionRankingImitationExample[] {
  const connectorExamples = examples.flatMap((example) => {
    const anchorScores = example.candidates.map((candidate) =>
      anchorPolicy.scoreFeatures(candidate.features)
    );
    const connectorIndex = getBestCandidateIndexByMoveType(
      example,
      anchorScores,
      "c2s"
    );
    const cycleIndex = getBestCandidateIndexByMoveType(
      example,
      anchorScores,
      "cycle"
    );
    if (connectorIndex < 0 || cycleIndex < 0) {
      return [];
    }

    const policyMargin = anchorScores[connectorIndex] - anchorScores[cycleIndex];
    const absolutePolicyMargin = Math.abs(policyMargin);
    if (policyMargin === 0) {
      return [];
    }
    if (mode === "connector" && policyMargin < 0) {
      return [];
    }

    const connectorIsWinner =
      mode === "connector" ? true : policyMargin > 0;
    if (
      maxPolicyMargin > 0 &&
      (mode === "symmetric" ? absolutePolicyMargin : policyMargin) >
        maxPolicyMargin
    ) {
      return [];
    }

    const connector = example.candidates[connectorIndex];
    const cycle = example.candidates[cycleIndex];
    const winner = connectorIsWinner ? connector : cycle;
    const loser = connectorIsWinner ? cycle : connector;
    const winnerScore = connectorIsWinner
      ? anchorScores[connectorIndex]
      : anchorScores[cycleIndex];
    const loserScore = connectorIsWinner
      ? anchorScores[cycleIndex]
      : anchorScores[connectorIndex];
    return [
      {
        ...example,
        finalPlayerPoints: null,
        finalPointDifferential: null,
        pointDifferentialReturn: null,
        behaviorActionKey: loser.key,
        selectedActionKey: winner.key,
        selectedCandidateIndex: 0,
        candidates: [
          {
            ...winner,
            label: 1 as const,
            rolloutPointDifferentialReturn: winnerScore,
          },
          {
            ...loser,
            label: 0 as const,
            rolloutPointDifferentialReturn: loserScore,
          },
        ],
      },
    ];
  });

  return maxExamples > 0 && connectorExamples.length > maxExamples
    ? shuffleCopy(connectorExamples, createSeededRandom(seed)).slice(
        0,
        maxExamples
      )
    : connectorExamples;
}

function getBestCandidateIndexByMoveType(
  example: ActionRankingImitationExample,
  scores: readonly number[],
  moveType: Move["type"]
): number {
  return example.candidates.reduce((bestIndex, candidate, candidateIndex) => {
    if (candidate.move.type !== moveType) {
      return bestIndex;
    }
    if (bestIndex < 0 || scores[candidateIndex] > scores[bestIndex]) {
      return candidateIndex;
    }
    return bestIndex;
  }, -1);
}

function getCounterfactualBestVsGreedyScoreGap(
  transition: RolloutTransition,
  result: CounterfactualTransitionResult,
  policy: NeuralActionRankingPolicy
): number | null {
  const greedy = transition.candidates[transition.greedyCandidateIndex];
  if (!greedy) {
    return null;
  }
  const best = getCounterfactualBestCandidate(result);
  if (best.candidate.key === greedy.key) {
    return 0;
  }
  return (
    policy.scoreFeatures(greedy.features) -
    policy.scoreFeatures(best.candidate.features)
  );
}

function selectCounterfactualSupervisedLabels(
  labels: CounterfactualSupervisedLabel[],
  scoreGapBudget: number
): CounterfactualSupervisedLabel[] {
  const budget = Math.floor(scoreGapBudget);
  if (budget <= 0 || labels.length <= budget) {
    return labels;
  }

  return labels
    .map((label, index) => ({ label, index }))
    .sort((left, right) => {
      const scoreGapDelta =
        getSortableCounterfactualScoreGap(left.label) -
        getSortableCounterfactualScoreGap(right.label);
      if (scoreGapDelta !== 0) {
        return scoreGapDelta;
      }

      const returnGapDelta = right.label.returnGap - left.label.returnGap;
      return returnGapDelta !== 0 ? returnGapDelta : left.index - right.index;
    })
    .slice(0, budget)
    .map((item) => item.label);
}

function getSortableCounterfactualScoreGap(
  label: CounterfactualSupervisedLabel
): number {
  return label.scoreGap == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, label.scoreGap);
}

function shouldStopAfterCounterfactualLabels(
  labelCount: number,
  stopAfterLabels: number,
  trainingMode: CounterfactualTrainingMode
): boolean {
  return (
    trainingMode !== "policy_gradient" &&
    Math.floor(stopAfterLabels) > 0 &&
    labelCount >= Math.floor(stopAfterLabels)
  );
}

function isCounterfactualBestGreedy(
  transition: RolloutTransition,
  result: CounterfactualTransitionResult
): boolean {
  const greedy = transition.candidates[transition.greedyCandidateIndex];
  return greedy?.key === getCounterfactualBestCandidate(result).candidate.key;
}

function getCounterfactualBestCandidate(
  result: CounterfactualTransitionResult
): CounterfactualCandidateReturn {
  return result.candidates.reduce((winner, candidate) =>
    candidate.rolloutObjectiveReturn > winner.rolloutObjectiveReturn
      ? candidate
      : winner
  );
}

function shouldSkipCycleOverConnectorLabel(
  result: CounterfactualTransitionResult
): boolean {
  const best = getCounterfactualBestCandidate(result);
  if (best.candidate.move.type !== "cycle") {
    return false;
  }

  return result.candidates.some(
    (candidate) =>
      candidate.candidate.key !== best.candidate.key &&
      isSupportedConnectorCandidate(candidate.candidate)
  );
}

function shouldSkipSolitaireOverUsefulCycleLabel(
  result: CounterfactualTransitionResult
): boolean {
  const best = getCounterfactualBestCandidate(result);
  if (
    best.candidate.move.type !== "c2s" &&
    best.candidate.move.type !== "s2s"
  ) {
    return false;
  }

  return result.candidates.some(
    (candidate) =>
      candidate.candidate.key !== best.candidate.key &&
      isUsefulCycleRevealCandidate(candidate.candidate)
  );
}

function isSupportedConnectorCandidate(
  candidate: ActionRankingCandidate
): boolean {
  if (candidate.move.type !== "c2s") {
    return false;
  }
  return (
    getCandidateFeature(candidate, "solitaire.postTopConnectorCount") > 0 ||
    getCandidateFeature(candidate, "solitaire.postTopConnectorCloseness") > 0 ||
    getCandidateFeature(candidate, "solitaire.postTopConnectsPounce") > 0 ||
    getCandidateFeature(candidate, "solitaire.postTopConnectsStackRoot") > 0
  );
}

function isUsefulCycleRevealCandidate(
  candidate: ActionRankingCandidate
): boolean {
  if (candidate.move.type !== "cycle") {
    return false;
  }
  if (getCandidateFeature(candidate, "cycle.revealsCard") <= 0) {
    return false;
  }

  const centerPlayable =
    getCandidateFeature(candidate, "cycle.revealedCenterPlayable") > 0;
  const soonPlayable =
    getCandidateFeature(candidate, "cycle.revealedCanPlaySoon") > 0;
  const solitaireDestination =
    getCandidateFeature(
      candidate,
      "cycle.revealedOwnSolitaireDestinationCount"
    ) > 0;
  const pounceConnector =
    getCandidateFeature(
      candidate,
      "cycle.revealedOwnSolitaireConnectorForPounce"
    ) > 0;
  const parityMatch =
    getCandidateFeature(candidate, "cycle.revealedMatchesPounceParity") > 0;
  const pounceCloseness =
    getCandidateFeature(candidate, "cycle.revealedPounceConnectorCloseness") >
    0;
  return (
    centerPlayable ||
    (soonPlayable &&
      (solitaireDestination || pounceConnector || parityMatch || pounceCloseness))
  );
}

function getCandidateFeature(
  candidate: ActionRankingCandidate,
  featureName: (typeof ACTION_RANKING_FEATURE_NAMES)[number]
): number {
  const index = ACTION_RANKING_FEATURE_NAMES.indexOf(featureName);
  return index < 0 ? 0 : candidate.features[index] ?? 0;
}

function createCounterfactualAnchorExample(
  transition: RolloutTransition,
  episode: number,
  transitionIndex: number
): ActionRankingImitationExample {
  const greedy = transition.candidates[transition.greedyCandidateIndex];
  return {
    trialIndex: episode,
    stepIndex: transitionIndex,
    playerIndex: transition.playerIndex,
    playerPointDifferential: transition.pointDifferentialBefore,
    finalPlayerPoints: null,
    finalPointDifferential: null,
    pointDifferentialReturn: null,
    teacherActionKey: null,
    teacherPointDifferentialReturn: null,
    behaviorActionKey: greedy?.key ?? null,
    behaviorPointDifferentialReturn: null,
    selectedActionKey: greedy?.key ?? null,
    selectedCandidateIndex: transition.greedyCandidateIndex,
    candidates: transition.candidates.map((candidate, candidateIndex) => ({
      key: candidate.key,
      equivalenceKey: candidate.equivalenceKey,
      move: candidate.move,
      features: candidate.features,
      label: candidateIndex === transition.greedyCandidateIndex ? 1 : 0,
      immediatePointDelta: candidate.immediatePointDelta,
      immediatePointDifferentialDelta:
        candidate.immediatePointDifferentialDelta,
      endsRound: candidate.endsRound,
    })),
  };
}

function createCounterfactualSupervisedExample(
  transition: RolloutTransition,
  result: CounterfactualTransitionResult,
  episode: number,
  transitionIndex: number
): ActionRankingImitationExample {
  const greedy = transition.candidates[transition.greedyCandidateIndex];
  const best = result.candidates.reduce((winner, candidate) =>
    candidate.rolloutObjectiveReturn > winner.rolloutObjectiveReturn
      ? candidate
      : winner
  );
  const bestReturn = best.rolloutObjectiveReturn;
  const bestPointDifferentialReturn = best.rolloutPointDifferentialReturn;
  const bestKey = best.candidate.key;
  const selectedCandidateIndex = result.candidates.findIndex(
    (candidate) => candidate.candidate.key === bestKey
  );

  return {
    trialIndex: episode,
    stepIndex: transitionIndex,
    playerIndex: transition.playerIndex,
    playerPointDifferential: transition.pointDifferentialBefore,
    finalPlayerPoints: transition.scoreBefore + best.rolloutScoreReturn,
    finalPointDifferential:
      transition.pointDifferentialBefore + bestPointDifferentialReturn,
    pointDifferentialReturn: bestPointDifferentialReturn,
    teacherActionKey: null,
    teacherPointDifferentialReturn: null,
    behaviorActionKey: greedy.key,
    behaviorPointDifferentialReturn: result.greedyPointDifferentialReturn,
    behaviorObjectiveReturn: result.greedyReturn,
    selectedActionKey: bestKey,
    selectedCandidateIndex,
    candidates: result.candidates.map((candidateResult) => {
      const candidate = candidateResult.candidate;
      const rolloutPointDifferentialReturn =
        candidateResult.rolloutPointDifferentialReturn;
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
        rolloutScore: transition.scoreBefore + candidateResult.rolloutScoreReturn,
        rolloutScoreReturn: candidateResult.rolloutScoreReturn,
        rolloutPounceProgressReturn:
          candidateResult.rolloutPounceProgressReturn,
        rolloutObjectiveReturn: candidateResult.rolloutObjectiveReturn,
        endsRound: candidate.endsRound,
      };
    }),
  };
}

function getCounterfactualTrainingReturn(candidate: {
  rolloutObjectiveReturn?: number | null;
  rolloutPointDifferentialReturn?: number | null;
}): number | undefined {
  return (
    candidate.rolloutObjectiveReturn ??
    candidate.rolloutPointDifferentialReturn ??
    undefined
  );
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

function getCounterfactualTransitionResult(
  transition: RolloutTransition,
  policy: NeuralActionRankingPolicy,
  seed: string,
  rolloutCount: number,
  commonRandom: boolean,
  maxMoves: number,
  candidateLimit: number,
  maxScoreGap: number,
  scoreRewardWeight: number,
  pounceRewardWeight: number,
  continuationNeuralPlayerIndices: readonly number[] = [transition.playerIndex],
  opponentPolicy?: NeuralActionRankingPolicy
): CounterfactualTransitionResult | null {
  if (
    !transition.board ||
    transition.selectedCandidateIndex < 0 ||
    transition.selectedCandidateIndex >= transition.candidates.length ||
    transition.greedyCandidateIndex < 0 ||
    transition.greedyCandidateIndex >= transition.candidates.length
  ) {
    return null;
  }

  const candidateIndices = getCounterfactualCandidateIndices(
    transition,
    policy,
    candidateLimit,
    maxScoreGap
  );
  if (candidateIndices.length < 2) {
    return null;
  }

  const safeScoreWeight = Number.isFinite(scoreRewardWeight)
    ? scoreRewardWeight
    : 0;
  const safePounceWeight = Number.isFinite(pounceRewardWeight)
    ? pounceRewardWeight
    : 0;
  const candidates = candidateIndices.map((candidateIndex, index) => {
    const candidate = transition.candidates[candidateIndex];
    const outcomes = getCounterfactualPolicyOutcomes(
      transition.board!,
      transition.playerIndex,
      candidate.move,
      getCounterfactualSeeds(seed, index, rolloutCount, commonRandom),
      maxMoves,
      policy,
      continuationNeuralPlayerIndices,
      opponentPolicy
    );
    const pointDifferentialReturns = outcomes.map(
      (outcome) => outcome.pointDifferential - transition.pointDifferentialBefore
    );
    const scoreReturns = outcomes.map(
      (outcome) => outcome.score - transition.scoreBefore
    );
    const pounceProgressReturns = outcomes.map(
      (outcome) =>
        transition.pounceRemainingBefore - outcome.pounceRemaining
    );
    const objectiveReturns = pointDifferentialReturns.map(
      (value, outcomeIndex) =>
        value +
        safeScoreWeight * (scoreReturns[outcomeIndex] ?? 0) +
        safePounceWeight * (pounceProgressReturns[outcomeIndex] ?? 0)
    );
    const rolloutPointDifferentialReturn = meanNumbers(
      pointDifferentialReturns
    );
    const rolloutScoreReturn = meanNumbers(scoreReturns);
    const rolloutPounceProgressReturn = meanNumbers(pounceProgressReturns);
    const rolloutObjectiveReturn = meanNumbers(objectiveReturns);
    return {
      candidate,
      candidateIndex,
      rolloutPointDifferentialReturn,
      rolloutScoreReturn,
      rolloutPounceProgressReturn,
      rolloutObjectiveReturn,
      rolloutObjectiveReturns: objectiveReturns,
    };
  });
  const selectedCandidate = candidates.find(
    (candidate) => candidate.candidateIndex === transition.selectedCandidateIndex
  );
  const greedyCandidate = candidates.find(
    (candidate) => candidate.candidateIndex === transition.greedyCandidateIndex
  );
  const bestCandidate = candidates.reduce((best, candidate) =>
    candidate.rolloutObjectiveReturn > best.rolloutObjectiveReturn
      ? candidate
      : best
  );
  const worstCandidate = candidates.reduce((worst, candidate) =>
    candidate.rolloutObjectiveReturn < worst.rolloutObjectiveReturn
      ? candidate
      : worst
  );
  const selectedReturn = selectedCandidate?.rolloutObjectiveReturn ?? 0;
  const greedyReturn = greedyCandidate?.rolloutObjectiveReturn ?? 0;
  const selectedPointDifferentialReturn =
    selectedCandidate?.rolloutPointDifferentialReturn ?? 0;
  const greedyPointDifferentialReturn =
    greedyCandidate?.rolloutPointDifferentialReturn ?? 0;
  const returnGap = selectedReturn - greedyReturn;
  const trainingGap =
    bestCandidate.rolloutObjectiveReturn - worstCandidate.rolloutObjectiveReturn;
  const behaviorGap = bestCandidate.rolloutObjectiveReturn - greedyReturn;

  return {
    candidates,
    selectedReturn,
    greedyReturn,
    selectedPointDifferentialReturn,
    greedyPointDifferentialReturn,
    returnGap,
    returnGapStandardError:
      selectedCandidate && greedyCandidate
        ? getCounterfactualReturnGapStandardError(
            selectedCandidate,
            greedyCandidate
          )
        : 0,
    trainingGap,
    trainingGapStandardError: getCounterfactualReturnGapStandardError(
      bestCandidate,
      worstCandidate
    ),
    behaviorGap,
    behaviorGapStandardError: greedyCandidate
      ? getCounterfactualReturnGapStandardError(bestCandidate, greedyCandidate)
      : 0,
    behaviorWinRate: greedyCandidate
      ? getCounterfactualReturnGapWinRate(bestCandidate, greedyCandidate)
      : 0,
  };
}

function getSafeWinRateThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function getCounterfactualReturnGapWinRate(
  winner: CounterfactualCandidateReturn,
  loser: CounterfactualCandidateReturn
): number {
  if (winner.candidate.key === loser.candidate.key) {
    return 1;
  }
  const count = Math.min(
    winner.rolloutObjectiveReturns.length,
    loser.rolloutObjectiveReturns.length
  );
  if (count === 0) {
    return 0;
  }
  let winCount = 0;
  for (let index = 0; index < count; index++) {
    if (
      winner.rolloutObjectiveReturns[index] >
      loser.rolloutObjectiveReturns[index]
    ) {
      winCount += 1;
    }
  }
  return winCount / count;
}

function getCounterfactualReturnGapStandardError(
  winner: CounterfactualCandidateReturn,
  loser: CounterfactualCandidateReturn
): number {
  const count = Math.min(
    winner.rolloutObjectiveReturns.length,
    loser.rolloutObjectiveReturns.length
  );
  if (count <= 1) {
    return 0;
  }
  const gaps = Array.from(
    { length: count },
    (_, index) =>
      winner.rolloutObjectiveReturns[index] -
      loser.rolloutObjectiveReturns[index]
  );
  return getSampleStandardDeviation(gaps) / Math.sqrt(count);
}

function getCounterfactualCandidateIndices(
  transition: RolloutTransition,
  policy: NeuralActionRankingPolicy,
  candidateLimit: number,
  maxScoreGap: number
): number[] {
  const safeLimit = Math.max(2, Math.floor(candidateLimit));
  const scoreByIndex = transition.candidates.map((candidate) =>
    policy.scoreFeatures(candidate.features)
  );
  const greedyScore =
    transition.greedyCandidateIndex >= 0 &&
    transition.greedyCandidateIndex < scoreByIndex.length
      ? scoreByIndex[transition.greedyCandidateIndex]
      : null;
  const safeMaxScoreGap =
    Number.isFinite(maxScoreGap) && maxScoreGap > 0 ? maxScoreGap : 0;
  const indices: number[] = [];
  const addIndex = (candidateIndex: number) => {
    if (
      candidateIndex >= 0 &&
      candidateIndex < transition.candidates.length &&
      isCounterfactualCandidateWithinScoreGap(
        candidateIndex,
        transition.greedyCandidateIndex,
        scoreByIndex,
        greedyScore,
        safeMaxScoreGap
      ) &&
      !indices.includes(candidateIndex)
    ) {
      indices.push(candidateIndex);
    }
  };

  addIndex(transition.selectedCandidateIndex);
  addIndex(transition.greedyCandidateIndex);

  if (indices.length < safeLimit) {
    transition.candidates
      .map((_candidate, candidateIndex) => ({
        candidateIndex,
        score: scoreByIndex[candidateIndex] ?? Number.NEGATIVE_INFINITY,
      }))
      .sort((left, right) => right.score - left.score)
      .forEach(({ candidateIndex }) => {
        if (indices.length < safeLimit) {
          addIndex(candidateIndex);
        }
      });
  }

  return indices.slice(0, safeLimit);
}

function isCounterfactualCandidateWithinScoreGap(
  candidateIndex: number,
  greedyCandidateIndex: number,
  scoreByIndex: readonly number[],
  greedyScore: number | null,
  maxScoreGap: number
): boolean {
  if (maxScoreGap <= 0 || candidateIndex === greedyCandidateIndex) {
    return true;
  }
  if (greedyScore == null) {
    return true;
  }
  const candidateScore = scoreByIndex[candidateIndex];
  if (candidateScore == null) {
    return false;
  }
  return greedyScore - candidateScore <= maxScoreGap;
}

function getCounterfactualPolicyPointDifferential(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seeds: readonly string[],
  maxMoves: number,
  policy: NeuralActionRankingPolicy,
  continuationNeuralPlayerIndices: readonly number[] = [playerIndex],
  opponentPolicy?: NeuralActionRankingPolicy
): number {
  return meanNumbers(
    getCounterfactualPolicyOutcomes(
      board,
      playerIndex,
      move,
      seeds,
      maxMoves,
      policy,
      continuationNeuralPlayerIndices,
      opponentPolicy
    ).map((outcome) => outcome.pointDifferential)
  );
}

function getCounterfactualPolicyOutcomes(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seeds: readonly string[],
  maxMoves: number,
  policy: NeuralActionRankingPolicy,
  continuationNeuralPlayerIndices: readonly number[] = [playerIndex],
  opponentPolicy?: NeuralActionRankingPolicy
): CounterfactualOutcome[] {
  const safeSeeds = seeds.length > 0 ? seeds : ["policy-counterfactual"];
  return safeSeeds.map((seed) =>
    getCounterfactualPolicyOutcome(
      board,
      playerIndex,
      move,
      seed,
      maxMoves,
      policy,
      continuationNeuralPlayerIndices,
      opponentPolicy
    )
  );
}

function getCounterfactualPolicyOutcome(
  board: BoardState,
  playerIndex: number,
  move: Move,
  seed: string,
  maxMoves: number,
  policy: NeuralActionRankingPolicy,
  continuationNeuralPlayerIndices: readonly number[] = [playerIndex],
  opponentPolicy?: NeuralActionRankingPolicy
): CounterfactualOutcome {
  const nextBoard = deepClone(board);
  executeMove(nextBoard, playerIndex, move);
  const continuationPlayerSet = new Set(continuationNeuralPlayerIndices);
  const rollout = runPolicyRollout(nextBoard, {
    policy,
    random: createSeededRandom(seed),
    decisionRandom: createSeededRandom(`${seed}:decision`),
    temperature: 1,
    sample: false,
    maxMovesPerGame: maxMoves,
    neuralPlayerIndices: opponentPolicy
      ? nextBoard.players.map((_, index) => index)
      : continuationNeuralPlayerIndices,
    policyByPlayer: opponentPolicy
      ? (continuationPlayerIndex) =>
          continuationPlayerSet.has(continuationPlayerIndex)
            ? policy
            : opponentPolicy
      : undefined,
  });
  return {
    pointDifferential: rollout.finalPointDifferentials[playerIndex] ?? 0,
    score: rollout.finalScores[playerIndex] ?? 0,
    pounceRemaining: rollout.finalPounceCounts[playerIndex] ?? 0,
  };
}

function getMeanPlayerPointDifferential(
  rollout: RolloutResult | null,
  playerIndices: readonly number[]
): number {
  if (!rollout || playerIndices.length === 0) {
    return 0;
  }
  return meanNumbers(
    playerIndices.map(
      (playerIndex) => rollout.finalPointDifferentials[playerIndex] ?? 0
    )
  );
}

function getPlayerPointDifferentialReturn(
  rollout: RolloutResult,
  baselineRollout: RolloutResult | null,
  playerIndex: number
): number {
  const finalDifferential = rollout.finalPointDifferentials[playerIndex] ?? 0;
  const baselineDifferential =
    baselineRollout?.finalPointDifferentials[playerIndex] ?? 0;
  return finalDifferential - baselineDifferential;
}

function getDiscountedLocalRewardReturns(
  transitions: readonly RolloutTransition[],
  discount: number
): number[] {
  const safeDiscount = Math.max(0, Math.min(1, discount));
  const returns = Array.from({ length: transitions.length }, () => 0);
  const runningReturnByPlayer = new Map<number, number>();

  for (let index = transitions.length - 1; index >= 0; index--) {
    const playerIndex = transitions[index].playerIndex;
    const runningReturn =
      transitions[index].localReward +
      safeDiscount * (runningReturnByPlayer.get(playerIndex) ?? 0);
    returns[index] = runningReturn;
    runningReturnByPlayer.set(playerIndex, runningReturn);
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
    basicMoveProvider?: BasicMoveProvider;
  } = {}
): PolicyEvaluationResult {
  const playerCount = options.playerCount ?? 4;
  const games = options.games ?? 12;
  const seed = options.seed ?? "action-ranking-eval";
  const maxMovesPerGame = options.maxMovesPerGame ?? DEFAULT_MAX_MOVES_PER_GAME;
  const basicMoveProvider = options.basicMoveProvider;
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
      basicMoveProvider,
    });
    const random = createSeededRandom(`${seed}:sample:${gameIndex}`);
    const rollout = runPolicyRollout(board, {
      policy,
      random,
      temperature: 1,
      sample: false,
      maxMovesPerGame,
      neuralPlayerIndices: [neuralPlayerIndex],
      basicMoveProvider,
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

export function evaluateNeuralModelAgainstBasicStyle(
  model: NeuralActionRankingModel,
  styleName: string,
  options: {
    playerCount?: number;
    games?: number;
    seed?: string;
    maxMovesPerGame?: number;
  } = {}
): PolicyEvaluationResult {
  return evaluateNeuralPolicyAgainstBasicStyle(
    new NeuralActionRankingPolicy(model),
    styleName,
    options
  );
}

export function evaluateNeuralPolicyAgainstBasicStyle(
  policy: NeuralActionRankingPolicy,
  styleName: string,
  options: {
    playerCount?: number;
    games?: number;
    seed?: string;
    maxMovesPerGame?: number;
  } = {}
): PolicyEvaluationResult {
  return evaluateNeuralPolicy(policy, {
    ...options,
    basicMoveProvider: (board, playerIndex) =>
      getBasicAIMoveForStyle(board, playerIndex, {}, styleName),
  });
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

export function compareNeuralModelsSelfPlay(
  modelA: NeuralActionRankingModel,
  modelB: NeuralActionRankingModel,
  options: SelfPlayComparisonOptions = {}
): PolicyComparisonResult {
  const policyA = new NeuralActionRankingPolicy(modelA);
  const policyB = new NeuralActionRankingPolicy(modelB);
  const playerCount = options.playerCount ?? 4;
  if (playerCount < 2) {
    throw new Error("Self-play comparison requires at least two players.");
  }
  const games = options.games ?? 12;
  const seed = options.seed ?? "action-ranking-self-play";
  const maxMovesPerGame = options.maxMovesPerGame ?? DEFAULT_MAX_MOVES_PER_GAME;
  const swapSeats = options.swapSeats ?? true;
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
  let rolloutCount = 0;

  for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const board = createTrainingBoard(playerCount, `${seed}:deal:${gameIndex}`);
    const seatPasses = swapSeats ? [false, true] : [false];
    const dealPointDifferentialDeltas: number[] = [];
    seatPasses.forEach((swapped) => {
      const modelASeats = getSelfPlayModelASeats(
        playerCount,
        gameIndex,
        swapped
      );
      const modelBSeats = Array.from({ length: playerCount }, (_, index) => index)
        .filter((playerIndex) => !modelASeats.has(playerIndex));
      const rollout = runPolicyRollout(board, {
        policy: policyA,
        random: createSeededRandom(`${seed}:rollout:${gameIndex}`),
        temperature: 1,
        sample: false,
        maxMovesPerGame,
        policyByPlayer: (playerIndex) =>
          modelASeats.has(playerIndex) ? policyA : policyB,
      });
      const metricsA = getRolloutGroupMetrics(rollout, Array.from(modelASeats));
      const metricsB = getRolloutGroupMetrics(rollout, modelBSeats);
      const pointDifferentialDelta =
        metricsA.pointDifferential - metricsB.pointDifferential;

      rolloutCount += 1;
      dealPointDifferentialDeltas.push(pointDifferentialDelta);
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

      if (metricsA.pounceRemaining === 0) {
        modelAPounceOuts += 1;
      }
      if (metricsB.pounceRemaining === 0) {
        modelBPounceOuts += 1;
      }
    });
    const dealPointDifferentialDelta = meanNumbers(
      dealPointDifferentialDeltas
    );
    pointDifferentialDeltas.push(dealPointDifferentialDelta);
    if (dealPointDifferentialDelta > 0) {
      modelABetterCount += 1;
    } else if (dealPointDifferentialDelta < 0) {
      modelBBetterCount += 1;
    } else {
      tiedDifferentialCount += 1;
    }
  }

  const comparisonCount = pointDifferentialDeltas.length;
  return {
    games: comparisonCount,
    averageModelAPointDifferential:
      rolloutCount === 0 ? 0 : modelADifferentialTotal / rolloutCount,
    averageModelBPointDifferential:
      rolloutCount === 0 ? 0 : modelBDifferentialTotal / rolloutCount,
    averagePointDifferentialDelta:
      comparisonCount === 0
        ? 0
        : pointDifferentialDeltas.reduce((sum, value) => sum + value, 0) /
          comparisonCount,
    pointDifferentialDeltaStandardError:
      standardError(pointDifferentialDeltas),
    modelABetterRate:
      comparisonCount === 0 ? 0 : modelABetterCount / comparisonCount,
    modelBBetterRate:
      comparisonCount === 0 ? 0 : modelBBetterCount / comparisonCount,
    tiedPointDifferentialRate:
      comparisonCount === 0 ? 0 : tiedDifferentialCount / comparisonCount,
    averageModelAScore: rolloutCount === 0 ? 0 : modelAScoreTotal / rolloutCount,
    averageModelBScore: rolloutCount === 0 ? 0 : modelBScoreTotal / rolloutCount,
    averageScoreDelta:
      rolloutCount === 0 ? 0 : (modelAScoreTotal - modelBScoreTotal) / rolloutCount,
    averageModelADecisionCount:
      rolloutCount === 0 ? 0 : modelADecisionCountTotal / rolloutCount,
    averageModelBDecisionCount:
      rolloutCount === 0 ? 0 : modelBDecisionCountTotal / rolloutCount,
    averageModelACenterMoveRate:
      rolloutCount === 0 ? 0 : modelACenterMoveRateTotal / rolloutCount,
    averageModelBCenterMoveRate:
      rolloutCount === 0 ? 0 : modelBCenterMoveRateTotal / rolloutCount,
    averageModelASolitaireMoveRate:
      rolloutCount === 0 ? 0 : modelASolitaireMoveRateTotal / rolloutCount,
    averageModelBSolitaireMoveRate:
      rolloutCount === 0 ? 0 : modelBSolitaireMoveRateTotal / rolloutCount,
    averageModelACycleMoveRate:
      rolloutCount === 0 ? 0 : modelACycleMoveRateTotal / rolloutCount,
    averageModelBCycleMoveRate:
      rolloutCount === 0 ? 0 : modelBCycleMoveRateTotal / rolloutCount,
    averageModelAPounceRemaining:
      rolloutCount === 0 ? 0 : modelAPounceRemainingTotal / rolloutCount,
    averageModelBPounceRemaining:
      rolloutCount === 0 ? 0 : modelBPounceRemainingTotal / rolloutCount,
    modelAPounceOutRate:
      rolloutCount === 0 ? 0 : modelAPounceOuts / rolloutCount,
    modelBPounceOutRate:
      rolloutCount === 0 ? 0 : modelBPounceOuts / rolloutCount,
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
    neuralPlayerIndices?: readonly number[];
    samplePlayerIndices?: readonly number[];
    capturePlayerIndices?: readonly number[];
    policyByPlayer?: (
      playerIndex: number
    ) => NeuralActionRankingPolicy | undefined;
    captureTransitions?: boolean;
    captureTransitionBoards?: boolean;
    basicMoveProvider?: BasicMoveProvider;
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
  const samplePlayers =
    options.samplePlayerIndices == null
      ? null
      : new Set(options.samplePlayerIndices);
  const capturePlayers =
    options.capturePlayerIndices == null
      ? null
      : new Set(options.capturePlayerIndices);
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

    const playerPolicy =
      options.policyByPlayer?.(playerIndex) ??
      (neuralPlayers.has(playerIndex) ? options.policy : undefined);
    const shouldSample =
      options.sample && (samplePlayers == null || samplePlayers.has(playerIndex));
    const shouldCapture =
      capturePlayers == null || capturePlayers.has(playerIndex);
    const move = playerPolicy
      ? chooseNeuralMove(
          board,
          playerIndex,
          {
            ...options,
            policy: playerPolicy,
            sample: shouldSample,
            captureTransition: shouldCapture,
          },
          transitions
        )
      : options.basicMoveProvider
        ? options.basicMoveProvider(board, playerIndex)
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
    captureTransitions?: boolean;
    captureTransitionBoards?: boolean;
    captureTransition?: boolean;
  },
  transitions: RolloutTransition[]
): Move | undefined {
  const candidates = enumerateActionRankingCandidates(board, playerIndex);
  if (candidates.length === 0) {
    return;
  }

  const pointDifferentialBefore = getPointDifferential(board, playerIndex);
  const scoreBefore = getCurrentPointsFromCards(board.players[playerIndex]);
  const pounceRemainingBefore =
    board.players[playerIndex]?.pounceDeck.length ?? 0;
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
  if (
    selectedCandidateIndex >= 0 &&
    options.captureTransition !== false &&
    (options.sample || options.captureTransitions)
  ) {
    transitions.push({
      playerIndex,
      pointDifferentialBefore,
      scoreBefore,
      pounceRemainingBefore,
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

function getRolloutGroupMetrics(
  rollout: RolloutResult,
  playerIndices: readonly number[]
) {
  const safePlayerIndices = playerIndices.filter(
    (playerIndex) =>
      playerIndex >= 0 && playerIndex < rollout.finalScores.length
  );
  const playerCount = Math.max(1, safePlayerIndices.length);
  const moveCounts = createMoveTypeCounts();
  safePlayerIndices.forEach((playerIndex) => {
    const playerMoveCounts =
      rollout.moveTypeCountsByPlayer[playerIndex] ?? createMoveTypeCounts();
    MOVE_TYPES.forEach((moveType) => {
      moveCounts[moveType] += playerMoveCounts[moveType];
    });
  });
  return {
    score:
      safePlayerIndices.reduce(
        (sum, playerIndex) => sum + (rollout.finalScores[playerIndex] ?? 0),
        0
      ) / playerCount,
    pointDifferential:
      safePlayerIndices.reduce(
        (sum, playerIndex) =>
          sum + (rollout.finalPointDifferentials[playerIndex] ?? 0),
        0
      ) / playerCount,
    pounceRemaining:
      safePlayerIndices.reduce(
        (sum, playerIndex) =>
          sum + (rollout.finalPounceCounts[playerIndex] ?? 0),
        0
      ) / playerCount,
    decisionCount: getTotalMoveCount(moveCounts) / playerCount,
    centerMoveRate: getMoveRate(moveCounts, ["c2c"]),
    solitaireMoveRate: getMoveRate(moveCounts, ["c2s", "s2s"]),
    cycleMoveRate: getMoveRate(moveCounts, ["cycle", "flip_deck"]),
  };
}

function getSelfPlayModelASeats(
  playerCount: number,
  gameIndex: number,
  swapped: boolean
): Set<number> {
  const modelASeats = new Set<number>();
  const targetParity = (gameIndex + (swapped ? 1 : 0)) % 2;
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    if (playerIndex % 2 === targetParity) {
      modelASeats.add(playerIndex);
    }
  }
  return modelASeats;
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
