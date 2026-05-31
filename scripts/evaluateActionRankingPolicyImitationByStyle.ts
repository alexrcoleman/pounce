import fs from "fs";
import { collectImitationExamplesFromDeals } from "../shared/ActionRankingTraining";
import { getBasicAIStyleNames } from "../shared/ComputerV1";
import { NeuralActionRankingPolicy } from "../shared/NeuralActionRankingPolicy";
import type { ActionRankingImitationExample } from "../shared/ActionRankingImitation";
import type { Move } from "../shared/MoveHandler";
import type { NeuralActionRankingModel } from "../shared/NeuralActionRankingPolicy";

type StyleImitationSummary = {
  style: string;
  deals: number;
  examples: number;
  candidateCount: number;
  topActionAccuracy: number;
  topEquivalenceAccuracy: number;
  moveFamilyAccuracy: number;
  averageTeacherRank: number;
  averageTeacherScoreGap: number;
  teacherMoveFamilyRates: Record<string, number>;
  policyMoveFamilyRates: Record<string, number>;
  disagreementPairRates: Record<string, number>;
};

const modelPath = process.env.MODEL_IN;
if (!modelPath) {
  throw new Error("MODEL_IN is required.");
}

const model = JSON.parse(
  fs.readFileSync(modelPath, "utf8")
) as NeuralActionRankingModel;
const policy = new NeuralActionRankingPolicy(model);
const playerCount = readIntegerEnv("PLAYERS", 4);
const deals = readIntegerEnv("DEALS", 24);
const maxMovesPerGame = readIntegerEnv("MAX_MOVES", 1800);
const seed = process.env.SEED ?? "action-ranking-imitation-by-style";
const styles = readStyleList();

const byStyle = styles.map((style) =>
  summarizeStyleImitation(
    style,
    collectImitationExamplesFromDeals({
      playerCount,
      dealCount: deals,
      seed: `${seed}:${style}`,
      maxMovesPerGame,
      teacherStyleName: style,
    })
  )
);

console.log(
  JSON.stringify(
    {
      model: {
        path: modelPath,
        label: process.env.LABEL ?? null,
        featureCount: model.featureNames.length,
      },
      options: {
        playerCount,
        deals,
        maxMovesPerGame,
        styles,
        seed,
      },
      byStyle,
    },
    null,
    2
  )
);

function summarizeStyleImitation(
  style: string,
  examples: readonly ActionRankingImitationExample[]
): StyleImitationSummary {
  let candidateCount = 0;
  let topActionMatchCount = 0;
  let topEquivalenceMatchCount = 0;
  let moveFamilyMatchCount = 0;
  let teacherRankTotal = 0;
  let teacherScoreGapTotal = 0;
  const teacherMoveFamilyCounts = new Map<string, number>();
  const policyMoveFamilyCounts = new Map<string, number>();
  const disagreementPairCounts = new Map<string, number>();

  examples.forEach((example) => {
    candidateCount += example.candidates.length;
    const teacher =
      example.selectedCandidateIndex == null ||
      example.selectedCandidateIndex < 0
        ? null
        : example.candidates[example.selectedCandidateIndex];
    const scoredCandidates = example.candidates
      .map((candidate, candidateIndex) => ({
        candidate,
        candidateIndex,
        score: policy.scoreFeatures(candidate.features),
      }))
      .sort((a, b) => b.score - a.score);
    const predicted = scoredCandidates[0] ?? null;
    if (!teacher || !predicted) {
      return;
    }

    const teacherFamily = getMoveFamily(teacher.move);
    const predictedFamily = getMoveFamily(predicted.candidate.move);
    incrementCount(teacherMoveFamilyCounts, teacherFamily);
    incrementCount(policyMoveFamilyCounts, predictedFamily);

    if (predicted.candidate.key === teacher.key) {
      topActionMatchCount += 1;
    }
    if (predicted.candidate.equivalenceKey === teacher.equivalenceKey) {
      topEquivalenceMatchCount += 1;
    }
    if (predictedFamily === teacherFamily) {
      moveFamilyMatchCount += 1;
    } else {
      incrementCount(disagreementPairCounts, `${predictedFamily}>${teacherFamily}`);
    }

    const teacherRank = scoredCandidates.findIndex(
      (item) => item.candidate.key === teacher.key
    );
    teacherRankTotal += teacherRank < 0 ? scoredCandidates.length : teacherRank + 1;
    teacherScoreGapTotal += predicted.score - policy.scoreFeatures(teacher.features);
  });

  const evaluatedCount = Math.max(1, examples.length);
  return {
    style,
    deals,
    examples: examples.length,
    candidateCount,
    topActionAccuracy: topActionMatchCount / evaluatedCount,
    topEquivalenceAccuracy: topEquivalenceMatchCount / evaluatedCount,
    moveFamilyAccuracy: moveFamilyMatchCount / evaluatedCount,
    averageTeacherRank: teacherRankTotal / evaluatedCount,
    averageTeacherScoreGap: teacherScoreGapTotal / evaluatedCount,
    teacherMoveFamilyRates: normalizeCounts(teacherMoveFamilyCounts, evaluatedCount),
    policyMoveFamilyRates: normalizeCounts(policyMoveFamilyCounts, evaluatedCount),
    disagreementPairRates: normalizeCounts(disagreementPairCounts, evaluatedCount),
  };
}

function getMoveFamily(move: Move): string {
  if (move.type === "c2c") {
    return move.source.type === "solitaire"
      ? "c2c.solitaire"
      : `c2c.${move.source.type}`;
  }
  if (move.type === "c2s") {
    return `c2s.${move.source}`;
  }
  return move.type;
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function normalizeCounts(
  counts: Map<string, number>,
  total: number
): Record<string, number> {
  return Object.fromEntries(
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => [key, total === 0 ? 0 : count / total])
  );
}

function readStyleList(): string[] {
  const explicit = process.env.STYLES ?? process.env.STYLE;
  if (!explicit || explicit.trim() === "") {
    return getBasicAIStyleNames();
  }

  const styleByLowerName = new Map(
    getBasicAIStyleNames().map((style) => [style.toLowerCase(), style])
  );
  return explicit
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
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}
