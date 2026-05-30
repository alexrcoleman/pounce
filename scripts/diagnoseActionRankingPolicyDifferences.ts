import fs from "fs";
import { collectActionRankingImitationDataset } from "../shared/ActionRankingImitation";
import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  type ActionRankingCandidate,
  type ActionRankingFeatureName,
} from "../shared/ActionRankingPolicy";
import { getBasicAIMove } from "../shared/ComputerV1";
import { createTrainingBoard } from "../shared/ActionRankingTraining";
import { isGameOver, type BoardState } from "../shared/GameUtils";
import {
  createSeededRandom,
  NeuralActionRankingPolicy,
  type ActionRankingPrediction,
  type NeuralActionRankingModel,
} from "../shared/NeuralActionRankingPolicy";
import { executeMove, type Move } from "../shared/MoveHandler";

type SampledExample = {
  dealIndex: number;
  stepIndex: number;
  playerIndex: number;
  selectedActionKey: string | null;
  candidates: ActionRankingCandidate[];
};

type MoveTypeCounts = Record<Move["type"], number>;
type StateSource = "teacher" | "modelA" | "modelB";

const modelAPath = process.env.MODEL_A;
const modelBPath = process.env.MODEL_B;
if (!modelAPath || !modelBPath) {
  throw new Error("MODEL_A and MODEL_B are required.");
}

const modelA = readModel(modelAPath);
const modelB = readModel(modelBPath);
const policyA = new NeuralActionRankingPolicy(modelA);
const policyB = new NeuralActionRankingPolicy(modelB);
const playerCount = readIntegerEnv("PLAYERS", 4);
const dealCount = readIntegerEnv("DIAG_DEALS", 24);
const maxMovesPerDeal = readIntegerEnv("DIAG_MAX_MOVES", 1800);
const maxExamples = readIntegerEnv("DIAG_MAX_EXAMPLES", 2000);
const maxDisagreements = readIntegerEnv("DIAG_MAX_DISAGREEMENTS", 12);
const topFeatureCount = readIntegerEnv("DIAG_TOP_FEATURES", 10);
const stateSource = readStateSourceEnv("DIAG_STATE_SOURCE", "teacher");
const seed = process.env.SEED ?? "action-ranking-diagnose";

const examples = collectExamples();
const diagnostics = diagnoseExamples(examples);

console.log(
  JSON.stringify(
    {
      modelA: {
        path: modelAPath,
        label: process.env.LABEL_A ?? null,
      },
      modelB: {
        path: modelBPath,
        label: process.env.LABEL_B ?? null,
      },
      options: {
        playerCount,
        dealCount,
        maxMovesPerDeal,
        maxExamples,
        maxDisagreements,
        topFeatureCount,
        stateSource,
        seed,
      },
      diagnostics,
    },
    null,
    2
  )
);

function collectExamples(): SampledExample[] {
  if (stateSource === "modelA") {
    return collectPolicyExamples(policyA);
  }
  if (stateSource === "modelB") {
    return collectPolicyExamples(policyB);
  }
  return collectTeacherExamples();
}

function collectTeacherExamples(): SampledExample[] {
  const sampledExamples: SampledExample[] = [];

  for (
    let dealIndex = 0;
    dealIndex < dealCount && sampledExamples.length < maxExamples;
    dealIndex++
  ) {
    const board = createTrainingBoard(playerCount, `${seed}:deal:${dealIndex}`);
    const dataset = collectActionRankingImitationDataset(board, {
      maxTrials: 1,
      maxMovesPerTrial: maxMovesPerDeal,
      seed: `${seed}:teacher:${dealIndex}`,
    });
    for (const example of dataset.examples) {
      if (example.candidates.length === 0) {
        continue;
      }
      sampledExamples.push({
        dealIndex,
        stepIndex: example.stepIndex,
        playerIndex: example.playerIndex,
        selectedActionKey: example.selectedActionKey,
        candidates: example.candidates,
      });
      if (sampledExamples.length >= maxExamples) {
        break;
      }
    }
  }

  return sampledExamples;
}

function collectPolicyExamples(
  sourcePolicy: NeuralActionRankingPolicy
): SampledExample[] {
  const sampledExamples: SampledExample[] = [];

  for (
    let dealIndex = 0;
    dealIndex < dealCount && sampledExamples.length < maxExamples;
    dealIndex++
  ) {
    const board = createTrainingBoard(playerCount, `${seed}:deal:${dealIndex}`);
    const activePlayerIndices = getActivePlayerIndices(board);
    const neuralPlayerIndex = dealIndex % playerCount;
    const timingRandom = createSeededRandom(
      `${seed}:${stateSource}:timing:${dealIndex}`
    );
    const cooldowns = board.players.map((_, playerIndex) =>
      activePlayerIndices.includes(playerIndex)
        ? timingRandom()
        : Number.POSITIVE_INFINITY
    );
    prepareBoardForSimulation(board, activePlayerIndices);

    for (
      let moveIndex = 0;
      !isGameOver(board) &&
      moveIndex < maxMovesPerDeal &&
      sampledExamples.length < maxExamples;
      moveIndex++
    ) {
      const playerIndex = getNextPlayerIndex(cooldowns, activePlayerIndices);
      if (playerIndex < 0) {
        break;
      }

      const move =
        playerIndex === neuralPlayerIndex
          ? collectPolicyDecisionExample(
              board,
              dealIndex,
              moveIndex,
              playerIndex,
              sourcePolicy,
              sampledExamples
            )
          : getBasicAIMove(board, playerIndex, {});
      if (move) {
        executeMove(board, playerIndex, move);
      }
      cooldowns[playerIndex] += getMoveDelay(move?.type, timingRandom);
    }
  }

  return sampledExamples;
}

function collectPolicyDecisionExample(
  board: BoardState,
  dealIndex: number,
  stepIndex: number,
  playerIndex: number,
  sourcePolicy: NeuralActionRankingPolicy,
  sampledExamples: SampledExample[]
): Move | undefined {
  const candidates = enumerateActionRankingCandidates(board, playerIndex);
  const selected = sourcePolicy.chooseCandidate(candidates, {
    temperature: 1,
    sample: false,
  });
  if (candidates.length > 0 && selected) {
    sampledExamples.push({
      dealIndex,
      stepIndex,
      playerIndex,
      selectedActionKey: selected.key,
      candidates,
    });
  }
  return selected?.move;
}

function diagnoseExamples(examples: readonly SampledExample[]) {
  const modelAMoveCounts = createMoveTypeCounts();
  const modelBMoveCounts = createMoveTypeCounts();
  const disagreementPairs = new Map<string, number>();
  const featureDeltaTotals = Array.from(
    { length: ACTION_RANKING_FEATURE_NAMES.length },
    () => 0
  );
  const featureDeltaAbsTotals = Array.from(
    { length: ACTION_RANKING_FEATURE_NAMES.length },
    () => 0
  );
  const sampleDisagreements = [];
  let candidateCount = 0;
  let topActionAgreementCount = 0;
  let topEquivalenceAgreementCount = 0;
  let modelATeacherAgreementCount = 0;
  let modelBTeacherAgreementCount = 0;
  let disagreementCount = 0;
  let candidateScoreDeltaAbsTotal = 0;
  let candidateScoreDeltaTotal = 0;
  let maxCandidateScoreDeltaAbs = 0;
  let modelATopMarginTotal = 0;
  let modelBTopMarginTotal = 0;
  let topMarginCount = 0;
  let modelBCloseMarginAt005Count = 0;
  let modelBCloseMarginAt010Count = 0;
  let modelBCloseMarginAt025Count = 0;

  for (const example of examples) {
    candidateCount += example.candidates.length;
    const rankingA = policyA.rankCandidates(example.candidates);
    const rankingB = policyB.rankCandidates(example.candidates);
    const topA = rankingA[0];
    const topB = rankingB[0];
    if (!topA || !topB) {
      continue;
    }

    const scoreAByKey = getScoreMap(rankingA);
    const scoreBByKey = getScoreMap(rankingB);
    for (const candidate of example.candidates) {
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
    }

    const marginA = getTopScoreMargin(rankingA);
    const marginB = getTopScoreMargin(rankingB);
    if (Number.isFinite(marginA) && Number.isFinite(marginB)) {
      topMarginCount += 1;
      modelATopMarginTotal += marginA;
      modelBTopMarginTotal += marginB;
      if (marginB <= 0.05) {
        modelBCloseMarginAt005Count += 1;
      }
      if (marginB <= 0.1) {
        modelBCloseMarginAt010Count += 1;
      }
      if (marginB <= 0.25) {
        modelBCloseMarginAt025Count += 1;
      }
    }

    modelAMoveCounts[topA.candidate.move.type] += 1;
    modelBMoveCounts[topB.candidate.move.type] += 1;
    if (topA.candidate.key === topB.candidate.key) {
      topActionAgreementCount += 1;
    }
    if (topA.candidate.equivalenceKey === topB.candidate.equivalenceKey) {
      topEquivalenceAgreementCount += 1;
    }
    if (
      example.selectedActionKey != null &&
      topA.candidate.key === example.selectedActionKey
    ) {
      modelATeacherAgreementCount += 1;
    }
    if (
      example.selectedActionKey != null &&
      topB.candidate.key === example.selectedActionKey
    ) {
      modelBTeacherAgreementCount += 1;
    }
    if (topA.candidate.key === topB.candidate.key) {
      continue;
    }

    disagreementCount += 1;
    const pairKey = `${topA.candidate.move.type}>${topB.candidate.move.type}`;
    disagreementPairs.set(pairKey, (disagreementPairs.get(pairKey) ?? 0) + 1);
    topA.candidate.features.forEach((value, index) => {
      const delta = value - (topB.candidate.features[index] ?? 0);
      featureDeltaTotals[index] += delta;
      featureDeltaAbsTotals[index] += Math.abs(delta);
    });
    if (sampleDisagreements.length < maxDisagreements) {
      sampleDisagreements.push(
        describeDisagreement(example, rankingA, rankingB)
      );
    }
  }

  return {
    examples: examples.length,
    candidates: candidateCount,
    averageCandidatesPerExample:
      examples.length === 0 ? 0 : candidateCount / examples.length,
    averageCandidateScoreDelta:
      candidateCount === 0 ? 0 : candidateScoreDeltaTotal / candidateCount,
    averageAbsoluteCandidateScoreDelta:
      candidateCount === 0 ? 0 : candidateScoreDeltaAbsTotal / candidateCount,
    maxAbsoluteCandidateScoreDelta: maxCandidateScoreDeltaAbs,
    averageModelATopScoreMargin:
      topMarginCount === 0 ? 0 : modelATopMarginTotal / topMarginCount,
    averageModelBTopScoreMargin:
      topMarginCount === 0 ? 0 : modelBTopMarginTotal / topMarginCount,
    modelBCloseTopMarginRateAt005:
      topMarginCount === 0 ? 0 : modelBCloseMarginAt005Count / topMarginCount,
    modelBCloseTopMarginRateAt010:
      topMarginCount === 0 ? 0 : modelBCloseMarginAt010Count / topMarginCount,
    modelBCloseTopMarginRateAt025:
      topMarginCount === 0 ? 0 : modelBCloseMarginAt025Count / topMarginCount,
    topActionAgreementRate:
      examples.length === 0 ? 0 : topActionAgreementCount / examples.length,
    topEquivalenceAgreementRate:
      examples.length === 0
        ? 0
        : topEquivalenceAgreementCount / examples.length,
    disagreementCount,
    referenceActionLabel: stateSource,
    modelAReferenceAgreementRate:
      examples.length === 0 ? 0 : modelATeacherAgreementCount / examples.length,
    modelBReferenceAgreementRate:
      examples.length === 0 ? 0 : modelBTeacherAgreementCount / examples.length,
    modelATeacherAgreementRate:
      stateSource === "teacher"
        ? examples.length === 0
          ? 0
          : modelATeacherAgreementCount / examples.length
        : null,
    modelBTeacherAgreementRate:
      stateSource === "teacher"
        ? examples.length === 0
          ? 0
          : modelBTeacherAgreementCount / examples.length
        : null,
    modelATopMoveRates: normalizeMoveCounts(modelAMoveCounts, examples.length),
    modelBTopMoveRates: normalizeMoveCounts(modelBMoveCounts, examples.length),
    disagreementMoveTypePairs: Array.from(disagreementPairs.entries())
      .map(([pair, count]) => ({ pair, count, rate: count / examples.length }))
      .sort((left, right) => right.count - left.count),
    averageFeatureDeltaWhenDifferent: getTopFeatureStats(
      featureDeltaTotals,
      disagreementCount,
      topFeatureCount
    ),
    averageAbsoluteFeatureDeltaWhenDifferent: getTopFeatureStats(
      featureDeltaAbsTotals,
      disagreementCount,
      topFeatureCount
    ),
    sampleDisagreements,
  };
}

function describeDisagreement(
  example: SampledExample,
  rankingA: readonly ActionRankingPrediction[],
  rankingB: readonly ActionRankingPrediction[]
) {
  const topA = rankingA[0];
  const topB = rankingB[0];
  const scoreAByKey = getScoreMap(rankingA);
  const scoreBByKey = getScoreMap(rankingB);
  return {
    dealIndex: example.dealIndex,
    stepIndex: example.stepIndex,
    playerIndex: example.playerIndex,
    referenceActionKey: example.selectedActionKey,
    teacherActionKey: stateSource === "teacher" ? example.selectedActionKey : null,
    modelA: describePrediction(
      topA,
      scoreAByKey.get(topB.candidate.key) ?? null
    ),
    modelB: describePrediction(
      topB,
      scoreBByKey.get(topA.candidate.key) ?? null
    ),
    topFeatureDeltas: getCandidateFeatureDeltas(
      topA.candidate,
      topB.candidate,
      topFeatureCount
    ),
  };
}

function describePrediction(
  prediction: ActionRankingPrediction,
  alternativeScore: number | null
) {
  return {
    key: prediction.candidate.key,
    move: describeMove(prediction.candidate.move),
    score: prediction.score,
    probability: prediction.probability,
    scoreMarginVsOtherTop:
      alternativeScore == null ? null : prediction.score - alternativeScore,
    immediatePointDelta: prediction.candidate.immediatePointDelta,
    immediatePointDifferentialDelta:
      prediction.candidate.immediatePointDifferentialDelta,
    endsRound: prediction.candidate.endsRound,
  };
}

function getCandidateFeatureDeltas(
  candidateA: ActionRankingCandidate,
  candidateB: ActionRankingCandidate,
  limit: number
) {
  return ACTION_RANKING_FEATURE_NAMES.map((feature, index) => {
    const modelAValue = candidateA.features[index] ?? 0;
    const modelBValue = candidateB.features[index] ?? 0;
    return {
      feature,
      modelAValue,
      modelBValue,
      delta: modelAValue - modelBValue,
    };
  })
    .filter((item) => item.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, limit);
}

function getTopFeatureStats(
  totals: readonly number[],
  denominator: number,
  limit: number
) {
  if (denominator <= 0) {
    return [];
  }
  return totals
    .map((total, index) => ({
      feature: ACTION_RANKING_FEATURE_NAMES[index] as ActionRankingFeatureName,
      average: total / denominator,
    }))
    .filter((item) => item.average !== 0)
    .sort((left, right) => Math.abs(right.average) - Math.abs(left.average))
    .slice(0, limit);
}

function getScoreMap(predictions: readonly ActionRankingPrediction[]) {
  return new Map(
    predictions.map((prediction) => [
      prediction.candidate.key,
      prediction.score,
    ])
  );
}

function getTopScoreMargin(predictions: readonly ActionRankingPrediction[]) {
  if (predictions.length <= 1) {
    return Number.POSITIVE_INFINITY;
  }
  return predictions[0].score - predictions[1].score;
}

function normalizeMoveCounts(counts: MoveTypeCounts, total: number) {
  return Object.fromEntries(
    Object.entries(counts).map(([moveType, count]) => [
      moveType,
      total === 0 ? 0 : count / total,
    ])
  );
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

function describeMove(move: Move): string {
  if (move.type === "c2c") {
    const source =
      move.source.type === "solitaire"
        ? `solitaire:${move.source.index}`
        : move.source.type;
    return `c2c ${source}->center:${move.dest}`;
  }
  if (move.type === "c2s") {
    return `c2s ${move.source}->stack:${move.dest}`;
  }
  if (move.type === "s2s") {
    return `s2s stack:${move.source}->stack:${move.dest} count:${move.count}`;
  }
  if (move.type === "move_field_stack") {
    return `move_field_stack ${move.index}`;
  }
  return move.type;
}

function readModel(filePath: string): NeuralActionRankingModel {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as NeuralActionRankingModel;
}

function readStateSourceEnv(name: string, fallback: StateSource): StateSource {
  const value = process.env[name];
  if (value === "modelA" || value === "modelB" || value === "teacher") {
    return value;
  }
  return fallback;
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}
