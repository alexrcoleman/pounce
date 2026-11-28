import { canPlayOnCenterPile, cardEquals, peek } from "../CardUtils";
import type { BoardState, CardState, CursorState } from "../GameUtils";
import type { Move } from "../MoveHandler";
import { createPouncePublicBoard, getPouncePublicMoveCard, projectPouncePublicPosition } from "../PouncePublicAfterstate";
import { getPounceActionMotorGeometry, getPounceMotorMeanMs, getPounceMotorRecoveryMs } from "./motor";
import type { ActionRankingDecisionReviewer, PounceRoomReviewer } from "./types";
import { bestIndex, prefer } from "./upperPolicyUtils";

type Bank = Extract<Move, { type: "c2c" }>;
type Decision = Parameters<ActionRankingDecisionReviewer>[0];
type Source = { seat: number; source: Bank["source"]; card: CardState; hand?: CursorState };
type Choice = { index: number; value: number };

const minAdvantage = .045;
const recovery = getPounceMotorRecoveryMs();

function visibleSources(board: BoardState, seat: number, suit: CardState["suit"], value: number, hand?: CursorState): Source[] {
  const player = board.players[seat];
  if (player.isSpectating) return [];
  const sources: Bank["source"][] = [{ type: "pounce" }, { type: "deck" },
    ...player.stacks.map((_, index) => ({ type: "solitaire" as const, index }))];
  return sources.flatMap((source) => {
    const card = getPouncePublicMoveCard(player, { type: "c2c", source, dest: 0 });
    return card?.suit === suit && card.value === value ? [{ seat, source, card, hand }] : [];
  });
}

function arrival(board: BoardState, entry: Source, dest: number) {
  const geometry = getPounceActionMotorGeometry(board, entry.seat, { type: "c2c", source: entry.source, dest }, entry.hand);
  return geometry === undefined ? Infinity : getPounceMotorMeanMs(geometry);
}

function raceShare(lead: number) {
  return Math.max(.04, Math.min(.96, .5 + lead / 900));
}

function opportunityValue(board: BoardState, next: Source[], seat: number, firstBankMs: number) {
  const entries = next.flatMap((entry) => {
    const best = Math.min(...board.piles.flatMap((pile, dest) => canPlayOnCenterPile(pile, entry.card) ? [arrival(board, entry, dest)] : []));
    if (!Number.isFinite(best)) return [];
    const own = entry.seat === seat;
    const delay = own ? recovery : entry.source.type === "pounce" ? 200 : 350;
    return [{ time: best + delay, value: (entry.source.type === "pounce" ? 3 : 1) * (own ? 1 : -1 / 3) }];
  }).sort((a, b) => a.time - b.time);
  const [first, other] = entries;
  if (!first) return 0;
  const discounted = (entry: typeof first) => entry.value * Math.exp(-(entry.time + firstBankMs) / 2_500);
  if (!other) return discounted(first);
  const likely = raceShare(other.time - first.time);
  return likely * discounted(first) + (1 - likely) * discounted(other);
}

function nextHand(board: BoardState, seat: number, source: Bank["source"]): CursorState {
  const player = board.players[seat];
  const preferred = source.type === "solitaire" ? peek(player.stacks[source.index]) : source.type === "pounce" ?
    peek(player.pounceDeck) : peek(player.flippedDeck);
  return { location: preferred ?? peek(player.pounceDeck) ?? peek(player.flippedDeck) ?? player.stacks.map(peek).find(Boolean) };
}

function bestLane(decision: Decision, ranking: readonly number[], index: number) {
  const { board, playerIndex: seat, hands, candidates } = decision;
  const current = candidates[index].move;
  if (current.type !== "c2c") return;
  const card = getPouncePublicMoveCard(board.players[seat], current);
  if (!card || card.value === 1) return;
  const options = candidates.flatMap(({ move }, offset) => move.type === "c2c" && Number.isFinite(ranking[offset]) &&
    cardEquals(getPouncePublicMoveCard(board.players[seat], move), card) ? [{ index: offset, move }] : []);
  if (options.length < 2) return;
  const rivals = board.players.map((_, rival) => rival).filter((rival) => rival !== seat);
  const same = rivals.flatMap((rival) => visibleSources(board, rival, card.suit, card.value, hands[rival]));
  const following = rivals.flatMap((rival) => visibleSources(board, rival, card.suit, card.value + 1, hands[rival]));
  const masked = createPouncePublicBoard(board);
  masked.piles = board.piles;



  const estimate = ({ index, move }: { index: number; move: Bank }): Choice => {
    const bankMs = arrival(board, { seat, source: move.source, card, hand: hands[seat] }, move.dest);
    const rivalsMs = Math.min(...same.map((entry) => arrival(board, entry, move.dest)));
    const win = Number.isFinite(rivalsMs) ? raceShare(rivalsMs - bankMs) : 1;
    const ownPoints = move.source.type === "pounce" ? 3 : 1;
    const bankValue = ownPoints * win - bankMs / 2_500;
    const after = projectPouncePublicPosition(masked, seat, move);
    if (!after) return { index, value: -Infinity };
    const own = visibleSources(after, seat, card.suit, card.value + 1, nextHand(after, seat, move.source));
    return { index, value: bankValue + win * opportunityValue(after, [...own, ...following], seat, bankMs) };
  };
  const reference = estimate({ index, move: current });
  const winner = options.map(estimate).reduce((best, alternative) => alternative.value > best.value ? alternative : best, reference);
  if (winner.index === index || winner.value - reference.value < minAdvantage) return;

  return winner.index;
}

export function createParallelLanesReviewer(base: PounceRoomReviewer): PounceRoomReviewer {
  const pending: boolean[] = [];
  return {
    ...base,
    reviewDecision(decision) {
      const ordinary = base.reviewDecision(decision), ranking = ordinary ?? decision.scores;
      const { board, playerIndex: seat, hands } = decision;
      if (board.players.length !== 4 || board.players.some(({ isSpectating }) => isSpectating) || hands[seat]?.item || pending[seat]) return ordinary;
      const alternative = bestLane(decision, ranking, bestIndex(ranking));
      if (alternative === undefined) return ordinary;
      pending[seat] = true;
      return prefer(ranking, alternative);
    },
    reviewMove(event) {
      base.reviewMove?.(event);
      const { playerIndex: seat, result } = event;
      if (!pending[seat] || result?.cursorMoveItem || result?.cursorMoveItems?.length) return;
      pending[seat] = false;
    },
    reviewDeckRotation() { base.reviewDeckRotation?.(); pending.length = 0; },
  };
}
