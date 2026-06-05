setDefaultEnv("RL_ALGORITHM", "ppo");
setDefaultEnv("RL_ONLY", "1");
setDefaultEnv("RL_INCLUDE_WAIT_ACTIONS", "1");
setDefaultEnv("RL_INCLUDE_PREMOVE_ACTIONS", "1");
setDefaultEnv("RL_INCLUDE_FLIP_DECK_ACTIONS", "1");
setDefaultEnv("RL_PPO_ADVANTAGE_BASELINE", "trajectory");
setDefaultEnv("RL_PPO_MINIBATCH_SIZE", "128");
setDefaultEnv("RL_PPO_GRADIENT_SCALE", "sum");

if (readIntegerEnv("RL_PPO_WORKERS", 1) > 1) {
  require("./trainActionRankingPpoParallel");
} else {
  require("./trainActionRankingPolicy");
}

function setDefaultEnv(name: string, value: string): void {
  if (process.env[name] == null || process.env[name]?.trim() === "") {
    process.env[name] = value;
  }
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
