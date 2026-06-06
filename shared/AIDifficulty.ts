export const MIN_AI_LEVEL = 1;
export const MAX_AI_LEVEL = 10;
export const DEFAULT_AI_LEVEL = 5;
export const SIMULATION_AI_LEVEL = 1000;

export const AI_DIFFICULTY_PRESETS = [
  { key: "easy", label: "Easy", level: 3 },
  { key: "medium", label: "Medium", level: 5 },
  { key: "hard", label: "Hard", level: 7 },
] as const;

export type AIDifficultyPresetKey =
  (typeof AI_DIFFICULTY_PRESETS)[number]["key"];

export function normalizeAILevel(level: number): number {
  if (!Number.isFinite(level)) {
    return DEFAULT_AI_LEVEL;
  }
  return Math.max(MIN_AI_LEVEL, Math.min(MAX_AI_LEVEL, Math.round(level)));
}

export function getAISpeedMultiplier(level: number): number {
  return (normalizeAILevel(level) + 1) / 2;
}
