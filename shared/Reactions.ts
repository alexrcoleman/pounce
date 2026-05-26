export const REACTION_OPTIONS = [
  { id: "bolt", emoji: "⚡", label: "Lightning" },
  { id: "angry", emoji: "😠", label: "Angry" },
  { id: "sly", emoji: "😏", label: "Sly" },
  { id: "locked", emoji: "🔒", label: "Locked" },
  { id: "celebrate", emoji: "🎉", label: "Celebrate" },
  { id: "sad", emoji: "😢", label: "Sad" },
  { id: "nice", emoji: "👍", label: "Nice" },
  { id: "watching", emoji: "👀", label: "Watching" },
  { id: "cat", emoji: "😺", label: "Cat" },
  { id: "heart", emoji: "❤️", label: "Heart" },
] as const;

export type ReactionId = (typeof REACTION_OPTIONS)[number]["id"];

export type PlayerReaction = {
  eventId: string;
  reactionId: ReactionId;
  playerIndex: number;
  playerName: string;
  playerColor: string;
  sentAt: number;
};

export function isAllowedReactionId(value: unknown): value is ReactionId {
  return (
    typeof value === "string" &&
    REACTION_OPTIONS.some((reaction) => reaction.id === value)
  );
}

export function getReactionOption(reactionId: ReactionId) {
  return REACTION_OPTIONS.find((reaction) => reaction.id === reactionId);
}
