export const FAIR_HAND_MODES = ["off", "rotate", "fairest"] as const;

export type FairHandMode = (typeof FAIR_HAND_MODES)[number];

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
