import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  type ActionRankingCandidate,
  type ActionRankingFeatureName,
  type ActionRankingOptions,
} from "./ActionRankingPolicy";
import type { BoardState } from "./GameUtils";
import type { Move } from "./MoveHandler";
import type {
  ActionRankingImitationCandidate,
  ActionRankingImitationExample,
} from "./ActionRankingImitation";

export type NeuralActionRankingModelV1 = {
  version: 1;
  featureNames: string[];
  inputSize: number;
  hiddenSize: number;
  inputToHidden: number[][];
  hiddenBias: number[];
  hiddenToOutput: number[];
  outputBias: number;
};

export type NeuralActionRankingModelV2 = {
  version: 2;
  featureNames: string[];
  inputSize: number;
  hiddenLayerSizes: number[];
  layerWeights: number[][][];
  layerBiases: number[][];
  outputWeights: number[];
  outputBias: number;
};

export type NeuralActionRankingModel =
  | NeuralActionRankingModelV1
  | NeuralActionRankingModelV2;

export type ActionRankingPrediction = {
  candidate: ActionRankingCandidate;
  score: number;
  probability: number;
};

export type ImitationTrainingOptions = {
  epochs?: number;
  learningRate?: number;
  l2?: number;
  shuffleSeed?: string;
  equivalentTargets?: boolean;
  trainableLayers?: "all" | "output";
};

export type ImitationTrainingStats = {
  epochs: number;
  examples: number;
  updates: number;
  averageLoss: number;
  accuracy: number;
  pairs?: number;
  averagePairReturnGap?: number;
  averagePairWeight?: number;
};

export type RewardTargetTrainingOptions = ImitationTrainingOptions & {
  targetTemperature?: number;
};

export type PairwiseFeatureMode = "raw" | "delta" | "tactical";

export type PreferenceTrainingOptions = ImitationTrainingOptions & {
  minReturnGap?: number;
  maxPairsPerExample?: number;
  temperature?: number;
  preferenceScope?: "all" | "behavior";
  targetMargin?: number;
  pairWeightMode?: "uniform" | "return_gap";
  pairWeightScale?: number;
  pairWeightMax?: number;
  featureMode?: PairwiseFeatureMode;
  stopMargin?: number;
};

export type ValueRegressionTrainingOptions = ImitationTrainingOptions & {
  centerTargets?: boolean;
  targetScale?: number;
  targetMode?: "absolute" | "residual";
  huberDelta?: number;
};

type ForwardPass = {
  layerInputs: number[][];
  activations: number[][];
  score: number;
};

const DEFAULT_HIDDEN_LAYER_SIZES = [48];
const DEFAULT_LEARNING_RATE = 0.02;

export class NeuralActionRankingPolicy {
  private model: NeuralActionRankingModelV2;
  private featureInputIndices: number[];

  constructor(model?: NeuralActionRankingModel) {
    this.model = model
      ? alignModelToCurrentFeatures(toV2Model(model))
      : createNeuralActionRankingModel();
    assertModelShape(this.model);
    this.featureInputIndices = getFeatureInputIndices(this.model.featureNames);
  }

  static create(
    options: {
      hiddenSize?: number;
      hiddenLayerSizes?: readonly number[];
      seed?: string;
    } = {}
  ) {
    return new NeuralActionRankingPolicy(
      createNeuralActionRankingModel(
        options.hiddenLayerSizes ?? options.hiddenSize,
        options.seed
      )
    );
  }

  getModel(): NeuralActionRankingModel {
    return cloneModel(this.model);
  }

  rankCandidates(
    candidates: readonly ActionRankingCandidate[],
    temperature = 1
  ): ActionRankingPrediction[] {
    if (candidates.length === 0) {
      return [];
    }

    const scores = candidates.map((candidate) =>
      this.scoreFeatures(candidate.features)
    );
    const probabilities = softmax(scores, temperature);
    return candidates
      .map((candidate, index) => ({
        candidate,
        score: scores[index],
        probability: probabilities[index],
      }))
      .sort((a, b) => b.score - a.score);
  }

  chooseMove(
    board: BoardState,
    playerIndex: number,
    options: {
      temperature?: number;
      random?: () => number;
      sample?: boolean;
      actionOptions?: ActionRankingOptions;
    } = {}
  ): Move | undefined {
    const candidates = enumerateActionRankingCandidates(
      board,
      playerIndex,
      options.actionOptions
    );
    const selected = this.chooseCandidate(candidates, options);
    return selected?.move;
  }

  chooseCandidate(
    candidates: readonly ActionRankingCandidate[],
    options: { temperature?: number; random?: () => number; sample?: boolean } = {}
  ): ActionRankingCandidate | undefined {
    if (candidates.length === 0) {
      return;
    }

    const scores = candidates.map((candidate) =>
      this.scoreFeatures(candidate.features)
    );
    if (!options.sample) {
      return candidates[getBestIndex(scores)];
    }

    const probabilities = softmax(scores, options.temperature ?? 1);
    return candidates[sampleIndex(probabilities, options.random ?? Math.random)];
  }

  scoreFeatures(features: readonly number[]): number {
    return this.forward(this.prepareFeatures(features)).score;
  }

  trainImitation(
    examples: readonly ActionRankingImitationExample[],
    options: ImitationTrainingOptions = {}
  ): ImitationTrainingStats {
    const epochs = Math.max(1, Math.floor(options.epochs ?? 1));
    const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
    const l2 = options.l2 ?? 0;
    const trainableLayers = options.trainableLayers ?? "all";
    const random = createSeededRandom(options.shuffleSeed ?? "imitation");
    let totalLoss = 0;
    let totalExamples = 0;
    let correct = 0;
    let updates = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const shuffled = shuffleCopy(examples, random);
      shuffled.forEach((example) => {
        if (
          example.selectedCandidateIndex == null ||
          example.selectedCandidateIndex < 0 ||
          example.selectedCandidateIndex >= example.candidates.length
        ) {
          return;
        }

        const candidates = example.candidates.map((candidate) => ({
          key: candidate.key,
          equivalenceKey: candidate.equivalenceKey,
          move: candidate.move,
          features: candidate.features,
          immediatePointDelta: candidate.immediatePointDelta,
          immediatePointDifferentialDelta:
            candidate.immediatePointDifferentialDelta,
          endsRound: candidate.endsRound,
        }));
        const scores = candidates.map((candidate) =>
          this.scoreFeatures(candidate.features)
        );
        const probabilities = softmax(scores);
        const targetProbabilities = getImitationTargetProbabilities(
          example,
          options.equivalentTargets ?? false
        );
        totalLoss += targetProbabilities.reduce((sum, target, index) => {
          return sum - target * Math.log(Math.max(1e-12, probabilities[index]));
        }, 0);
        totalExamples += 1;
        if (isImitationPredictionCorrect(example, getBestIndex(scores), options)) {
          correct += 1;
        }

        this.applyDistributionGradient(
          candidates,
          probabilities,
          targetProbabilities,
          learningRate,
          1,
          l2,
          trainableLayers
        );
        updates += 1;
      });
    }

    return {
      epochs,
      examples: totalExamples,
      updates,
      averageLoss: totalExamples === 0 ? 0 : totalLoss / totalExamples,
      accuracy: totalExamples === 0 ? 0 : correct / totalExamples,
    };
  }

  trainPolicyGradient(
    candidates: readonly ActionRankingCandidate[],
    selectedCandidateIndex: number,
    advantage: number,
    learningRate: number,
    temperature = 1,
    l2 = 0,
    trainableLayers: "all" | "output" = "all"
  ): void {
    if (
      candidates.length === 0 ||
      selectedCandidateIndex < 0 ||
      selectedCandidateIndex >= candidates.length ||
      advantage === 0
    ) {
      return;
    }

    const scores = candidates.map((candidate) =>
      this.scoreFeatures(candidate.features)
    );
    const probabilities = softmax(scores, temperature);
    this.applyListwiseGradient(
      candidates,
      probabilities,
      selectedCandidateIndex,
      learningRate,
      advantage,
      l2,
      trainableLayers
    );
  }

  trainRewardTargets(
    examples: readonly ActionRankingImitationExample[],
    options: RewardTargetTrainingOptions = {}
  ): ImitationTrainingStats {
    const epochs = Math.max(1, Math.floor(options.epochs ?? 1));
    const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
    const l2 = options.l2 ?? 0;
    const trainableLayers = options.trainableLayers ?? "all";
    const targetTemperature = options.targetTemperature ?? 4;
    const random = createSeededRandom(options.shuffleSeed ?? "reward-targets");
    let totalLoss = 0;
    let totalExamples = 0;
    let correct = 0;
    let updates = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const shuffled = shuffleCopy(examples, random);
      shuffled.forEach((example) => {
        if (
          example.candidates.length === 0 ||
          example.candidates.some(
            (candidate) => getCandidateReturn(candidate) == null
          )
        ) {
          return;
        }

        const candidates = example.candidates.map((candidate) => ({
          key: candidate.key,
          move: candidate.move,
          features: candidate.features,
          immediatePointDelta: candidate.immediatePointDelta,
          immediatePointDifferentialDelta:
            candidate.immediatePointDifferentialDelta,
          endsRound: candidate.endsRound,
        }));
        const targetScores = example.candidates.map(
          (candidate) => getCandidateReturn(candidate) ?? 0
        );
        const targetProbabilities = softmax(targetScores, targetTemperature);
        const scores = candidates.map((candidate) =>
          this.scoreFeatures(candidate.features)
        );
        const probabilities = softmax(scores);
        totalLoss += targetProbabilities.reduce((sum, target, index) => {
          return sum - target * Math.log(Math.max(1e-12, probabilities[index]));
        }, 0);
        totalExamples += 1;
        if (getBestIndex(scores) === getBestIndex(targetScores)) {
          correct += 1;
        }

        this.applyDistributionGradient(
          candidates,
          probabilities,
          targetProbabilities,
          learningRate,
          1,
          l2,
          trainableLayers
        );
        updates += 1;
      });
    }

    return {
      epochs,
      examples: totalExamples,
      updates,
      averageLoss: totalExamples === 0 ? 0 : totalLoss / totalExamples,
      accuracy: totalExamples === 0 ? 0 : correct / totalExamples,
    };
  }

  trainPairwisePreferences(
    examples: readonly ActionRankingImitationExample[],
    options: PreferenceTrainingOptions = {}
  ): ImitationTrainingStats {
    const epochs = Math.max(1, Math.floor(options.epochs ?? 1));
    const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
    const l2 = options.l2 ?? 0;
    const trainableLayers = options.trainableLayers ?? "all";
    const minReturnGap = Math.max(0, options.minReturnGap ?? 1);
    const maxPairsPerExample = Math.max(
      0,
      Math.floor(options.maxPairsPerExample ?? 12)
    );
    const temperature = Math.max(1e-6, options.temperature ?? 1);
    const preferenceScope = options.preferenceScope ?? "all";
    const targetMargin = Math.max(0, options.targetMargin ?? 0);
    const pairWeightMode = options.pairWeightMode ?? "uniform";
    const pairWeightScale = Math.max(
      1e-6,
      options.pairWeightScale ?? Math.max(1, minReturnGap)
    );
    const pairWeightMax = Math.max(0, options.pairWeightMax ?? 1);
    const featureMode = options.featureMode ?? "raw";
    const stopMargin = options.stopMargin ?? -1;
    const hasStopMargin = Number.isFinite(stopMargin) && stopMargin >= 0;
    const random = createSeededRandom(options.shuffleSeed ?? "preferences");
    let totalLoss = 0;
    let totalExamples = 0;
    let correct = 0;
    let updates = 0;
    let returnGapTotal = 0;
    let pairWeightTotal = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const shuffled = shuffleCopy(examples, random);
      shuffled.forEach((example) => {
        const pairs = getPreferencePairs(
          example,
          minReturnGap,
          maxPairsPerExample,
          random,
          preferenceScope
        );
        if (pairs.length === 0) {
          return;
        }

        totalExamples += 1;
        pairs.forEach((pair) => {
          const winner = example.candidates[pair.winnerIndex];
          const loser = example.candidates[pair.loserIndex];
          const pairWeight = getPreferencePairWeight(pair.returnGap, {
            mode: pairWeightMode,
            scale: pairWeightScale,
            max: pairWeightMax,
          });
          if (pairWeight <= 0) {
            return;
          }

          const winnerScore = this.scoreFeatures(winner.features);
          const loserScore = this.scoreFeatures(loser.features);
          const margin = (winnerScore - loserScore) / temperature;
          if (hasStopMargin && margin >= stopMargin) {
            if (winnerScore > loserScore) {
              correct += 1;
            }
            return;
          }
          const marginError = targetMargin - margin;
          const mistakeProbability = sigmoid(marginError);
          totalLoss += pairWeight * softplus(marginError);
          returnGapTotal += pair.returnGap;
          pairWeightTotal += pairWeight;
          if (winnerScore > loserScore) {
            correct += 1;
          }

          const effectiveLearningRate = learningRate * pairWeight;
          const [winnerTrainingFeatures, loserTrainingFeatures] =
            getPairwiseTrainingFeatures(winner, loser, featureMode);
          this.applyScoreGradient(
            winnerTrainingFeatures,
            -mistakeProbability / temperature,
            effectiveLearningRate,
            l2,
            trainableLayers
          );
          this.applyScoreGradient(
            loserTrainingFeatures,
            mistakeProbability / temperature,
            effectiveLearningRate,
            l2,
            trainableLayers
          );
          updates += 1;
        });
      });
    }

    return {
      epochs,
      examples: totalExamples,
      updates,
      averageLoss: updates === 0 ? 0 : totalLoss / updates,
      accuracy: updates === 0 ? 0 : correct / updates,
      pairs: updates,
      averagePairReturnGap: updates === 0 ? 0 : returnGapTotal / updates,
      averagePairWeight: updates === 0 ? 0 : pairWeightTotal / updates,
    };
  }

  trainValueRegression(
    examples: readonly ActionRankingImitationExample[],
    options: ValueRegressionTrainingOptions = {}
  ): ImitationTrainingStats {
    const epochs = Math.max(1, Math.floor(options.epochs ?? 1));
    const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
    const l2 = options.l2 ?? 0;
    const trainableLayers = options.trainableLayers ?? "all";
    const targetScale = Math.max(1e-6, options.targetScale ?? 4);
    const targetMode = options.targetMode ?? "absolute";
    const anchorPolicy =
      targetMode === "residual"
        ? new NeuralActionRankingPolicy(this.getModel())
        : null;
    const huberDelta = Math.max(0, options.huberDelta ?? 0);
    const centerTargets = options.centerTargets ?? true;
    const random = createSeededRandom(options.shuffleSeed ?? "value-regression");
    let totalLoss = 0;
    let totalExamples = 0;
    let correct = 0;
    let updates = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const shuffled = shuffleCopy(examples, random);
      shuffled.forEach((example) => {
        const returns = example.candidates.map(
          (candidate) => getCandidateReturn(candidate)
        );
        if (
          example.candidates.length === 0 ||
          returns.some((value) => value == null)
        ) {
          return;
        }

        const numericReturns = returns as number[];
        const center =
          centerTargets && numericReturns.length > 0
            ? mean(numericReturns)
            : 0;
        const targets = numericReturns.map(
          (value, candidateIndex) =>
            (anchorPolicy == null
              ? 0
              : anchorPolicy.scoreFeatures(
                  example.candidates[candidateIndex].features
                )) +
            (value - center) / targetScale
        );
        const scores = example.candidates.map((candidate) =>
          this.scoreFeatures(candidate.features)
        );
        totalExamples += 1;
        if (getBestIndex(scores) === getBestIndex(numericReturns)) {
          correct += 1;
        }

        example.candidates.forEach((candidate, candidateIndex) => {
          const error = scores[candidateIndex] - targets[candidateIndex];
          totalLoss += getRegressionLoss(error, huberDelta);
          this.applyScoreGradient(
            candidate.features,
            getRegressionGradient(error, huberDelta),
            learningRate,
            l2,
            trainableLayers
          );
          updates += 1;
        });
      });
    }

    return {
      epochs,
      examples: totalExamples,
      updates,
      averageLoss: updates === 0 ? 0 : totalLoss / updates,
      accuracy: totalExamples === 0 ? 0 : correct / totalExamples,
    };
  }

  private applyListwiseGradient(
    candidates: readonly Pick<ActionRankingCandidate, "features">[],
    probabilities: readonly number[],
    selectedCandidateIndex: number,
    learningRate: number,
    scale: number,
    l2: number,
    trainableLayers: "all" | "output"
  ): void {
    candidates.forEach((candidate, candidateIndex) => {
      const target = candidateIndex === selectedCandidateIndex ? 1 : 0;
      const dScore = scale * (probabilities[candidateIndex] - target);
      this.applyScoreGradient(
        candidate.features,
        dScore,
        learningRate,
        l2,
        trainableLayers
      );
    });
  }

  private applyDistributionGradient(
    candidates: readonly Pick<ActionRankingCandidate, "features">[],
    probabilities: readonly number[],
    targets: readonly number[],
    learningRate: number,
    scale: number,
    l2: number,
    trainableLayers: "all" | "output"
  ): void {
    candidates.forEach((candidate, candidateIndex) => {
      const dScore =
        scale * (probabilities[candidateIndex] - targets[candidateIndex]);
      this.applyScoreGradient(
        candidate.features,
        dScore,
        learningRate,
        l2,
        trainableLayers
      );
    });
  }

  private applyScoreGradient(
    features: readonly number[],
    dScore: number,
    learningRate: number,
    l2: number,
    trainableLayers: "all" | "output" = "all"
  ): void {
    const modelFeatures = this.prepareFeatures(features);
    const forward = this.forward(modelFeatures);
    const lastActivation = forward.activations[forward.activations.length - 1];
    const oldOutputWeights = this.model.outputWeights.slice();
    const oldLayerWeights = this.model.layerWeights.map((layer) =>
      layer.map((weights) => weights.slice())
    );

    for (
      let outputIndex = 0;
      outputIndex < this.model.outputWeights.length;
      outputIndex++
    ) {
      const outputGrad =
        dScore * lastActivation[outputIndex] +
        l2 * this.model.outputWeights[outputIndex];
      this.model.outputWeights[outputIndex] -= learningRate * outputGrad;
    }
    this.model.outputBias -= learningRate * dScore;

    if (trainableLayers === "output") {
      return;
    }

    const deltas = this.model.hiddenLayerSizes.map((size) =>
      Array.from({ length: size }, () => 0)
    );
    const lastLayerIndex = this.model.hiddenLayerSizes.length - 1;
    for (
      let hiddenIndex = 0;
      hiddenIndex < this.model.hiddenLayerSizes[lastLayerIndex];
      hiddenIndex++
    ) {
      const activation = forward.activations[lastLayerIndex][hiddenIndex];
      deltas[lastLayerIndex][hiddenIndex] =
        dScore * oldOutputWeights[hiddenIndex] * (1 - activation * activation);
    }

    for (let layerIndex = lastLayerIndex - 1; layerIndex >= 0; layerIndex--) {
      for (
        let hiddenIndex = 0;
        hiddenIndex < this.model.hiddenLayerSizes[layerIndex];
        hiddenIndex++
      ) {
        const downstream = deltas[layerIndex + 1].reduce(
          (sum, downstreamDelta, downstreamIndex) => {
            return (
              sum +
              downstreamDelta *
                oldLayerWeights[layerIndex + 1][downstreamIndex][hiddenIndex]
            );
          },
          0
        );
        const activation = forward.activations[layerIndex][hiddenIndex];
        deltas[layerIndex][hiddenIndex] =
          downstream * (1 - activation * activation);
      }
    }

    for (
      let layerIndex = 0;
      layerIndex < this.model.hiddenLayerSizes.length;
      layerIndex++
    ) {
      const previousActivation =
        layerIndex === 0 ? modelFeatures : forward.activations[layerIndex - 1];
      for (
        let hiddenIndex = 0;
        hiddenIndex < this.model.hiddenLayerSizes[layerIndex];
        hiddenIndex++
      ) {
        const delta = deltas[layerIndex][hiddenIndex];
        for (
          let inputIndex = 0;
          inputIndex < previousActivation.length;
          inputIndex++
        ) {
          const inputGrad =
            delta * previousActivation[inputIndex] +
            l2 * this.model.layerWeights[layerIndex][hiddenIndex][inputIndex];
          this.model.layerWeights[layerIndex][hiddenIndex][inputIndex] -=
            learningRate * inputGrad;
        }
        this.model.layerBiases[layerIndex][hiddenIndex] -= learningRate * delta;
      }
    }
  }

  private forward(features: readonly number[]): ForwardPass {
    if (features.length !== this.model.inputSize) {
      throw new Error(
        `Expected ${this.model.inputSize} features, received ${features.length}`
      );
    }

    const layerInputs: number[][] = [];
    const activations: number[][] = [];
    let previousActivation = features;

    this.model.layerWeights.forEach((weightsForLayer, layerIndex) => {
      const raw = weightsForLayer.map((weights, hiddenIndex) => {
        return (
          this.model.layerBiases[layerIndex][hiddenIndex] +
          weights.reduce((sum, weight, inputIndex) => {
            return sum + weight * previousActivation[inputIndex];
          }, 0)
        );
      });
      const activation = raw.map((value) => Math.tanh(value));
      layerInputs.push(raw);
      activations.push(activation);
      previousActivation = activation;
    });

    const lastActivation = activations[activations.length - 1];
    const score =
      this.model.outputBias +
      lastActivation.reduce((sum, value, hiddenIndex) => {
        return sum + value * this.model.outputWeights[hiddenIndex];
      }, 0);

    return { layerInputs, activations, score };
  }

  private prepareFeatures(features: readonly number[]): number[] {
    if (features.length !== ACTION_RANKING_FEATURE_NAMES.length) {
      throw new Error(
        `Expected ${ACTION_RANKING_FEATURE_NAMES.length} features, received ${features.length}`
      );
    }
    return this.featureInputIndices.map((featureIndex) => features[featureIndex]);
  }
}

function getPairwiseTrainingFeatures(
  winner: ActionRankingImitationCandidate,
  loser: ActionRankingImitationCandidate,
  featureMode: PairwiseFeatureMode
): [number[], number[]] {
  if (featureMode === "raw") {
    return [winner.features, loser.features];
  }

  const [winnerDeltaFeatures, loserDeltaFeatures] =
    getPairwiseDeltaTrainingFeatures(winner.features, loser.features);
  if (featureMode === "delta") {
    return [winnerDeltaFeatures, loserDeltaFeatures];
  }

  return [
    getPairwiseTacticalTrainingFeatures(winner, winnerDeltaFeatures),
    shouldSuppressPairwiseLoserFeatures(winner, loser)
      ? loserDeltaFeatures.map(() => 0)
      : getPairwiseTacticalTrainingFeatures(loser, loserDeltaFeatures),
  ];
}

function getPairwiseDeltaTrainingFeatures(
  winnerFeatures: readonly number[],
  loserFeatures: readonly number[]
): [number[], number[]] {
  const winnerTrainingFeatures = winnerFeatures.slice();
  const loserTrainingFeatures = loserFeatures.slice();
  for (
    let featureIndex = 0;
    featureIndex < winnerTrainingFeatures.length &&
    featureIndex < loserTrainingFeatures.length;
    featureIndex++
  ) {
    if (
      Math.abs(winnerTrainingFeatures[featureIndex] - loserTrainingFeatures[featureIndex]) <
      1e-9
    ) {
      winnerTrainingFeatures[featureIndex] = 0;
      loserTrainingFeatures[featureIndex] = 0;
    }
  }
  return [winnerTrainingFeatures, loserTrainingFeatures];
}

function getPairwiseTacticalTrainingFeatures(
  candidate: ActionRankingImitationCandidate,
  features: readonly number[]
): number[] {
  return features.map((value, featureIndex) =>
    isPairwiseTacticalFeature(
      ACTION_RANKING_FEATURE_NAMES[featureIndex],
      candidate
    )
      ? value
      : 0
  );
}

function shouldSuppressPairwiseLoserFeatures(
  winner: ActionRankingImitationCandidate,
  loser: ActionRankingImitationCandidate
): boolean {
  return isCycleLikeMove(winner.move) !== isCycleLikeMove(loser.move);
}

function isPairwiseTacticalFeature(
  featureName: string | undefined,
  candidate: ActionRankingImitationCandidate
): boolean {
  if (!featureName || featureName === "bias") {
    return false;
  }

  const moveType = candidate.move.type;
  if (moveType === "cycle" || moveType === "flip_deck") {
    return (
      featureName.startsWith("cycle.") ||
      featureName.startsWith("own.stockLookahead") ||
      featureName.startsWith("own.waste") ||
      featureName === "own.stockFraction" ||
      featureName === "own.wasteFraction"
    );
  }

  if (moveType === "c2s" || moveType === "s2s") {
    return (
      featureName.startsWith("solitaire.") ||
      featureName.startsWith("source.exposed") ||
      featureName === "source.exposesCard" ||
      featureName === "card.canPlaySoon" ||
      featureName === "card.matchesPounceParity" ||
      featureName === "card.pounceConnectorCloseness" ||
      featureName === "card.ownSolitaireDestinationCount" ||
      featureName === "card.ownSolitaireConnectorForPounce" ||
      featureName === "move.clearsPounce" ||
      featureName === "move.immediatePointDelta" ||
      featureName === "move.immediatePointDifferentialDelta"
    );
  }

  if (moveType === "c2c") {
    return (
      featureName.startsWith("center.") ||
      featureName === "card.centerPlayableDestinationCount" ||
      featureName === "move.clearsPounce" ||
      featureName === "move.immediatePointDelta" ||
      featureName === "move.immediatePointDifferentialDelta"
    );
  }

  if (moveType === "premove") {
    return (
      featureName === "move.premove" ||
      featureName.startsWith("premove.") ||
      featureName.startsWith("source.") ||
      featureName === "card.centerDistance" ||
      featureName === "card.canPlaySoon" ||
      featureName === "card.matchesPounceParity" ||
      featureName === "card.pounceConnectorCloseness" ||
      featureName === "card.ownSolitaireDestinationCount" ||
      featureName === "card.ownSolitaireConnectorForPounce" ||
      featureName === "own.pounceCount" ||
      featureName === "own.currentPoints" ||
      featureName === "own.pointDifferential" ||
      featureName === "opponent.minPounceCount" ||
      featureName === "opponent.maxPouncePressure"
    );
  }

  return false;
}

function isCycleLikeMove(move: Move): boolean {
  return move.type === "cycle" || move.type === "flip_deck";
}

function getImitationTargetProbabilities(
  example: ActionRankingImitationExample,
  equivalentTargets: boolean
): number[] {
  if (!equivalentTargets) {
    return example.candidates.map((_, index) =>
      index === example.selectedCandidateIndex ? 1 : 0
    );
  }

  const targetEquivalenceKey =
    example.candidates[example.selectedCandidateIndex!].equivalenceKey;
  const targetCount = Math.max(
    1,
    example.candidates.filter(
      (candidate) => candidate.equivalenceKey === targetEquivalenceKey
    ).length
  );
  return example.candidates.map((candidate) =>
    candidate.equivalenceKey === targetEquivalenceKey ? 1 / targetCount : 0
  );
}

function isImitationPredictionCorrect(
  example: ActionRankingImitationExample,
  predictedIndex: number,
  options: ImitationTrainingOptions
): boolean {
  if (options.equivalentTargets) {
    return (
      example.candidates[predictedIndex].equivalenceKey ===
      example.candidates[example.selectedCandidateIndex!].equivalenceKey
    );
  }
  return predictedIndex === example.selectedCandidateIndex;
}

function getPreferencePairs(
  example: ActionRankingImitationExample,
  minReturnGap: number,
  maxPairsPerExample: number,
  random: () => number,
  preferenceScope: "all" | "behavior"
): { winnerIndex: number; loserIndex: number; returnGap: number }[] {
  if (preferenceScope === "behavior") {
    return getBehaviorPreferencePairs(example, minReturnGap);
  }

  const pairs: { winnerIndex: number; loserIndex: number; returnGap: number }[] =
    [];

  for (let leftIndex = 0; leftIndex < example.candidates.length; leftIndex++) {
    const leftReturn = getCandidateReturn(example.candidates[leftIndex]);
    if (leftReturn == null) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < example.candidates.length;
      rightIndex++
    ) {
      const rightReturn = getCandidateReturn(example.candidates[rightIndex]);
      if (rightReturn == null) {
        continue;
      }

      const returnGap = Math.abs(leftReturn - rightReturn);
      if (returnGap === 0 || returnGap < minReturnGap) {
        continue;
      }

      pairs.push(
        leftReturn > rightReturn
          ? {
              winnerIndex: leftIndex,
              loserIndex: rightIndex,
              returnGap,
            }
          : {
              winnerIndex: rightIndex,
              loserIndex: leftIndex,
              returnGap,
            }
      );
    }
  }

  pairs.sort((a, b) => b.returnGap - a.returnGap || random() - 0.5);
  return maxPairsPerExample === 0 ? pairs : pairs.slice(0, maxPairsPerExample);
}

function getBehaviorPreferencePairs(
  example: ActionRankingImitationExample,
  minReturnGap: number
): { winnerIndex: number; loserIndex: number; returnGap: number }[] {
  if (
    example.selectedCandidateIndex == null ||
    example.behaviorActionKey == null
  ) {
    return [];
  }

  const behaviorIndex = example.candidates.findIndex(
    (candidate) => candidate.key === example.behaviorActionKey
  );
  if (
    behaviorIndex < 0 ||
    behaviorIndex === example.selectedCandidateIndex
  ) {
    return [];
  }

  const selectedReturn =
    getCandidateReturn(example.candidates[example.selectedCandidateIndex]);
  const behaviorReturn = getCandidateReturn(example.candidates[behaviorIndex]);
  if (selectedReturn == null || behaviorReturn == null) {
    return [];
  }

  const returnGap = Math.abs(selectedReturn - behaviorReturn);
  if (returnGap === 0 || returnGap < minReturnGap) {
    return [];
  }

  return [
    selectedReturn > behaviorReturn
      ? {
          winnerIndex: example.selectedCandidateIndex,
          loserIndex: behaviorIndex,
          returnGap,
        }
      : {
          winnerIndex: behaviorIndex,
          loserIndex: example.selectedCandidateIndex,
          returnGap,
        },
  ];
}

function getPreferencePairWeight(
  returnGap: number,
  options: {
    mode: "uniform" | "return_gap";
    scale: number;
    max: number;
  }
): number {
  if (options.mode === "uniform") {
    return 1;
  }

  return Math.min(options.max, Math.abs(returnGap) / options.scale);
}

function getCandidateReturn(
  candidate: Pick<
    ActionRankingImitationExample["candidates"][number],
    "rolloutObjectiveReturn" | "rolloutPointDifferentialReturn"
  >
): number | undefined {
  return (
    candidate.rolloutObjectiveReturn ?? candidate.rolloutPointDifferentialReturn
  );
}

export function createNeuralActionRankingModel(
  hiddenLayerInput: number | readonly number[] = DEFAULT_HIDDEN_LAYER_SIZES,
  seed = "neural-action-ranking"
): NeuralActionRankingModelV2 {
  const inputSize = ACTION_RANKING_FEATURE_NAMES.length;
  const hiddenLayerSizes = normalizeHiddenLayerSizes(hiddenLayerInput);
  const random = createSeededRandom(seed);
  const layerWeights = hiddenLayerSizes.map((layerSize, layerIndex) => {
    const previousSize =
      layerIndex === 0 ? inputSize : hiddenLayerSizes[layerIndex - 1];
    const inputScale = Math.sqrt(2 / (previousSize + layerSize));
    return Array.from({ length: layerSize }, () =>
      Array.from(
        { length: previousSize },
        () => randomCentered(random) * inputScale
      )
    );
  });
  const outputScale = Math.sqrt(2 / hiddenLayerSizes[hiddenLayerSizes.length - 1]);

  return {
    version: 2,
    featureNames: ACTION_RANKING_FEATURE_NAMES.slice(),
    inputSize,
    hiddenLayerSizes,
    layerWeights,
    layerBiases: hiddenLayerSizes.map((layerSize) =>
      Array.from({ length: layerSize }, () => 0)
    ),
    outputWeights: Array.from(
      { length: hiddenLayerSizes[hiddenLayerSizes.length - 1] },
      () => randomCentered(random) * outputScale
    ),
    outputBias: 0,
  };
}

export function resizeNeuralActionRankingModel(
  model: NeuralActionRankingModel,
  hiddenLayerInput: number | readonly number[],
  seed = "neural-action-ranking-resize"
): NeuralActionRankingModelV2 {
  const source = alignModelToCurrentFeatures(toV2Model(model));
  const targetHiddenLayerSizes = normalizeHiddenLayerSizes(hiddenLayerInput);
  if (targetHiddenLayerSizes.length !== source.hiddenLayerSizes.length) {
    throw new Error(
      "Cannot resize a neural action ranking model to a different hidden layer count."
    );
  }
  source.hiddenLayerSizes.forEach((sourceLayerSize, layerIndex) => {
    const targetLayerSize = targetHiddenLayerSizes[layerIndex];
    if (targetLayerSize < sourceLayerSize) {
      throw new Error(
        "Cannot resize a neural action ranking model to a smaller hidden layer."
      );
    }
  });

  const resized = createNeuralActionRankingModel(targetHiddenLayerSizes, seed);
  source.hiddenLayerSizes.forEach((sourceLayerSize, layerIndex) => {
    const previousSourceSize =
      layerIndex === 0
        ? source.inputSize
        : source.hiddenLayerSizes[layerIndex - 1];
    for (let hiddenIndex = 0; hiddenIndex < sourceLayerSize; hiddenIndex++) {
      resized.layerBiases[layerIndex][hiddenIndex] =
        source.layerBiases[layerIndex][hiddenIndex];
      for (
        let inputIndex = 0;
        inputIndex < resized.layerWeights[layerIndex][hiddenIndex].length;
        inputIndex++
      ) {
        resized.layerWeights[layerIndex][hiddenIndex][inputIndex] =
          inputIndex < previousSourceSize
            ? source.layerWeights[layerIndex][hiddenIndex][inputIndex] ?? 0
            : 0;
      }
    }
  });

  source.outputWeights.forEach((weight, outputIndex) => {
    resized.outputWeights[outputIndex] = weight;
  });
  for (
    let outputIndex = source.outputWeights.length;
    outputIndex < resized.outputWeights.length;
    outputIndex++
  ) {
    resized.outputWeights[outputIndex] = 0;
  }
  resized.outputBias = source.outputBias;
  assertModelShape(resized);
  return resized;
}

function assertModelShape(model: NeuralActionRankingModelV2): void {
  if (model.version !== 2) {
    throw new Error(`Unsupported neural action ranking model: ${model.version}`);
  }
  if (model.inputSize !== model.featureNames.length) {
    throw new Error(
      `Model input size ${model.inputSize} does not match feature count ${model.featureNames.length}`
    );
  }
  const featureSet = new Set<string>(ACTION_RANKING_FEATURE_NAMES);
  if (model.featureNames.some((name) => !featureSet.has(name))) {
    throw new Error("Model uses feature names that do not exist in this build.");
  }
  if (model.hiddenLayerSizes.length === 0) {
    throw new Error("Model must have at least one hidden layer.");
  }
  if (
    model.layerWeights.length !== model.hiddenLayerSizes.length ||
    model.layerBiases.length !== model.hiddenLayerSizes.length ||
    model.outputWeights.length !==
      model.hiddenLayerSizes[model.hiddenLayerSizes.length - 1]
  ) {
    throw new Error("Model weight matrix shape is invalid.");
  }
  model.hiddenLayerSizes.forEach((layerSize, layerIndex) => {
    const previousSize =
      layerIndex === 0 ? model.inputSize : model.hiddenLayerSizes[layerIndex - 1];
    if (
      layerSize <= 0 ||
      model.layerWeights[layerIndex].length !== layerSize ||
      model.layerBiases[layerIndex].length !== layerSize ||
      model.layerWeights[layerIndex].some(
        (weights) => weights.length !== previousSize
      )
    ) {
      throw new Error("Model weight matrix shape is invalid.");
    }
  });
}

function getFeatureInputIndices(modelFeatureNames: readonly string[]): number[] {
  const currentIndexByName = new Map(
    ACTION_RANKING_FEATURE_NAMES.map((name, index) => [name, index])
  );
  return modelFeatureNames.map((name) => {
    const index = currentIndexByName.get(name as ActionRankingFeatureName);
    if (index == null) {
      throw new Error(`Model feature ${name} does not exist in this build.`);
    }
    return index;
  });
}

function cloneModel(model: NeuralActionRankingModel): NeuralActionRankingModel {
  if (model.version === 1) {
    return {
      version: model.version,
      featureNames: model.featureNames.slice(),
      inputSize: model.inputSize,
      hiddenSize: model.hiddenSize,
      inputToHidden: model.inputToHidden.map((weights) => weights.slice()),
      hiddenBias: model.hiddenBias.slice(),
      hiddenToOutput: model.hiddenToOutput.slice(),
      outputBias: model.outputBias,
    };
  }
  return {
    version: model.version,
    featureNames: model.featureNames.slice(),
    inputSize: model.inputSize,
    hiddenLayerSizes: model.hiddenLayerSizes.slice(),
    layerWeights: model.layerWeights.map((layer) =>
      layer.map((weights) => weights.slice())
    ),
    layerBiases: model.layerBiases.map((biases) => biases.slice()),
    outputWeights: model.outputWeights.slice(),
    outputBias: model.outputBias,
  };
}

function alignModelToCurrentFeatures(
  model: NeuralActionRankingModelV2
): NeuralActionRankingModelV2 {
  if (arraysEqual(model.featureNames, ACTION_RANKING_FEATURE_NAMES)) {
    return cloneModel(model) as NeuralActionRankingModelV2;
  }

  const currentFeatureIndex = new Map(
    ACTION_RANKING_FEATURE_NAMES.map((name, index) => [name, index])
  );
  const expandedInputWeights = model.layerWeights[0].map((weights) => {
    const expanded = Array.from(
      { length: ACTION_RANKING_FEATURE_NAMES.length },
      () => 0
    );
    model.featureNames.forEach((name, oldIndex) => {
      const newIndex = currentFeatureIndex.get(name as ActionRankingFeatureName);
      if (newIndex == null) {
        throw new Error(`Model feature ${name} does not exist in this build.`);
      }
      expanded[newIndex] = weights[oldIndex] ?? 0;
    });
    return expanded;
  });

  return {
    version: 2,
    featureNames: ACTION_RANKING_FEATURE_NAMES.slice(),
    inputSize: ACTION_RANKING_FEATURE_NAMES.length,
    hiddenLayerSizes: model.hiddenLayerSizes.slice(),
    layerWeights: [
      expandedInputWeights,
      ...model.layerWeights
        .slice(1)
        .map((layer) => layer.map((weights) => weights.slice())),
    ],
    layerBiases: model.layerBiases.map((biases) => biases.slice()),
    outputWeights: model.outputWeights.slice(),
    outputBias: model.outputBias,
  };
}

function toV2Model(model: NeuralActionRankingModel): NeuralActionRankingModelV2 {
  if (model.version === 2) {
    return cloneModel(model) as NeuralActionRankingModelV2;
  }

  return {
    version: 2,
    featureNames: model.featureNames.slice(),
    inputSize: model.inputSize,
    hiddenLayerSizes: [model.hiddenSize],
    layerWeights: [model.inputToHidden.map((weights) => weights.slice())],
    layerBiases: [model.hiddenBias.slice()],
    outputWeights: model.hiddenToOutput.slice(),
    outputBias: model.outputBias,
  };
}

function arraysEqual(
  left: readonly unknown[],
  right: readonly unknown[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function normalizeHiddenLayerSizes(
  hiddenLayerInput: number | readonly number[]
): number[] {
  const sizes =
    typeof hiddenLayerInput === "number"
      ? [hiddenLayerInput]
      : hiddenLayerInput.slice();
  const normalized = sizes
    .map((size) => Math.max(0, Math.floor(size)))
    .filter((size) => size > 0);
  return normalized.length > 0
    ? normalized
    : DEFAULT_HIDDEN_LAYER_SIZES.slice();
}

function softmax(scores: readonly number[], temperature = 1): number[] {
  const safeTemperature = Math.max(1e-6, temperature);
  const scaled = scores.map((score) => score / safeTemperature);
  const maxScore = Math.max(...scaled);
  const exps = scaled.map((score) => Math.exp(score - maxScore));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function softplus(value: number): number {
  if (value > 40) {
    return value;
  }
  if (value < -40) {
    return Math.exp(value);
  }
  return Math.log(1 + Math.exp(value));
}

function getBestIndex(scores: readonly number[]): number {
  return scores.reduce((bestIndex, score, index) => {
    return index === 0 || score > scores[bestIndex] ? index : bestIndex;
  }, 0);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getRegressionLoss(error: number, huberDelta: number): number {
  if (huberDelta <= 0 || Math.abs(error) <= huberDelta) {
    return 0.5 * error * error;
  }
  return huberDelta * (Math.abs(error) - 0.5 * huberDelta);
}

function getRegressionGradient(error: number, huberDelta: number): number {
  if (huberDelta <= 0 || Math.abs(error) <= huberDelta) {
    return error;
  }
  return Math.sign(error) * huberDelta;
}

function sampleIndex(probabilities: readonly number[], random: () => number) {
  const roll = random();
  let cumulative = 0;
  for (let index = 0; index < probabilities.length; index++) {
    cumulative += probabilities[index];
    if (roll <= cumulative) {
      return index;
    }
  }
  return probabilities.length - 1;
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

function randomCentered(random: () => number): number {
  return random() * 2 - 1;
}

export function createSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
