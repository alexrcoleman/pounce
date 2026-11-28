import { cardEquals, peek } from "../CardUtils";
import { createDeadlineBankReviewer } from "./foundationDeadline";
import { createCompletedDragReviewer } from "./foundationFollow";
import { createPounceCursorReleaseHistory, projectPounceCompletedDrag, restorePounceFocusedPrior } from "./foundationWitness";
import type { PounceRoomReviewer } from "./types";

export { createDelayedOutcomeReviewer } from "./foundationGuard";
export { observePounceHeldBank, projectPounceCompletedDrag, type PounceCompletedDragWitness } from "./foundationWitness";

function createObservedFoundationsReviewer(): PounceRoomReviewer {
  const base = createCompletedDragReviewer();
  const history = createPounceCursorReleaseHistory();
  let now = 0;
  return {
    ...base,
    reviewClock(time) {
      now = time;
      base.reviewClock?.(time);
    },
    reviewCursorUpdates: history.observe,
    projectObservedBoard(board, seat) {
      if (board.players.length !== 4 || board.players.some(({ isSpectating }) => isSpectating)) return board;
      let projected = board;
      for (let rival = 0; rival < history.releases.length; rival++) {
        const release = history.releases[rival];
        if (!release || rival === seat || now - release.releasedAt > 600) continue;
        const { witness } = release;
        const prior = peek(projected.piles[witness.dest]);
        const oldView = cardEquals(prior, witness.prior) ? projected : restorePounceFocusedPrior(projected, witness);
        if (oldView) projected = projectPounceCompletedDrag(oldView, witness);
      }
      return projected;
    },
    reviewDeckRotation() {
      base.reviewDeckRotation?.();
      history.clear();
    },
  };
}

export function createObservedDeadlineReviewer(): PounceRoomReviewer {
  return createDeadlineBankReviewer(createObservedFoundationsReviewer());
}
