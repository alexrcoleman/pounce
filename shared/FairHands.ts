export const FAIR_HAND_MODES = ["off", "rotate", "fairest"] as const;

export type FairHandMode = (typeof FAIR_HAND_MODES)[number];

export const MAX_PROBABILISTIC_FAIR_HAND_PLAYERS = 6;

const MIN_FAIR_HAND_TEMPERATURE_POINTS = 5;
const MAX_FAIR_HAND_TEMPERATURE_POINTS = 12;
const CONFIDENCE_INTERVAL_95_TO_STANDARD_ERROR = 1 / 1.96;

export type FairHandPlayerLuck = {
  playerIndex: number;
  expectedScoreTotal: number;
};

export type FairHandScore = {
  playerIndex: number;
  expectedScore: number;
  predictedScoreConfidenceInterval95?: number;
};

export type FairHandAssignment = {
  playerIndex: number;
  handPlayerIndex: number;
  expectedScore: number;
};

export type FairHandAssignmentCandidate = {
  assignments: FairHandAssignment[];
  cost: number;
  probability: number;
};

export type FairHandAssignmentOptions = {
  maxProbabilisticPlayers?: number;
  random?: () => number;
  temperature?: number;
};

export function normalizeFairHandMode(mode: unknown): FairHandMode {
  if (mode === "rotate" || mode === "fairest") {
    return mode;
  }
  return "off";
}

export function getFairHandMode(settings: {
  fairHandMode?: unknown;
  fairHandRotation?: unknown;
}): FairHandMode {
  if (settings.fairHandMode != null) {
    return normalizeFairHandMode(settings.fairHandMode);
  }
  return settings.fairHandRotation === true ? "rotate" : "off";
}

export function chooseFairHandAssignments(
  players: readonly FairHandPlayerLuck[],
  hands: readonly FairHandScore[],
  options: FairHandAssignmentOptions = {}
): FairHandAssignment[] {
  const distribution = getFairHandAssignmentDistribution(
    players,
    hands,
    options
  );
  if (distribution.length === 0) {
    return [];
  }

  const random = options.random ?? Math.random;
  const roll = clamp(random(), 0, 1);
  let cumulativeProbability = 0;
  for (const candidate of distribution) {
    cumulativeProbability += candidate.probability;
    if (roll < cumulativeProbability) {
      return candidate.assignments;
    }
  }

  return distribution[distribution.length - 1].assignments;
}

export function getFairHandAssignmentDistribution(
  players: readonly FairHandPlayerLuck[],
  hands: readonly FairHandScore[],
  options: FairHandAssignmentOptions = {}
): FairHandAssignmentCandidate[] {
  if (players.length === 0 || players.length !== hands.length) {
    return [];
  }

  const normalizedPlayers = players.map((player) => ({
    playerIndex: player.playerIndex,
    expectedScoreTotal: finiteNumber(player.expectedScoreTotal),
  }));
  const normalizedHands = hands.map((hand) => ({
    playerIndex: hand.playerIndex,
    expectedScore: finiteNumber(hand.expectedScore),
    predictedScoreConfidenceInterval95: hand.predictedScoreConfidenceInterval95,
  }));
  const deterministicAssignments = getReverseSortedFairHandAssignments(
    normalizedPlayers,
    normalizedHands
  );
  const maxProbabilisticPlayers =
    options.maxProbabilisticPlayers ?? MAX_PROBABILISTIC_FAIR_HAND_PLAYERS;

  if (
    players.length <= 1 ||
    maxProbabilisticPlayers < players.length ||
    maxProbabilisticPlayers < 2
  ) {
    return [
      {
        assignments: deterministicAssignments,
        cost: getFairHandAssignmentCost(
          normalizedPlayers,
          deterministicAssignments
        ),
        probability: 1,
      },
    ];
  }

  const temperature = getFairHandAssignmentTemperature(
    normalizedHands,
    options
  );
  if (!(temperature > 0)) {
    return [
      {
        assignments: deterministicAssignments,
        cost: getFairHandAssignmentCost(
          normalizedPlayers,
          deterministicAssignments
        ),
        probability: 1,
      },
    ];
  }

  const orderedPlayers = normalizedPlayers
    .slice()
    .sort((a, b) => a.playerIndex - b.playerIndex);
  const candidates = getPermutations(normalizedHands).map((permutation) => {
    const assignments = orderedPlayers.map((player, index) => ({
      playerIndex: player.playerIndex,
      handPlayerIndex: permutation[index].playerIndex,
      expectedScore: permutation[index].expectedScore,
    }));
    return {
      assignments,
      cost: getFairHandAssignmentCost(normalizedPlayers, assignments),
      probability: 0,
    };
  });

  candidates.sort(compareFairHandAssignmentCandidates);
  const minCost = candidates[0]?.cost ?? 0;
  const weights = candidates.map((candidate) =>
    Math.exp(-(candidate.cost - minCost) / temperature)
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(totalWeight > 0)) {
    return [
      {
        assignments: deterministicAssignments,
        cost: getFairHandAssignmentCost(
          normalizedPlayers,
          deterministicAssignments
        ),
        probability: 1,
      },
    ];
  }

  return candidates.map((candidate, index) => ({
    ...candidate,
    probability: weights[index] / totalWeight,
  }));
}

function getReverseSortedFairHandAssignments(
  players: readonly FairHandPlayerLuck[],
  hands: readonly FairHandScore[]
): FairHandAssignment[] {
  const rankedPlayers = players
    .slice()
    .sort(
      (a, b) =>
        a.expectedScoreTotal - b.expectedScoreTotal ||
        a.playerIndex - b.playerIndex
    );
  const rankedHands = hands
    .slice()
    .sort(
      (a, b) => b.expectedScore - a.expectedScore || a.playerIndex - b.playerIndex
    );

  return rankedPlayers.map((player, index) => {
    const hand = rankedHands[index];
    return {
      playerIndex: player.playerIndex,
      handPlayerIndex: hand.playerIndex,
      expectedScore: hand.expectedScore,
    };
  });
}

function getFairHandAssignmentCost(
  players: readonly FairHandPlayerLuck[],
  assignments: readonly FairHandAssignment[]
): number {
  const expectedScoreByPlayerIndex = new Map(
    players.map((player) => [player.playerIndex, player.expectedScoreTotal])
  );
  const finalScores = assignments.map(
    (assignment) =>
      (expectedScoreByPlayerIndex.get(assignment.playerIndex) ?? 0) +
      assignment.expectedScore
  );
  const meanScore =
    finalScores.reduce((sum, score) => sum + score, 0) / finalScores.length;
  return finalScores.reduce((sum, score) => {
    const deviation = score - meanScore;
    return sum + deviation * deviation;
  }, 0);
}

function getFairHandAssignmentTemperature(
  hands: readonly FairHandScore[],
  options: FairHandAssignmentOptions
): number {
  if (options.temperature != null) {
    return finiteNumber(options.temperature);
  }

  const standardErrors = hands
    .map((hand) =>
      typeof hand.predictedScoreConfidenceInterval95 === "number" &&
      Number.isFinite(hand.predictedScoreConfidenceInterval95)
        ? Math.abs(hand.predictedScoreConfidenceInterval95) *
          CONFIDENCE_INTERVAL_95_TO_STANDARD_ERROR
        : null
    )
    .filter((score): score is number => score != null);
  const temperaturePoints =
    standardErrors.length > 0
      ? clamp(
          getMedian(standardErrors),
          MIN_FAIR_HAND_TEMPERATURE_POINTS,
          MAX_FAIR_HAND_TEMPERATURE_POINTS
        )
      : MIN_FAIR_HAND_TEMPERATURE_POINTS;
  return temperaturePoints * temperaturePoints;
}

function getPermutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }

  const permutations: T[][] = [];
  items.forEach((item, index) => {
    const remainingItems = items
      .slice(0, index)
      .concat(items.slice(index + 1));
    getPermutations(remainingItems).forEach((permutation) => {
      permutations.push([item].concat(permutation));
    });
  });
  return permutations;
}

function compareFairHandAssignmentCandidates(
  a: FairHandAssignmentCandidate,
  b: FairHandAssignmentCandidate
): number {
  return a.cost - b.cost || getAssignmentKey(a).localeCompare(getAssignmentKey(b));
}

function getAssignmentKey(candidate: FairHandAssignmentCandidate): string {
  return candidate.assignments
    .map(
      (assignment) =>
        `${assignment.playerIndex}:${assignment.handPlayerIndex}:${assignment.expectedScore}`
    )
    .join("|");
}

function getMedian(values: readonly number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
