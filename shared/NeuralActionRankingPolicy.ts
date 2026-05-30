import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  type ActionRankingCandidate,
} from "./ActionRankingPolicy";
import type { BoardState } from "./GameUtils";
import type { Move } from "./MoveHandler";
import type { ActionRankingImitationExample } from "./ActionRankingImitation";

export type NeuralActionRankingModel = {
  version: 1;
  featureNames: string[];
  inputSize: number;
  hiddenSize: number;
  inputToHidden: number[][];
  hiddenBias: number[];
  hiddenToOutput: number[];
  outputBias: number;
};

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
};

export type ImitationTrainingStats = {
  epochs: number;
  examples: number;
  updates: number;
  averageLoss: number;
  accuracy: number;
};

export type RewardTargetTrainingOptions = ImitationTrainingOptions & {
  targetTemperature?: number;
};

type ForwardPass = {
  hiddenRaw: number[];
  hidden: number[];
  score: number;
};

const DEFAULT_HIDDEN_SIZE = 48;
const DEFAULT_LEARNING_RATE = 0.02;

export class NeuralActionRankingPolicy {
  private model: NeuralActionRankingModel;

  constructor(model?: NeuralActionRankingModel) {
    this.model = model ? cloneModel(model) : createNeuralActionRankingModel();
    assertModelShape(this.model);
  }

  static create(options: { hiddenSize?: number; seed?: string } = {}) {
    return new NeuralActionRankingPolicy(
      createNeuralActionRankingModel(options.hiddenSize, options.seed)
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
    options: { temperature?: number; random?: () => number; sample?: boolean } = {}
  ): Move | undefined {
    const candidates = enumerateActionRankingCandidates(board, playerIndex);
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
    return this.forward(features).score;
  }

  trainImitation(
    examples: readonly ActionRankingImitationExample[],
    options: ImitationTrainingOptions = {}
  ): ImitationTrainingStats {
    const epochs = Math.max(1, Math.floor(options.epochs ?? 1));
    const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
    const l2 = options.l2 ?? 0;
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
        totalLoss += -Math.log(
          Math.max(1e-12, probabilities[example.selectedCandidateIndex])
        );
        totalExamples += 1;
        if (getBestIndex(scores) === example.selectedCandidateIndex) {
          correct += 1;
        }

        this.applyListwiseGradient(
          candidates,
          probabilities,
          example.selectedCandidateIndex,
          learningRate,
          1,
          l2
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
    l2 = 0
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
      l2
    );
  }

  trainRewardTargets(
    examples: readonly ActionRankingImitationExample[],
    options: RewardTargetTrainingOptions = {}
  ): ImitationTrainingStats {
    const epochs = Math.max(1, Math.floor(options.epochs ?? 1));
    const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
    const l2 = options.l2 ?? 0;
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
            (candidate) => candidate.rolloutPointDifferentialReturn == null
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
          (candidate) => candidate.rolloutPointDifferentialReturn ?? 0
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
          l2
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

  private applyListwiseGradient(
    candidates: readonly Pick<ActionRankingCandidate, "features">[],
    probabilities: readonly number[],
    selectedCandidateIndex: number,
    learningRate: number,
    scale: number,
    l2: number
  ): void {
    candidates.forEach((candidate, candidateIndex) => {
      const target = candidateIndex === selectedCandidateIndex ? 1 : 0;
      const dScore = scale * (probabilities[candidateIndex] - target);
      this.applyScoreGradient(candidate.features, dScore, learningRate, l2);
    });
  }

  private applyDistributionGradient(
    candidates: readonly Pick<ActionRankingCandidate, "features">[],
    probabilities: readonly number[],
    targets: readonly number[],
    learningRate: number,
    scale: number,
    l2: number
  ): void {
    candidates.forEach((candidate, candidateIndex) => {
      const dScore =
        scale * (probabilities[candidateIndex] - targets[candidateIndex]);
      this.applyScoreGradient(candidate.features, dScore, learningRate, l2);
    });
  }

  private applyScoreGradient(
    features: readonly number[],
    dScore: number,
    learningRate: number,
    l2: number
  ): void {
    const forward = this.forward(features);
    const oldHiddenToOutput = this.model.hiddenToOutput.slice();

    for (let hiddenIndex = 0; hiddenIndex < this.model.hiddenSize; hiddenIndex++) {
      const hidden = forward.hidden[hiddenIndex];
      const outputGrad = dScore * hidden + l2 * this.model.hiddenToOutput[hiddenIndex];
      this.model.hiddenToOutput[hiddenIndex] -= learningRate * outputGrad;
    }
    this.model.outputBias -= learningRate * dScore;

    for (let hiddenIndex = 0; hiddenIndex < this.model.hiddenSize; hiddenIndex++) {
      const hidden = forward.hidden[hiddenIndex];
      const dHiddenRaw =
        dScore * oldHiddenToOutput[hiddenIndex] * (1 - hidden * hidden);
      for (let inputIndex = 0; inputIndex < this.model.inputSize; inputIndex++) {
        const inputGrad =
          dHiddenRaw * features[inputIndex] +
          l2 * this.model.inputToHidden[hiddenIndex][inputIndex];
        this.model.inputToHidden[hiddenIndex][inputIndex] -=
          learningRate * inputGrad;
      }
      this.model.hiddenBias[hiddenIndex] -= learningRate * dHiddenRaw;
    }
  }

  private forward(features: readonly number[]): ForwardPass {
    if (features.length !== this.model.inputSize) {
      throw new Error(
        `Expected ${this.model.inputSize} features, received ${features.length}`
      );
    }

    const hiddenRaw = this.model.inputToHidden.map((weights, hiddenIndex) => {
      return (
        this.model.hiddenBias[hiddenIndex] +
        weights.reduce((sum, weight, inputIndex) => {
          return sum + weight * features[inputIndex];
        }, 0)
      );
    });
    const hidden = hiddenRaw.map((value) => Math.tanh(value));
    const score =
      this.model.outputBias +
      hidden.reduce((sum, value, hiddenIndex) => {
        return sum + value * this.model.hiddenToOutput[hiddenIndex];
      }, 0);

    return { hiddenRaw, hidden, score };
  }
}

export function createNeuralActionRankingModel(
  hiddenSize = DEFAULT_HIDDEN_SIZE,
  seed = "neural-action-ranking"
): NeuralActionRankingModel {
  const inputSize = ACTION_RANKING_FEATURE_NAMES.length;
  const random = createSeededRandom(seed);
  const inputScale = Math.sqrt(2 / (inputSize + hiddenSize));
  const outputScale = Math.sqrt(2 / hiddenSize);

  return {
    version: 1,
    featureNames: ACTION_RANKING_FEATURE_NAMES.slice(),
    inputSize,
    hiddenSize,
    inputToHidden: Array.from({ length: hiddenSize }, () =>
      Array.from({ length: inputSize }, () => randomCentered(random) * inputScale)
    ),
    hiddenBias: Array.from({ length: hiddenSize }, () => 0),
    hiddenToOutput: Array.from(
      { length: hiddenSize },
      () => randomCentered(random) * outputScale
    ),
    outputBias: 0,
  };
}

function assertModelShape(model: NeuralActionRankingModel): void {
  if (model.version !== 1) {
    throw new Error(`Unsupported neural action ranking model: ${model.version}`);
  }
  if (model.inputSize !== ACTION_RANKING_FEATURE_NAMES.length) {
    throw new Error(
      `Model input size ${model.inputSize} does not match feature count ${ACTION_RANKING_FEATURE_NAMES.length}`
    );
  }
  if (
    model.featureNames.length !== ACTION_RANKING_FEATURE_NAMES.length ||
    model.featureNames.some(
      (name, index) => name !== ACTION_RANKING_FEATURE_NAMES[index]
    )
  ) {
    throw new Error("Model feature names do not match this build.");
  }
  if (
    model.inputToHidden.length !== model.hiddenSize ||
    model.hiddenBias.length !== model.hiddenSize ||
    model.hiddenToOutput.length !== model.hiddenSize ||
    model.inputToHidden.some((weights) => weights.length !== model.inputSize)
  ) {
    throw new Error("Model weight matrix shape is invalid.");
  }
}

function cloneModel(model: NeuralActionRankingModel): NeuralActionRankingModel {
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

function softmax(scores: readonly number[], temperature = 1): number[] {
  const safeTemperature = Math.max(1e-6, temperature);
  const scaled = scores.map((score) => score / safeTemperature);
  const maxScore = Math.max(...scaled);
  const exps = scaled.map((score) => Math.exp(score - maxScore));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function getBestIndex(scores: readonly number[]): number {
  return scores.reduce((bestIndex, score, index) => {
    return index === 0 || score > scores[bestIndex] ? index : bestIndex;
  }, 0);
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
