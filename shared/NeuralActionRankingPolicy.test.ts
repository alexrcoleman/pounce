import assert from "assert";
import { ACTION_RANKING_FEATURE_NAMES } from "./ActionRankingPolicy";
import {
  NeuralActionRankingPolicy,
  type NeuralActionRankingModelV3,
} from "./NeuralActionRankingPolicy";

const featureCount = ACTION_RANKING_FEATURE_NAMES.length;

testRecurrentWeightsTrainFromTransitionContext();
testMemoryFeatureOutputAffectsCandidateScores();
testMemoryFeatureOutputWeightsTrainFromTransitionContext();
testMemoryTrainableLayerOnlyUpdatesMemoryPath();
testRecurrentWeightsTrainThroughHistorySteps();
testSequenceLossBackpropagatesFutureStepThroughEarlierSelectedAction();
testRecurrentWeightsIgnoreMemorySnapshotsWithoutTransitionContext();
testMemoryInputGradientScaleAmplifiesMemoryReadout();
testRecurrentGradientScaleAmplifiesRecurrentWeights();

function testRecurrentWeightsTrainFromTransitionContext(): void {
  const policy = createTestPolicy();
  const before = policy.getModel() as NeuralActionRankingModelV3;
  const update = createTrainingUpdate(policy);

  const stats = policy.trainClippedPolicyGradientBatch([update], 0.05, {
    clipRatio: 0.2,
    entropyBonus: 0,
    miniBatchSize: 1,
    temperature: 1,
  });
  const after = policy.getModel() as NeuralActionRankingModelV3;

  assert.equal(stats.appliedUpdates, 1);
  assert.ok(
    countRecurrentWeightChanges(before, after) > 0,
    "expected recurrent weights to change when transition context is present"
  );
}

function testRecurrentWeightsIgnoreMemorySnapshotsWithoutTransitionContext(): void {
  const policy = createTestPolicy();
  const before = policy.getModel() as NeuralActionRankingModelV3;
  const update = createTrainingUpdate(policy);
  const memoryState = policy.advanceMemoryState(
    update.recurrentMemoryTransition?.previousMemoryState ?? [],
    update.recurrentMemoryTransition?.selectedFeatures ?? []
  );

  policy.trainClippedPolicyGradientBatch(
    [
      {
        candidates: update.candidates,
        selectedCandidateIndex: update.selectedCandidateIndex,
        advantage: update.advantage,
        oldProbability: update.oldProbability,
        memoryState,
      },
    ],
    0.05,
    {
      clipRatio: 0.2,
      entropyBonus: 0,
      miniBatchSize: 1,
      temperature: 1,
    }
  );
  const after = policy.getModel() as NeuralActionRankingModelV3;

  assert.equal(
    countRecurrentWeightChanges(before, after),
    0,
    "expected recurrent weights to stay fixed without transition context"
  );
}

function testMemoryFeatureOutputAffectsCandidateScores(): void {
  const policy = createTestPolicy();
  const model = policy.getModel() as NeuralActionRankingModelV3;
  model.layerWeights[0].forEach((weights) => weights.fill(0));
  model.outputWeights.fill(0);
  model.memoryFeatureOutputWeights.forEach((weights) => weights.fill(0));
  model.memoryFeatureOutputWeights[0][0] = 1.25;
  const memoryState = [0.4, 0];
  const candidateA = createFeatureVector();
  candidateA[0] = 1;
  const candidateB = createFeatureVector();
  candidateB[1] = 1;
  const scoredPolicy = new NeuralActionRankingPolicy(model);

  assert.ok(
    scoredPolicy.scoreFeatures(candidateA, memoryState) >
      scoredPolicy.scoreFeatures(candidateB, memoryState),
    "expected direct memory-feature output to affect candidate scores"
  );
}

function testMemoryFeatureOutputWeightsTrainFromTransitionContext(): void {
  const policy = createTestPolicy();
  const before = policy.getModel() as NeuralActionRankingModelV3;
  const update = createTrainingUpdate(policy);

  policy.trainClippedPolicyGradientBatch([update], 0.05, {
    clipRatio: 0.2,
    entropyBonus: 0,
    miniBatchSize: 1,
    temperature: 1,
  });
  const after = policy.getModel() as NeuralActionRankingModelV3;

  assert.ok(
    getMatrixDeltaTotal(
      before.memoryFeatureOutputWeights,
      after.memoryFeatureOutputWeights
    ) > 0,
    "expected memory-feature output weights to train from transition context"
  );
}

function testMemoryTrainableLayerOnlyUpdatesMemoryPath(): void {
  const policy = createTestPolicy();
  const seeded = policy.getModel() as NeuralActionRankingModelV3;
  seeded.memoryFeatureOutputWeights[0][0] = 0.2;
  const seededPolicy = new NeuralActionRankingPolicy(seeded);
  const before = seededPolicy.getModel() as NeuralActionRankingModelV3;
  const update = createTrainingUpdate(seededPolicy);

  seededPolicy.trainClippedPolicyGradientBatch([update], 0.05, {
    clipRatio: 0.2,
    entropyBonus: 0,
    miniBatchSize: 1,
    temperature: 1,
    trainableLayers: "memory",
  });
  const after = seededPolicy.getModel() as NeuralActionRankingModelV3;

  assert.equal(
    getStandardPolicyDeltaTotal(before, after),
    0,
    "expected memory-only training to leave standard policy weights fixed"
  );
  assert.ok(
    getMatrixDeltaTotal(
      before.memoryFeatureOutputWeights,
      after.memoryFeatureOutputWeights
    ) > 0,
    "expected memory-only training to update direct memory-feature output weights"
  );
  assert.ok(
    getRecurrentDeltaTotal(before, after) > 0,
    "expected memory-only training to backpropagate into recurrent weights"
  );
}

function testRecurrentWeightsTrainThroughHistorySteps(): void {
  const policy = createTestPolicy();
  const firstSelectedFeatures = createFeatureVector();
  firstSelectedFeatures[4] = 1;
  const secondSelectedFeatures = createFeatureVector();
  secondSelectedFeatures[2] = 1;
  secondSelectedFeatures[3] = 1;
  const initialMemoryState = [0.25, -0.1];
  const intermediateMemoryState = policy.advanceMemoryState(
    initialMemoryState,
    firstSelectedFeatures
  );
  const currentMemoryState = policy.advanceMemoryState(
    intermediateMemoryState,
    secondSelectedFeatures
  );
  const candidateA = createFeatureVector();
  candidateA[0] = 1;
  const candidateB = createFeatureVector();
  candidateB[1] = 1;
  const scores = [candidateA, candidateB].map((features) =>
    policy.scoreFeatures(features, currentMemoryState)
  );
  const before = policy.getModel() as NeuralActionRankingModelV3;

  policy.trainClippedPolicyGradientBatch(
    [
      {
        candidates: [{ features: candidateA }, { features: candidateB }],
        selectedCandidateIndex: 0,
        advantage: 1,
        oldProbability: getSelectedProbability(scores, 0),
        recurrentMemoryTransition: {
          previousMemoryState: intermediateMemoryState,
          selectedFeatures: secondSelectedFeatures,
          steps: [
            {
              previousMemoryState: initialMemoryState,
              selectedFeatures: firstSelectedFeatures,
            },
            {
              previousMemoryState: intermediateMemoryState,
              selectedFeatures: secondSelectedFeatures,
            },
          ],
        },
      },
    ],
    0.05,
    {
      clipRatio: 0.2,
      entropyBonus: 0,
      miniBatchSize: 1,
      temperature: 1,
    }
  );
  const after = policy.getModel() as NeuralActionRankingModelV3;
  const firstStepFeatureDelta = Math.max(
    ...after.recurrentInputWeights.map((weights, stateIndex) =>
      Math.abs(weights[4] - before.recurrentInputWeights[stateIndex][4])
    )
  );

  assert.ok(
    firstStepFeatureDelta > 1e-12,
    "expected BPTT to update recurrent input weights from an earlier history step"
  );
}

function testSequenceLossBackpropagatesFutureStepThroughEarlierSelectedAction(): void {
  const policy = createTestPolicy();
  const firstSelectedFeatures = createFeatureVector();
  firstSelectedFeatures[4] = 1;
  const alternateFirstFeatures = createFeatureVector();
  alternateFirstFeatures[5] = 1;
  const initialMemoryState = [0.25, -0.1];
  const futureMemoryState = policy.advanceMemoryState(
    initialMemoryState,
    firstSelectedFeatures
  );
  const candidateA = createFeatureVector();
  candidateA[0] = 1;
  const candidateB = createFeatureVector();
  candidateB[1] = 1;
  const scores = [candidateA, candidateB].map((features) =>
    policy.scoreFeatures(features, futureMemoryState)
  );
  const before = policy.getModel() as NeuralActionRankingModelV3;

  const stats = policy.trainClippedPolicyGradientSequenceBatch(
    [
      {
        initialMemoryState,
        steps: [
          {
            candidates: [
              { features: firstSelectedFeatures },
              { features: alternateFirstFeatures },
            ],
            selectedCandidateIndex: 0,
            advantage: 0,
            oldProbability: 1,
          },
          {
            candidates: [{ features: candidateA }, { features: candidateB }],
            selectedCandidateIndex: 0,
            advantage: 1,
            oldProbability: getSelectedProbability(scores, 0),
          },
        ],
      },
    ],
    0.05,
    {
      clipRatio: 0.2,
      entropyBonus: 0,
      miniBatchSize: 8,
      temperature: 1,
    }
  );
  const after = policy.getModel() as NeuralActionRankingModelV3;
  const firstStepFeatureDelta = Math.max(
    ...after.recurrentInputWeights.map((weights, stateIndex) =>
      Math.abs(weights[4] - before.recurrentInputWeights[stateIndex][4])
    )
  );

  assert.equal(stats.appliedUpdates, 1);
  assert.ok(
    firstStepFeatureDelta > 1e-12,
    "expected sequence loss to backpropagate through an earlier selected action"
  );
}

function testMemoryInputGradientScaleAmplifiesMemoryReadout(): void {
  const baseline = trainTestPolicyWithScales({});
  const scaled = trainTestPolicyWithScales({ memoryInputGradientScale: 10 });

  assert.ok(
    scaled.memoryInputDelta > baseline.memoryInputDelta * 5,
    "expected memory input gradient scale to amplify memory readout updates"
  );
  assert.ok(
    scaled.memoryFeatureOutputDelta > baseline.memoryFeatureOutputDelta * 5,
    "expected memory input gradient scale to amplify direct memory-feature output updates"
  );
}

function testRecurrentGradientScaleAmplifiesRecurrentWeights(): void {
  const baseline = trainTestPolicyWithScales({});
  const scaled = trainTestPolicyWithScales({ recurrentGradientScale: 10 });

  assert.ok(
    scaled.recurrentDelta > baseline.recurrentDelta * 5,
    "expected recurrent gradient scale to amplify recurrent updates"
  );
}

function trainTestPolicyWithScales(options: {
  memoryInputGradientScale?: number;
  recurrentGradientScale?: number;
}): {
  memoryInputDelta: number;
  memoryFeatureOutputDelta: number;
  recurrentDelta: number;
} {
  const policy = createTestPolicy();
  const before = policy.getModel() as NeuralActionRankingModelV3;
  const update = createTrainingUpdate(policy);

  policy.trainClippedPolicyGradientBatch([update], 0.05, {
    clipRatio: 0.2,
    entropyBonus: 0,
    miniBatchSize: 1,
    temperature: 1,
    memoryInputGradientScale: options.memoryInputGradientScale,
    recurrentGradientScale: options.recurrentGradientScale,
  });
  const after = policy.getModel() as NeuralActionRankingModelV3;

  return {
    memoryInputDelta: getMemoryInputDeltaTotal(before, after),
    memoryFeatureOutputDelta: getMatrixDeltaTotal(
      before.memoryFeatureOutputWeights,
      after.memoryFeatureOutputWeights
    ),
    recurrentDelta: getRecurrentDeltaTotal(before, after),
  };
}

function createTestPolicy(): NeuralActionRankingPolicy {
  const policy = NeuralActionRankingPolicy.create({
    hiddenLayerSizes: [2],
    recurrentStateSize: 2,
    seed: "recurrent-gradient-test",
  });
  const model = policy.getModel() as NeuralActionRankingModelV3;

  model.layerWeights[0].forEach((weights) => weights.fill(0));
  model.layerBiases[0].fill(0);
  model.outputWeights.fill(0);
  model.outputBias = 0;
  model.memoryFeatureOutputWeights.forEach((weights) => weights.fill(0));

  model.layerWeights[0][0][0] = 1;
  model.layerWeights[0][0][featureCount] = 1;
  model.layerWeights[0][1][1] = -1;
  model.layerWeights[0][1][featureCount] = 0.5;
  model.outputWeights[0] = 1;
  model.outputWeights[1] = -0.75;

  model.recurrentInputWeights.forEach((weights) => weights.fill(0));
  model.recurrentStateWeights.forEach((weights) => weights.fill(0));
  model.recurrentBiases.fill(0);
  model.recurrentInputWeights[0][2] = 0.35;
  model.recurrentInputWeights[1][3] = -0.2;
  model.recurrentStateWeights[0][0] = 0.15;
  model.recurrentStateWeights[1][1] = -0.1;

  return new NeuralActionRankingPolicy(model);
}

function createTrainingUpdate(policy: NeuralActionRankingPolicy) {
  const candidateA = createFeatureVector();
  candidateA[0] = 1;
  const candidateB = createFeatureVector();
  candidateB[1] = 1;
  const selectedFeatures = createFeatureVector();
  selectedFeatures[2] = 1;
  selectedFeatures[3] = 1;
  const previousMemoryState = [0.25, -0.1];
  const currentMemoryState = policy.advanceMemoryState(
    previousMemoryState,
    selectedFeatures
  );
  const scores = [candidateA, candidateB].map((features) =>
    policy.scoreFeatures(features, currentMemoryState)
  );
  const oldProbability = getSelectedProbability(scores, 0);

  return {
    candidates: [{ features: candidateA }, { features: candidateB }],
    selectedCandidateIndex: 0,
    advantage: 1,
    oldProbability,
    recurrentMemoryTransition: {
      previousMemoryState,
      selectedFeatures,
    },
  };
}

function createFeatureVector(): number[] {
  return Array.from({ length: featureCount }, () => 0);
}

function getSelectedProbability(
  scores: readonly number[],
  selectedIndex: number
): number {
  const maxScore = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - maxScore));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights[selectedIndex] / total;
}

function countRecurrentWeightChanges(
  before: NeuralActionRankingModelV3,
  after: NeuralActionRankingModelV3
): number {
  return (
    countMatrixChanges(before.recurrentInputWeights, after.recurrentInputWeights) +
    countMatrixChanges(before.recurrentStateWeights, after.recurrentStateWeights) +
    countVectorChanges(before.recurrentBiases, after.recurrentBiases)
  );
}

function getMemoryInputDeltaTotal(
  before: NeuralActionRankingModelV3,
  after: NeuralActionRankingModelV3
): number {
  return before.layerWeights[0].reduce((total, weights, hiddenIndex) => {
    const afterWeights = after.layerWeights[0][hiddenIndex] ?? [];
    return (
      total +
      weights.reduce((sum, value, inputIndex) => {
        if (inputIndex < featureCount) {
          return sum;
        }
        return sum + Math.abs(value - (afterWeights[inputIndex] ?? Number.NaN));
      }, 0)
    );
  }, 0);
}

function getRecurrentDeltaTotal(
  before: NeuralActionRankingModelV3,
  after: NeuralActionRankingModelV3
): number {
  return (
    getMatrixDeltaTotal(before.recurrentInputWeights, after.recurrentInputWeights) +
    getMatrixDeltaTotal(before.recurrentStateWeights, after.recurrentStateWeights) +
    getVectorDeltaTotal(before.recurrentBiases, after.recurrentBiases)
  );
}

function getStandardPolicyDeltaTotal(
  before: NeuralActionRankingModelV3,
  after: NeuralActionRankingModelV3
): number {
  return (
    getMatrixDeltaTotal(before.layerWeights[0], after.layerWeights[0]) +
    getVectorDeltaTotal(before.layerBiases[0], after.layerBiases[0]) +
    getVectorDeltaTotal(before.outputWeights, after.outputWeights) +
    Math.abs(before.outputBias - after.outputBias)
  );
}

function getMatrixDeltaTotal(before: number[][], after: number[][]): number {
  return before.reduce(
    (total, weights, stateIndex) =>
      total + getVectorDeltaTotal(weights, after[stateIndex] ?? []),
    0
  );
}

function getVectorDeltaTotal(before: number[], after: number[]): number {
  return before.reduce(
    (total, value, index) =>
      total + Math.abs(value - (after[index] ?? Number.NaN)),
    0
  );
}

function countMatrixChanges(before: number[][], after: number[][]): number {
  return before.reduce(
    (count, weights, stateIndex) =>
      count + countVectorChanges(weights, after[stateIndex] ?? []),
    0
  );
}

function countVectorChanges(before: number[], after: number[]): number {
  return before.reduce(
    (count, value, index) =>
      Math.abs(value - (after[index] ?? Number.NaN)) > 1e-12
        ? count + 1
        : count,
    0
  );
}
