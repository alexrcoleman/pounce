import { ACTION_RANKING_FEATURE_NAMES, getActionRankingMoveKey, getCurrentPointsFromCards } from "../ActionRankingPolicy";
import { canMoveToSolitairePile, canPlayOnCenterPile, cardEquals, peek } from "../CardUtils";
import type { CardState } from "../GameUtils";
import { resolveAIMoveForBoard, type Move } from "../MoveHandler";
import { createPouncePublicBoard, getPouncePublicMoveCard, projectPouncePublicPosition } from "../PouncePublicAfterstate";
import checkpoint from "../models/pounceChampion/pounce-deadline-bank-fit-v1.json";
import { createDelayedOutcomeReviewer } from "./foundationGuard";
import { getPounceActionMotorGeometry, getPounceMotorMeanMs, getPounceMotorRecoveryMs } from "./motor";
import type { PounceRoomReviewer } from "./types";
import { bestIndex, prefer } from "./upperPolicyUtils";

type Decision = Parameters<PounceRoomReviewer["reviewDecision"]>[0];
type Bank = Extract<Move, { type: "c2c" }>;
type Unload = Extract<Move, { type: "c2s" }>;
type DeadlineOffer = { index: number; key: string; card: CardState; pounce: CardState; unload: Unload; features: number[] };
type Carry = { offer: DeadlineOffer; start: number; requests: number };
type Seat = { carry?: Carry; approaching: boolean; seen: Set<string>; attempts: number };

const centerFeed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerOpponentPounceAccess");
const finishFeed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerWinningFinishFeed");
const recoveryMs = getPounceMotorRecoveryMs();
const maximumBankEta = recoveryMs * 2.15;

function getOffer(decision: Decision, ranking: readonly number[]): DeadlineOffer | undefined {
  const { board, playerIndex: seat, candidates, hands } = decision;
  const selected = bestIndex(ranking);
  const incumbent = candidates[selected];
  const unload = incumbent?.move;
  if (!unload || unload.type !== "c2s" || unload.source !== "pounce" || incumbent.endsRound ||
    candidates.some(({ move }) => move.type === "c2c" && move.source.type === "pounce")) return;
  const actor = board.players[seat];
  const pounce = peek(actor.pounceDeck);
  if (!pounce || actor.pounceDeck.length <= 1 || hands[seat]?.item || hands[seat]?.items?.length) return;
  const unloadMotion = getPounceActionMotorGeometry(board, seat, unload, hands[seat]);
  if (!unloadMotion) return;
  const unloadEta = getPounceMotorMeanMs(unloadMotion);
  const rivals = board.players.map((player, index) => ({ player, index }))
    .filter(({ player, index }) => !player.isSpectating && index !== seat);
  const masked = createPouncePublicBoard(board);
  const unique = new Set<string>();
  let best: DeadlineOffer | undefined;
  let highest = -Infinity;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    if (candidate.move.type !== "c2c" || candidate.move.source.type === "pounce" || candidate.features[centerFeed] > 0 ||
      candidate.features[finishFeed] > 0 || !Number.isFinite(ranking[index])) continue;
    const move = resolveAIMoveForBoard(board, seat, candidate.move) as Bank;
    const key = getActionRankingMoveKey(move);
    if (unique.has(key)) continue;
    unique.add(key);
    const card = getPouncePublicMoveCard(actor, move);
    if (!card || card.value === 1 || board.piles.some((pile, dest) => dest !== move.dest && canPlayOnCenterPile(pile, card))) continue;
    const after = projectPouncePublicPosition(masked, seat, move);
    if (!after || !canMoveToSolitairePile(pounce, after.players[seat].stacks[unload.dest])) continue;
    const motion = getPounceActionMotorGeometry(board, seat, move, hands[seat]);
    if (!motion) continue;
    const bankEta = getPounceMotorMeanMs(motion);
    if (bankEta > maximumBankEta) continue;
    const competitors = rivals.flatMap(({ player, index: other }) => {
      const sources: Bank["source"][] = [{ type: "pounce" }, { type: "deck" },
        ...player.stacks.map((_, index) => ({ type: "solitaire" as const, index }))];
      return sources.flatMap((source) => {
        const bank: Bank = { type: "c2c", source, dest: move.dest };
        const next = getPouncePublicMoveCard(player, bank);
        if (!next || next.suit !== card.suit || next.value !== card.value) return [];
        const rivalMotion = getPounceActionMotorGeometry(board, other, bank, hands[other]);
        if (!rivalMotion) return [];
        const pounceTop = peek(player.pounceDeck);
        const hasUnload = !!pounceTop && (player.stacks.some((stack) => canMoveToSolitairePile(pounceTop, stack)) ||
          board.piles.some((pile) => canPlayOnCenterPile(pile, pounceTop)));
        return [{ eta: getPounceMotorMeanMs(rivalMotion), atSource: rivalMotion.atSource, held: rivalMotion.holding,
          isPounce: source.type === "pounce", hasUnload }];
      });
    }).sort((left, right) => left.eta - right.eta);
    const quickest = competitors[0];
    const bankAfterUnload = unloadEta + recoveryMs + bankEta;
    if (!quickest || quickest.eta < bankEta - 80 || quickest.eta > bankAfterUnload) continue;
    const score = (quickest.eta - bankEta) / 1000 - bankEta / 1200 + (quickest.isPounce ? .22 : 0);
    if (score <= highest) continue;
    highest = score;
    const gap = Math.max(0, Math.min(80, ranking[selected] - ranking[index]));
    const points = getCurrentPointsFromCards(actor);
    best = { index, key, card, pounce, unload,
      features: [bankEta / 1000, quickest.eta / 1000, unloadEta / 1000, (quickest.eta - bankEta) / 1000,
        Math.min(...rivals.map(({ player }) => player.pounceDeck.length)) / 13, actor.pounceDeck.length / 13,
        (points - Math.max(...rivals.map(({ player }) => getCurrentPointsFromCards(player)))) / 30, card.value / 13,
        actor.stacks.filter((stack) => !stack.length).length / 4, Number(move.source.type === "deck"),
        Number(move.source.type === "solitaire" && actor.stacks[move.source.index].length === 1), Number(!!actor.stacks[unload.dest].length),
        Number(quickest.atSource), Number(quickest.held), Number(quickest.isPounce), competitors.length / 3, gap / 40,
        Number(quickest.hasUnload && !quickest.isPounce)] };
  }
  return best;
}

function shouldBank(offer: DeadlineOffer): boolean {
  const { model, threshold } = checkpoint;
  const value = model.weights.reduce((sum, weight, index) => sum + weight *
    Math.max(-5, Math.min(5, (offer.features[index] - model.center[index]) / model.scale[index])), model.intercept);
  return value >= threshold;
}

export function createDeadlineBankReviewer(incumbent: PounceRoomReviewer): PounceRoomReviewer {
  const tactics = createDelayedOutcomeReviewer("baseline");
  const seats: Seat[] = Array.from({ length: 4 }, () => ({ approaching: false, seen: new Set(), attempts: 0 }));
  let now = 0;
  return {
    ...incumbent,
    reviewClock(time) { now = time; incumbent.reviewClock?.(time); },
    reviewDecision(decision) {
      const { board, hands, playerIndex: seat, candidates, scores } = decision;
      const usual = incumbent.reviewDecision(decision);
      const ranking = usual ?? scores;
      const tactical = tactics.reviewDecision(decision);
      if (board.players.length !== 4 || !seats[seat]) return usual;
      const state = seats[seat];
      const expected = candidates[bestIndex(ranking)];
      if (!expected || expected.endsRound || expected.move.type === "premove" ||
        (expected.move.type === "c2c" && expected.move.source.type === "pounce") ||
        candidates.length > scores.length || tactical?.some((value, index) => Number.isFinite(value) && value > scores[index])) {
        state.carry = undefined;
        return usual;
      }
      const actor = board.players[seat];
      const hand = hands[seat];
      if (state.carry) {
        const { offer, start, requests } = state.carry;
        const index = candidates.findIndex(({ move }, i) => Number.isFinite(ranking[i]) && move.type === "c2c" &&
          getActionRankingMoveKey(resolveAIMoveForBoard(board, seat, move)) === offer.key &&
          cardEquals(getPouncePublicMoveCard(actor, move), offer.card));
        const safe = cardEquals(peek(actor.pounceDeck), offer.pounce) && canMoveToSolitairePile(offer.pounce, actor.stacks[offer.unload.dest]);
        if (index < 0 || !safe || now - start > 1_500 || requests >= 4 || (hand?.item && !cardEquals(hand.item, offer.card))) {
          state.carry = undefined;
          return usual;
        }
        state.carry.requests++;
        return index === bestIndex(ranking) ? usual : prefer(ranking, index);
      }
      if (state.approaching || state.attempts >= 3) return usual;
      const offer = getOffer(decision, ranking);
      if (!offer) return usual;
      const key = `${offer.pounce.player}:${offer.pounce.suit}:${offer.pounce.value}`;
      if (state.seen.has(key)) return usual;
      state.seen.add(key);
      if (!shouldBank(offer)) return usual;
      state.attempts++;
      state.carry = { offer, start: now, requests: 1 };
      return prefer(ranking, offer.index);
    },
    reviewMove(event) {
      incumbent.reviewMove?.(event);
      tactics.reviewMove?.(event);
      const { playerIndex: seat, move, result } = event;
      const state = seats[seat];
      if (!state) return;
      state.approaching = Boolean(result?.cursorMove && !result.cursorMoveItem && !result.cursorMoveItems?.length && move.type !== "cycle");
      if (!result?.cursorMove || result.boardChanged) state.carry = undefined;
    },
    reviewDeckRotation() {
      incumbent.reviewDeckRotation?.();
      seats.forEach((seat) => { seat.carry = undefined; });
    },
  };
}
