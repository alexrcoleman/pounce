import {
  collectActionRankingImitationDataset,
  type ActionRankingImitationExample,
} from "../shared/ActionRankingImitation";
import { getBasicAIStyleNames } from "../shared/ComputerV1";
import { createBoard, dealPlayerHand } from "../shared/GameUtils";

const playerCount = readIntegerEnv("PLAYERS", 4);
const trials = readIntegerEnv("TRIALS", 1);
const maxMoves = readIntegerEnv("MAX_MOVES", 1800);
const exampleLimit = readIntegerEnv("EXAMPLE_LIMIT", 5);
const teacherStyleName = readBasicAIStyleEnv("IMITATION_TEACHER_STYLE");

const board = createBoard(playerCount);
board.players.forEach((_, playerIndex) => {
  dealPlayerHand(board, playerIndex);
});
board.isActive = true;
board.isDealt = true;

const dataset = collectActionRankingImitationDataset(board, {
  maxTrials: trials,
  maxMovesPerTrial: maxMoves,
  teacherStyleName,
});

const previewExamples = dataset.examples
  .slice(0, exampleLimit)
  .map(trimExampleForPreview);

console.log(
  JSON.stringify(
    {
      featureNames: dataset.featureNames,
      teacherStyleName: teacherStyleName ?? null,
      summary: dataset.summary,
      previewExamples,
    },
    null,
    2
  )
);

function trimExampleForPreview(example: ActionRankingImitationExample) {
  return {
    trialIndex: example.trialIndex,
    stepIndex: example.stepIndex,
    playerIndex: example.playerIndex,
    selectedActionKey: example.selectedActionKey,
    selectedCandidateIndex: example.selectedCandidateIndex,
    playerPointDifferential: example.playerPointDifferential,
    finalPointDifferential: example.finalPointDifferential,
    pointDifferentialReturn: example.pointDifferentialReturn,
    candidateCount: example.candidates.length,
    selectedCandidate:
      example.selectedCandidateIndex == null ||
      example.selectedCandidateIndex < 0
        ? null
        : example.candidates[example.selectedCandidateIndex],
  };
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function readBasicAIStyleEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return undefined;
  }

  const requested = value.trim();
  const style = getBasicAIStyleNames().find(
    (candidate) => candidate.toLowerCase() === requested.toLowerCase()
  );
  if (!style) {
    throw new Error(
      `Unknown ${name} "${requested}". Known styles: ${getBasicAIStyleNames().join(
        ", "
      )}`
    );
  }

  return style;
}
