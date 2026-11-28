import { canPlayOnCenterPile, cardEquals, peek } from "../CardUtils";
import { getCurrentAIDragMove } from "../ComputerV1";
import { isCardCursorLocation, type BoardState, type CardState } from "../GameUtils";
import type { Move } from "../MoveHandler";
import { getPouncePublicMoveCard } from "../PouncePublicAfterstate";
import { getPounceActionMotorGeometry, getPounceMotorMeanMs } from "./motor";
import type { PounceCursorObservation, PounceRoomReviewer } from "./types";

type Decision = Parameters<PounceRoomReviewer["reviewDecision"]>[0];
type Bank = Extract<Move, { type: "c2c" }>;

export type PounceCompletedDragWitness = {
  at: number;
  dest: number;
  card: CardState;
  prior: CardState;
  source: Bank["source"]["type"];
};

export function observePounceHeldBank({ board, hands }: Pick<Decision, "board" | "hands">, rival: number, now: number): PounceCompletedDragWitness | undefined {
  const hand = hands[rival];
  const card = hand?.item;
  if (!card || card.value === 1 || card.value === 13 || (hand.items?.length ?? 0) > 1) return;
  const move = getCurrentAIDragMove(board, rival, hand);
  if (move?.type !== "c2c") return;
  const prior = peek(board.piles[move.dest]);
  if (!prior || !canPlayOnCenterPile(board.piles[move.dest], card)) return;
  const actor = board.players[rival];
  if (move.source.type === "pounce" && actor.pounceDeck.length === 1) return;
  return { at: now, dest: move.dest, card, prior, source: move.source.type };
}

export function readPounceHeldBankRelease(
  { board, hands, playerIndex: seat }: Pick<Decision, "board" | "hands"> & { playerIndex?: number },
  rival: number,
  witness: PounceCompletedDragWitness,
  now: number,
): boolean {
  if ((seat !== undefined && (hands[seat]?.items?.length ?? 0) > 1) || now - witness.at > 1_025) return false;
  const location = hands[rival]?.location;
  if (hands[rival]?.item || !isCardCursorLocation(location) || location.player !== rival || cardEquals(location, witness.card)) return false;
  return cardEquals(peek(board.piles[witness.dest]), witness.prior);
}

export function projectPounceCompletedDrag(board: BoardState, held: PounceCompletedDragWitness): BoardState {
  const piles = board.piles.slice();
  piles[held.dest] = [...board.piles[held.dest], held.card];
  return { ...board, piles };
}

export function restorePounceFocusedPrior(board: BoardState, witness: PounceCompletedDragWitness): BoardState | undefined {
  const pile = board.piles[witness.dest];
  const marker = peek(pile);
  if (marker?.value !== 13 || marker.value - witness.prior.value < 2 || marker.player !== witness.card.player ||
    marker.suit !== witness.card.suit || !cardEquals(pile[pile.length - 2], witness.prior)) return;
  const piles = board.piles.slice();
  piles[witness.dest] = pile.slice(0, -1);
  return { ...board, piles };
}

export function createPounceCursorReleaseHistory() {
  const held: (PounceCompletedDragWitness | undefined)[] = [];
  const releases: ({ witness: PounceCompletedDragWitness; releasedAt: number } | undefined)[] = [];
  return {
    releases,
    observe(observation: PounceCursorObservation) {
      const { board, time, changedSeats } = observation;
      if (board.players.length !== 4 || board.players.some(({ isSpectating }) => isSpectating)) return;
      for (const rival of changedSeats) {
        const past = held[rival];
        if (past && readPounceHeldBankRelease(observation, rival, past, time)) releases[rival] = { witness: past, releasedAt: time };
        held[rival] = observePounceHeldBank(observation, rival, time);
      }
    },
    clear() {
      held.length = 0;
      releases.length = 0;
    },
  };
}

export type CompletedDragFollow = { move: Bank; card: CardState; dest: number; eta: number };

export function getCompletedDragFollowups(decision: Decision, held: PounceCompletedDragWitness): CompletedDragFollow[] {
  const { board, playerIndex: seat, hands, candidates } = decision;
  if (candidates.some(({ move }) => move.type === "c2c")) return [];
  const own = board.players[seat];
  const sources: Bank["source"][] = [{ type: "deck" }, ...own.stacks.map((_, index) => ({ type: "solitaire" as const, index }))];
  const predicted = projectPounceCompletedDrag(board, held);
  const dest = held.dest;
  const rivalCanTake = board.players.some((rival, rivalSeat) => rivalSeat !== seat && !rival.isSpectating &&
    [peek(rival.pounceDeck), peek(rival.flippedDeck), ...rival.stacks.map(peek)].some((other) =>
      !!other && canPlayOnCenterPile(predicted.piles[dest], other)));
  return sources.flatMap((source) => {
    const move: Bank = { type: "c2c", source, dest };
    const card = getPouncePublicMoveCard(own, move);
    if (!card || !canPlayOnCenterPile(predicted.piles[dest], card) || board.piles.some((pile) => canPlayOnCenterPile(pile, card))) return [];
    const motor = getPounceActionMotorGeometry(predicted, seat, move, hands[seat]);
    if (!motor) return [];
    const eta = getPounceMotorMeanMs(motor);
    if (!(eta <= 900) || (rivalCanTake && !(rivalCompletedDragArrival(predicted, decision, dest) >= eta))) return [];
    return [{ move, card, dest, eta }];
  });
}

function rivalCompletedDragArrival(board: BoardState, { playerIndex, hands }: Decision, dest: number): number {
  let eta = 2_500;
  for (let seat = 0; seat < board.players.length; seat++) {
    const player = board.players[seat];
    if (seat === playerIndex || player.isSpectating) continue;
    const sources: Bank["source"][] = [{ type: "pounce" }, { type: "deck" },
      ...player.stacks.map((_, index) => ({ type: "solitaire" as const, index }))];
    for (const source of sources) {
      const move: Bank = { type: "c2c", source, dest };
      const card = getPouncePublicMoveCard(player, move);
      if (!card || !canPlayOnCenterPile(board.piles[dest], card)) continue;
      const motion = getPounceActionMotorGeometry(board, seat, move, hands[seat]);
      if (motion) eta = Math.min(eta, getPounceMotorMeanMs(motion));
    }
  }
  return eta;
}
