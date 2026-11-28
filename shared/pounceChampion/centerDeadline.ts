import { ACTION_RANKING_FEATURE_NAMES, getActionRankingMoveKey, getCurrentPointsFromCards } from "../ActionRankingPolicy";
import { canPlayOnCenterPile, cardEquals, peek } from "../CardUtils";
import type { CardState } from "../GameUtils";
import { resolveAIMoveForBoard, type Move } from "../MoveHandler";
import { createPouncePublicBoard, getPouncePublicMoveCard, projectPouncePublicPosition } from "../PouncePublicAfterstate";
import { getPounceActionMotorGeometry, getPounceMotorMeanMs, getPounceMotorRecoveryMs } from "./motor";
import type { ActionRankingDecisionReviewer, PounceRoomReviewer } from "./types";
import { bestIndex, prefer } from "./upperPolicyUtils";
import checkpoint from "../models/pounceChampion/pounce-center-deadline-fit-v2.json";

type Decision = Parameters<ActionRankingDecisionReviewer>[0];
type Bank = Extract<Move, { type: "c2c" }>;
type CenterOffer = { index: number; move: Bank; key: string; card: CardState; pounce: CardState; unload: Bank; features: number[] };
type Carry = { offer: CenterOffer; started: number; requests: number };
const centerDeadlineSettings = { maxBankMs: 1000, allowedRivalLeadMs: 180, maxCarryMs: 1800, maxCarries: 3,
  maxRequests: 4, peakChainRank: 6, latestRaceRank: 10 };
const centerDeadlineFields = ["race", "rank", "waste", "bankMs", "oppositionMs", "pounceMs", "noBackup", "empties", "pounceCount",
  "rivalPounceCount", "pointsVersusBest", "uniqueBankLane", "rivalsSameRank", "rivalHolding", "ownNext", "ownExposedScorer", "guardScoreGap", "firstVacancy"] as const;
const feed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerOpponentPounceAccess");
const finishFeed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerWinningFinishFeed");
const knownSources: Bank["source"][] = [{ type: "pounce" }, { type: "deck" }, ...[0, 1, 2, 3].map((index) => ({ type: "solitaire" as const, index }))];

const { model, threshold } = checkpoint;
if (!Number.isFinite(threshold) || checkpoint.specification.fields.length !== centerDeadlineFields.length ||
    !centerDeadlineFields.every((field, index) => checkpoint.specification.fields[index] === field) ||
    ![model.center, model.scale, model.weights].every((values) =>
      values.length === centerDeadlineFields.length && values.every(Number.isFinite)) ||
    !model.scale.every((value) => value > 0) || !Number.isFinite(model.intercept)) {
  throw new Error("Invalid champion center deadline checkpoint");
}

function accepts(offer: CenterOffer) {
  const value = model.weights.reduce((score, weight, index) => score + weight *
    Math.max(-5, Math.min(5, (offer.features[index] - model.center[index]) / model.scale[index])), model.intercept);
  return value >= threshold;
}

function proposal(decision: Decision, ranks: readonly number[]) {
  const { board, candidates, playerIndex: seat, hands } = decision;
  const top = bestIndex(ranks), incumbent = candidates[top];
  if (incumbent?.move.type !== "c2c" || incumbent.move.source.type !== "pounce" || incumbent.endsRound) return;
  const actor = board.players[seat], pounce = peek(actor.pounceDeck);
  if (!pounce || pounce.value === 1 || actor.pounceDeck.length <= 1) return;

  const rivals = board.players.map((player, index) => ({ index, player })).filter(({ index, player }) => index !== seat && !player.isSpectating);
  const sameRank = (left: CardState | null | undefined, right: CardState) => left?.suit === right.suit && left.value === right.value;
  const publicSources = (index: number) => knownSources.map((source) => getPouncePublicMoveCard(board.players[index], { type: "c2c", source, dest: 0 }));
  if (rivals.some(({ index }) => [hands[index]?.item, ...publicSources(index)].some((card) => sameRank(card, pounce)))) return;
  const unload = resolveAIMoveForBoard(board, seat, incumbent.move) as Bank;
  const ownMotion = getPounceActionMotorGeometry(board, seat, unload, hands[seat]);
  if (!ownMotion || !canPlayOnCenterPile(board.piles[unload.dest], pounce)) return;

  const masked = createPouncePublicBoard(board);
  const ownEta = getPounceMotorMeanMs(ownMotion), recoveryMs = getPounceMotorRecoveryMs();
  const visibleGap = getCurrentPointsFromCards(actor) - Math.max(...rivals.map(({ player }) => getCurrentPointsFromCards(player)));
  const rivalPounce = Math.min(...rivals.map(({ player }) => player.pounceDeck.length));
  const hasBackup = candidates.some(({ move }) => move.type === "c2s" && move.source === "pounce");
  const empty = actor.stacks.filter((stack) => !stack.length).length;
  const used = new Set<string>();
  let best: CenterOffer | undefined, bestPriority = -Infinity;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    if (candidate.move.type !== "c2c" || candidate.move.source.type === "pounce" || candidate.features[feed] > 0 ||
        candidate.features[finishFeed] > 0 || !Number.isFinite(ranks[index])) continue;
    const move = resolveAIMoveForBoard(board, seat, candidate.move) as Bank;
    if (move.dest === unload.dest) continue;
    const card = getPouncePublicMoveCard(actor, move);
    if (!card || card.value < 2 || card.value > centerDeadlineSettings.latestRaceRank) continue;
    const key = getActionRankingMoveKey(move);
    if (used.has(key)) continue;
    used.add(key);
    const motion = getPounceActionMotorGeometry(board, seat, move, hands[seat]);
    if (!motion) continue;
    const bankMs = getPounceMotorMeanMs(motion);
    if (bankMs > centerDeadlineSettings.maxBankMs) continue;
    const after = projectPouncePublicPosition(masked, seat, move);
    if (!after || !canPlayOnCenterPile(after.piles[unload.dest], pounce)) continue;

    const unique = !board.piles.some((pile, dest) => dest !== move.dest && canPlayOnCenterPile(pile, card));
    const competitors = rivals.flatMap(({ index: other, player }) => knownSources.flatMap((source) => {
      const competing = { type: "c2c" as const, source, dest: move.dest };
      if (!sameRank(getPouncePublicMoveCard(player, competing), card)) return [];
      const physical = getPounceActionMotorGeometry(board, other, competing, hands[other]);
      if (!physical) return [];
      return [{ time: getPounceMotorMeanMs(physical), held: physical.holding, final: source.type === "pounce" && player.pounceDeck.length === 1 }];
    })).sort((a, b) => a.time - b.time);
    const fastest = competitors[0];
    if (competitors.some(({ final }) => final)) continue;
    const contested = fastest && unique && fastest.time >= bankMs - centerDeadlineSettings.allowedRivalLeadMs && fastest.time <= ownEta + recoveryMs + bankMs;
    const ownAfter = after.players[seat];
    const others = [peek(ownAfter.flippedDeck), ...ownAfter.stacks.map(peek)].filter((choice) => choice && !cardEquals(card, choice));
    const ownNext = others.filter((choice) => choice && canPlayOnCenterPile(after.piles[move.dest], choice)).length;
    const exposed = move.source.type === "solitaire" ? peek(ownAfter.stacks[move.source.index]) : undefined;
    const exposesScore = Number(!!exposed && after.piles.some((pile) => canPlayOnCenterPile(pile, exposed)));
    const chain = !fastest && card.value <= centerDeadlineSettings.peakChainRank && (ownNext > 0 || exposesScore > 0);
    const vacancy = empty === 0 && move.source.type === "solitaire" && ownAfter.stacks[move.source.index].length === 0 &&
      (!fastest || fastest.time >= bankMs - centerDeadlineSettings.allowedRivalLeadMs);
    if (!contested && !chain && !vacancy) continue;
    const priority = (contested ? 2 + (fastest.time - bankMs) / 1300 : 0) + Number(vacancy) + Number(ownNext > 0) * .35 - bankMs / 1500 - card.value / 22;
    if (priority <= bestPriority) continue;
    bestPriority = priority;
    best = { index, move, key, card, pounce, unload,
      features: [Number(Boolean(contested)), card.value / 13, Number(move.source.type === "deck"), bankMs / 1000,
        (fastest?.time ?? 2600) / 1000, ownEta / 1000, Number(!hasBackup), empty / 4,
        actor.pounceDeck.length / 13, rivalPounce / 13, visibleGap / 30, Number(unique), competitors.length / 3, Number(Boolean(fastest?.held)),
        ownNext, exposesScore, Math.max(0, Math.min(80, ranks[top] - ranks[index])) / 40, Number(vacancy)] };
  }
  return best;
}

export function createCenterDeadlineReviewer(incumbent: PounceRoomReviewer, tactics: PounceRoomReviewer): PounceRoomReviewer {
  const seats = Array.from({ length: 4 }, () => ({
    seen: new Set<string>(), starts: 0, approaching: false, carry: undefined as Carry | undefined,
  }));
  let now = 0;
  function cancel(seat: number) {
    seats[seat].carry = undefined;
  }
  return {
    ...incumbent,
    reviewClock(time) { now = time; incumbent.reviewClock?.(time); tactics.reviewClock?.(time); },
    reviewDecision(decision) {
      const { board, playerIndex: seat, hands, scores, candidates } = decision;
      const usual = incumbent.reviewDecision(decision), ranks = usual ?? scores;
      const state = seats[seat];
      if (board.players.length !== 4 || !state || board.players.some(({ isSpectating }) => isSpectating)) return usual;
      if (candidates.length > scores.length) { cancel(seat); return usual; }
      const tactical = tactics.reviewDecision(decision), top = candidates[bestIndex(ranks)], actor = board.players[seat];
      if (!top || top.endsRound || top.move.type === "premove" || tactical?.some((score, i) => Number.isFinite(score) && score > scores[i])) {
        cancel(seat); return usual;
      }
      if (state.carry) {
        const { offer, started, requests } = state.carry;
        const i = candidates.findIndex(({ move, features }, index) => Number.isFinite(ranks[index]) && move.type === "c2c" &&
          features[feed] <= 0 && features[finishFeed] <= 0 && getActionRankingMoveKey(resolveAIMoveForBoard(board, seat, move)) === offer.key &&
          cardEquals(getPouncePublicMoveCard(actor, move), offer.card));
        const stable = cardEquals(peek(actor.pounceDeck), offer.pounce) && canPlayOnCenterPile(board.piles[offer.unload.dest], offer.pounce);
        if (!stable || i < 0 || (hands[seat]?.item && !cardEquals(hands[seat].item, offer.card)) ||
          now - started > centerDeadlineSettings.maxCarryMs || requests >= centerDeadlineSettings.maxRequests) { cancel(seat); return usual; }
        state.carry.requests++;
        return prefer(ranks, i);
      }
      if (hands[seat]?.item || hands[seat]?.items?.length || state.approaching || state.starts >= centerDeadlineSettings.maxCarries) return usual;
      const offer = proposal(decision, ranks);
      if (!offer) return usual;
      const key = `${offer.pounce.suit}:${offer.pounce.value}`;
      if (state.seen.has(key)) return usual;
      state.seen.add(key);
      if (!accepts(offer)) return usual;
      state.carry = { offer, started: now, requests: 1 };
      state.starts++;
      return prefer(ranks, offer.index);
    },
    reviewMove(event) {
      incumbent.reviewMove?.(event); tactics.reviewMove?.(event);
      const { board, playerIndex: seat, move, result } = event;
      const state = seats[seat];
      if (!state) return;
      state.approaching = Boolean(result?.cursorMove && !result.cursorMoveItem && !result.cursorMoveItems?.length && move.type !== "cycle");
      const offer = state.carry?.offer;
      if (!offer) return;
      if (result?.boardChanged && move.type === "c2c" && move.dest === offer.move.dest && cardEquals(peek(board.piles[move.dest]), offer.card)) {
        state.carry = undefined;
      } else if (!result?.cursorMove || result.boardChanged) cancel(seat);
    },
    reviewDeckRotation() { incumbent.reviewDeckRotation?.(); tactics.reviewDeckRotation?.(); seats.forEach((_, i) => cancel(i)); },
  };
}
