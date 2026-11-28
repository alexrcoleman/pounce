import { ACTION_RANKING_FEATURE_NAMES, type ActionRankingFeatureName } from "./ActionRankingPolicy";

export type PounceConnectorGate = {
  version: 1;
  weights: number[];
  threshold: number;
};

const names = [
  "connector.slotGain",
  "connector.partnerCenterAccess",
  "connector.partnerCenterPassed",
  "connector.coveredCenterAccess",
  "connector.partnerCenterCompetition",
  "connector.wasteStockFraction",
  "strategy.lastSlotUsed",
  "strategy.slotPounceAccessDelta",
  "own.pounceCount",
  "opponent.minPounceCount",
] satisfies ActionRankingFeatureName[];
const indices = names.map((name) => ACTION_RANKING_FEATURE_NAMES.indexOf(name));

export function getConnectorGateInputs(source: string, features: readonly number[]): number[] {
  const [slots, access, passed, covered, competition, stock, lastSlot, pounceAccess, ownLeft, rivalLeft] =
    indices.map((index) => features[index] ?? 0);
  const waste = Number(source === "waste");
  const pounce = Number(source === "pounce");
  return [
    1, waste, pounce,
    slots, access, passed, covered, competition,
    stock, lastSlot, pounceAccess, ownLeft, rivalLeft,
    waste * passed, waste * access, pounce * passed,
  ];
}

export function predictConnectorGate(gate: PounceConnectorGate, inputs: readonly number[]): number {
  if (gate.version !== 1 || gate.weights.length !== inputs.length) {
    throw new Error("Connector gate model does not match inputs");
  }
  return inputs.reduce((sum, value, index) => sum + value * gate.weights[index], 0);
}
