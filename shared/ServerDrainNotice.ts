import type { ServerNotice } from "./SocketTypes";

export type ServerDrainStage = "scheduled" | "restarting";

export const SERVER_DRAIN_SCHEDULED_DESCRIPTION =
  "Online games can continue for now, but they will disconnect and cannot be rejoined after the restart.";

export const SERVER_DRAIN_RESTARTING_DESCRIPTION =
  "Online games may disconnect now and cannot be rejoined after this restart.";

export function getServerDrainStage(
  drainingUntil: number,
  now = Date.now()
): ServerDrainStage {
  return drainingUntil > now ? "scheduled" : "restarting";
}

export function getServerDrainTitle(
  drainingUntil: number,
  now = Date.now()
): string {
  const stage = getServerDrainStage(drainingUntil, now);
  if (stage === "restarting") {
    return "Server restart imminently for update.";
  }

  return `Server restart in ${formatDrainCountdown(
    drainingUntil - now
  )} for update.`;
}

export function getServerDrainDescription(stage: ServerDrainStage): string {
  return stage === "restarting"
    ? SERVER_DRAIN_RESTARTING_DESCRIPTION
    : SERVER_DRAIN_SCHEDULED_DESCRIPTION;
}

export function getServerNoticeTitle(
  notice: ServerNotice,
  now = Date.now()
): string {
  return getServerDrainTitle(notice.drainingUntil, now);
}

export function getServerNoticeDescription(
  notice: ServerNotice,
  now = Date.now()
): string {
  return getServerDrainDescription(
    getServerDrainStage(notice.drainingUntil, now)
  );
}

function formatDrainCountdown(durationMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
