import assert from "node:assert/strict";

import {
  MAX_PROBABILISTIC_FAIR_HAND_PLAYERS,
  chooseFairHandAssignments,
  getFairHandAssignmentDistribution,
  type FairHandAssignment,
  type FairHandPlayerLuck,
  type FairHandScore,
} from "./FairHands";

{
  const distribution = getFairHandAssignmentDistribution(
    createPlayers([90, 90.1, 90.2]),
    createHands([20, 5, -3]),
    { temperature: 25 }
  );

  assert.equal(distribution.length, 6);
  assert.deepEqual(getAssignedScores(distribution[0].assignments), [20, 5, -3]);
  assert.ok(distribution[0].probability < 0.25);

  const leaderBestCandidates = distribution.filter(
    (candidate) => getAssignedScores(candidate.assignments)[2] === 20
  );
  assert.equal(leaderBestCandidates.length, 2);
  leaderBestCandidates.forEach((candidate) => {
    assert.ok(candidate.probability < distribution[0].probability);
  });
  assertNearlyEqual(getTotalProbability(distribution), 1);
}

{
  const distribution = getFairHandAssignmentDistribution(
    createPlayers([80, 90, 110]),
    createHands([20, 5, -3]),
    { temperature: 25 }
  );

  assert.deepEqual(getAssignedScores(distribution[0].assignments), [20, 5, -3]);
  assert.ok(distribution[0].probability > 0.999);
}

{
  const distribution = getFairHandAssignmentDistribution(
    createPlayers([90, 90, 90]),
    createHands([20, 5, -3]),
    { temperature: 25 }
  );

  assert.equal(distribution.length, 6);
  distribution.forEach((candidate) => {
    assertNearlyEqual(candidate.probability, 1 / 6);
  });
}

{
  const playerCount = MAX_PROBABILISTIC_FAIR_HAND_PLAYERS + 1;
  const distribution = getFairHandAssignmentDistribution(
    createPlayers(Array.from({ length: playerCount }, (_, index) => index)),
    createHands(Array.from({ length: playerCount }, (_, index) => playerCount - index)),
    { temperature: 25 }
  );

  assert.equal(distribution.length, 1);
  assert.deepEqual(
    getAssignedScores(distribution[0].assignments),
    [7, 6, 5, 4, 3, 2, 1]
  );
}

{
  const assignments = chooseFairHandAssignments(
    createPlayers([90, 90.1, 90.2]),
    createHands([20, 5, -3]),
    {
      random: () => 0,
      temperature: 25,
    }
  );

  assert.deepEqual(getAssignedScores(assignments), [20, 5, -3]);
}

function createPlayers(scores: number[]): FairHandPlayerLuck[] {
  return scores.map((expectedScoreTotal, playerIndex) => ({
    playerIndex,
    expectedScoreTotal,
  }));
}

function createHands(scores: number[]): FairHandScore[] {
  return scores.map((expectedScore, playerIndex) => ({
    playerIndex,
    expectedScore,
  }));
}

function getAssignedScores(assignments: readonly FairHandAssignment[]): number[] {
  return assignments
    .slice()
    .sort((a, b) => a.playerIndex - b.playerIndex)
    .map((assignment) => assignment.expectedScore);
}

function getTotalProbability(
  distribution: readonly { probability: number }[]
): number {
  return distribution.reduce(
    (total, candidate) => total + candidate.probability,
    0
  );
}

function assertNearlyEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-12);
}
