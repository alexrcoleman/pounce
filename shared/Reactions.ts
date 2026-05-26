export const REACTION_OPTIONS = [
  { id: "bolt", emoji: "⚡", label: "Lightning" },
  { id: "locked", emoji: "🔒", label: "Locked" },
  { id: "watching", emoji: "👀", label: "Watching" },
  { id: "nice", emoji: "👍", label: "Nice" },
  { id: "celebrate", emoji: "🎉", label: "Celebrate" },
  { id: "angry", emoji: "😠", label: "Angry" },
  { id: "sly", emoji: "😏", label: "Sly" },
  { id: "sad", emoji: "😢", label: "Sad" },
  { id: "heart", emoji: "❤️", label: "Heart" },
  { id: "ninja", emoji: "🥷", label: "Ninja" },
  { id: "club", emoji: "♣️", label: "Club" },
  { id: "spade", emoji: "♠️", label: "Spade" },
  { id: "diamond", emoji: "♦️", label: "Diamond" },
  { id: "heartSuit", emoji: "♥️", label: "Heart suit" },
  { id: "chartUp", emoji: "📈", label: "Chart up" },
  { id: "chartDown", emoji: "📉", label: "Chart down" },
  { id: "cat", emoji: "😺", label: "Cat" },
  { id: "grinningCat", emoji: "😸", label: "Grinning cat" },
  { id: "joyCat", emoji: "😹", label: "Laughing cat" },
  { id: "heartEyesCat", emoji: "😻", label: "Heart-eyes cat" },
  { id: "smirkCat", emoji: "😼", label: "Smirking cat" },
  { id: "kissingCat", emoji: "😽", label: "Kissing cat" },
  { id: "wearyCat", emoji: "🙀", label: "Scared cat" },
  { id: "cryingCat", emoji: "😿", label: "Crying cat" },
  { id: "poutingCat", emoji: "😾", label: "Pouting cat" },
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
