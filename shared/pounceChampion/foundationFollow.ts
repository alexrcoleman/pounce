import {
  ACTION_RANKING_FEATURE_NAMES,
  enumerateActionRankingCandidates,
  getActionRankingMoveKey,
  type ActionRankingCandidate,
} from "../ActionRankingPolicy";
import { cardEquals, peek } from "../CardUtils";
import { hasDirectPounceUnload } from "../PounceActionAdvantage";
import { getPouncePublicMoveCard } from "../PouncePublicAfterstate";
import { createDelayedOutcomeReviewer } from "./foundationGuard";
import {
  getCompletedDragFollowups,
  observePounceHeldBank,
  projectPounceCompletedDrag,
  readPounceHeldBankRelease,
  type CompletedDragFollow,
  type PounceCompletedDragWitness,
} from "./foundationWitness";
import type { PounceRoomReviewer } from "./types";
import { bestIndex, prefer } from "./upperPolicyUtils";

type Decision = Parameters<PounceRoomReviewer["reviewDecision"]>[0];
type Carry = { follow: CompletedDragFollow; witness: PounceCompletedDragWitness; started: number; requests: number };
type Choice = { index: number } | { candidate: ActionRankingCandidate };

const feed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerOpponentPounceAccess");
const winningFeed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerWinningFinishFeed");

export function createCompletedDragReviewer(): PounceRoomReviewer {
  const base = createDelayedOutcomeReviewer("candidate");
  const tactics = createDelayedOutcomeReviewer("baseline");
  const observations: (PounceCompletedDragWitness | undefined)[][] = [];
  const pending: (Carry | undefined)[] = [];
  let now = 0;
  return {
    ...base,
    reviewClock(time) { now = time; },
    reviewDecision(decision) {
      const usual = base.reviewDecision(decision);
      const tactical = tactics.reviewDecision(decision);
      const ranked = usual ?? decision.scores;
      const { board, playerIndex: seat, candidates, hands } = decision;
      if (board.players.length !== 4 || board.players.some(({ isSpectating }) => isSpectating)) return usual;
      const past = observations[seat] ?? (observations[seat] = []);
      const releases = board.players.flatMap((_, rival) => {
        if (rival === seat) return [];
        const witness = past[rival];
        past[rival] = observePounceHeldBank(decision, rival, now);
        return witness && readPounceHeldBankRelease(decision, rival, witness, now) ? [witness] : [];
      });
      const incumbent = candidates[bestIndex(ranked)].move;
      if (incumbent.type === "premove" || hasDirectPounceUnload(candidates) ||
        tactical?.some((score, index) => Number.isFinite(score) && score > decision.scores[index])) {
        pending[seat] = undefined;
        return usual;
      }
      const carry = pending[seat];
      if (carry) {
        const { follow, witness } = carry;
        if (carry.requests >= 3 || now - carry.started > 1_600 ||
          (incumbent.type === "c2c" && getActionRankingMoveKey(incumbent) !== getActionRankingMoveKey(follow.move)) ||
          (hands[seat]?.item && !cardEquals(hands[seat].item, follow.card))) {
          pending[seat] = undefined;
          return usual;
        }
        const choice = findChoice(decision, ranked, follow, witness);
        if (!choice) {
          pending[seat] = undefined;
          return usual;
        }
        carry.requests++;
        return request(decision, ranked, choice);
      }
      if (incumbent.type !== "cycle" && incumbent.type !== "wait" && incumbent.type !== "flip_deck") return usual;
      const offers = releases.flatMap((witness) => getCompletedDragFollowups(decision, witness).map((follow) => ({ follow, witness })));
      offers.sort((a, b) => a.follow.eta - b.follow.eta);
      for (const { follow, witness } of offers) {
        const choice = findChoice(decision, ranked, follow, witness);
        if (!choice) continue;
        pending[seat] = { follow, witness, started: now, requests: 1 };
        return request(decision, ranked, choice);
      }
      return usual;
    },
    reviewMove(event) {
      base.reviewMove?.(event);
      tactics.reviewMove?.(event);
      const { board, playerIndex: seat, move, result } = event;
      const carry = pending[seat];
      if (!carry) return;
      const { follow } = carry;
      const committed = move.type === "c2c" && getActionRankingMoveKey(move) === getActionRankingMoveKey(follow.move) &&
        result?.boardChanged && cardEquals(peek(board.piles[follow.dest]), follow.card);
      if (committed || !result?.cursorMove || result.boardChanged) pending[seat] = undefined;
    },
    reviewDeckRotation() {
      observations.length = 0;
      pending.length = 0;
    },
  };
}

function findChoice(decision: Decision, ranked: readonly number[], follow: CompletedDragFollow, witness: PounceCompletedDragWitness): Choice | undefined {
  const { board, playerIndex: seat, candidates, hands } = decision;
  if (!cardEquals(getPouncePublicMoveCard(board.players[seat], follow.move), follow.card)) return;
  const key = getActionRankingMoveKey(follow.move);
  const index = candidates.findIndex((candidate) => candidate.key === key);
  if (index >= 0) {
    if (Number.isFinite(ranked[index]) && safe(candidates[index])) return { index };
    return;
  }
  if (!cardEquals(peek(board.piles[witness.dest]), witness.prior)) return;
  const corrected = projectPounceCompletedDrag(board, witness);
  const candidate = enumerateActionRankingCandidates(corrected, seat, { includeCycle: false, includeFlipDeck: false, hands })
    .find((item) => item.key === key);
  if (candidate && safe(candidate)) return { candidate };
}

function safe({ features }: ActionRankingCandidate): boolean {
  return features[feed] <= 0 && features[winningFeed] <= 0;
}

function request(decision: Decision, ranked: readonly number[], choice: Choice): readonly number[] {
  if ("index" in choice) return prefer(ranked, choice.index);
  // A witnessed bank can expose an action absent from the delayed ranking.
  (decision.candidates as ActionRankingCandidate[]).push(choice.candidate);
  return [...ranked, Math.max(...ranked) + 1];
}
