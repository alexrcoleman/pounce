export type RoomToastTone = "info" | "warning";

export type DeckRotationToastReason =
  | "auto_stuck_board"
  | "consensus_stuck"
  | "manual";

export type RoomToast = {
  type: "deck_rotation";
  tone: RoomToastTone;
  message: string;
  description?: string;
};

export function createDeckRotationToast(
  reason: DeckRotationToastReason
): RoomToast {
  if (reason === "auto_stuck_board") {
    return {
      type: "deck_rotation",
      tone: "warning",
      message: "Stuck board detected",
      description:
        "Decks were auto-rotated after repeated deck cycling without card progress.",
    };
  }
  if (reason === "consensus_stuck") {
    return {
      type: "deck_rotation",
      tone: "info",
      message: "Everyone marked stuck",
      description: "Decks were rotated for all players.",
    };
  }

  return {
    type: "deck_rotation",
    tone: "info",
    message: "Decks rotated",
    description: "The host rotated everyone's stock.",
  };
}
