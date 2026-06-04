setDefaultEnv("RL_ALGORITHM", "ppo");
setDefaultEnv("RL_ONLY", "1");
setDefaultEnv("RL_INCLUDE_WAIT_ACTIONS", "1");
setDefaultEnv("RL_INCLUDE_PREMOVE_ACTIONS", "1");
setDefaultEnv("RL_PPO_ADVANTAGE_BASELINE", "trajectory");

require("./trainActionRankingPolicy");

function setDefaultEnv(name: string, value: string): void {
  if (process.env[name] == null || process.env[name]?.trim() === "") {
    process.env[name] = value;
  }
}
