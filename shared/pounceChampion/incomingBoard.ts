import { canPlayOnCenterPile, cardEquals, peek } from "../CardUtils";
import { cursorLocationsEqual, type BoardState } from "../GameUtils";
import { getPouncePublicMoveCard } from "../PouncePublicAfterstate";
import { observePounceHeldBank, projectPounceCompletedDrag, type PounceCompletedDragWitness } from "./foundation";
import { getPounceActionMotorGeometry, getPounceMotorMeanMs } from "./motor";
import type { PounceRoomReviewer } from "./types";
import { bestIndex } from "./upperPolicyUtils";

type Flight = { witness: PounceCompletedDragWitness; upperArrival: number };
const maxRemaining = 180;

export function createIncomingBoardReviewer(base: PounceRoomReviewer): PounceRoomReviewer {
  const flights: (Flight | undefined)[] = [];
  const priorBoards: (BoardState | undefined)[] = [];
  let now = 0;
  return {
    ...base,
    reviewClock(time) { now = time; base.reviewClock?.(time); },
    reviewCursorUpdates(observation) {
      base.reviewCursorUpdates?.(observation);
      const { board, time, changedSeats } = observation;
      if (board.players.length !== 4 || board.players.some(({ isSpectating }) => isSpectating)) return;
      for (const seat of changedSeats) {
        flights[seat] = undefined;
        const witness = observePounceHeldBank(observation, seat, time);
        if (!witness) continue;
        const actor = board.players[seat];
        const source = witness.source === "pounce" ? { type: "pounce" as const } : witness.source === "deck" ? { type: "deck" as const } :
          { type: "solitaire" as const, index: actor.stacks.findIndex((stack) => cardEquals(peek(stack), witness.card)) };
        if (source.type === "solitaire" && source.index < 0) continue;
        const geometry = getPounceActionMotorGeometry(board, seat, { type: "c2c", source, dest: witness.dest }, { location: witness.card });
        if (!geometry) continue;
        flights[seat] = { witness, upperArrival: time + 1.2 * getPounceMotorMeanMs(geometry) };
      }
    },
    projectObservedBoard(board, seat, hands) {
      const current = base.projectObservedBoard?.(board, seat, hands) ?? board;
      priorBoards[seat] = undefined;
      if (board.players.length !== 4 || board.players.some(({ isSpectating }) => isSpectating) || hands[seat]?.item) return current;
      let projected = current;
      for (let rival = 0; rival < flights.length; rival++) {
        const flight = flights[rival];
        if (!flight || rival === seat || flight.upperArrival - now > maxRemaining || now - flight.upperArrival > 80) continue;
        const { witness } = flight;
        if (!cardEquals(hands[rival]?.item, witness.card) || !cursorLocationsEqual(hands[rival]?.location, witness.prior) ||
          !cardEquals(peek(projected.piles[witness.dest]), witness.prior)) continue;
        const actor = current.players[seat];
        const ownSources = [{ type: "pounce" as const }, { type: "deck" as const },
          ...actor.stacks.map((_, index) => ({ type: "solitaire" as const, index }))];
        const rivalRemaining = flight.upperArrival - now;
        const winnable = ownSources.some((source) => {
          const move = { type: "c2c" as const, source, dest: witness.dest };
          const card = getPouncePublicMoveCard(actor, move);
          if (!card || !canPlayOnCenterPile(current.piles[witness.dest], card)) return false;
          const geometry = getPounceActionMotorGeometry(current, seat, move, hands[seat]);
          return geometry && .80 * getPounceMotorMeanMs(geometry) <= rivalRemaining;
        });
        if (winnable) continue;
        projected = projectPounceCompletedDrag(projected, witness);
      }
      if (projected !== current) {
        const actor = current.players[seat];
        const sources = [peek(actor.pounceDeck), peek(actor.flippedDeck), ...actor.stacks.map(peek)];
        const relevant = projected.piles.some((pile, dest) => pile !== current.piles[dest] && sources.some((card) => card &&
          canPlayOnCenterPile(pile, card) !== canPlayOnCenterPile(current.piles[dest], card)));
        if (relevant) {
          priorBoards[seat] = current;
          return projected;
        }
      }
      return current;
    },
    reviewDecision(decision) {
      const ordinary = base.reviewDecision(decision);
      const { board, playerIndex: seat, candidates, hands, scores } = decision;
      const current = priorBoards[seat];
      if (!current) return ordinary;
      const ranks = ordinary ?? scores;
      const filtered = ranks.map((value, index) => {
        const { move } = candidates[index];
        if (move.type !== "c2c" || board.piles[move.dest] === current.piles[move.dest]) return value;
        const card = getPouncePublicMoveCard(board.players[seat], move);
        if (!card || canPlayOnCenterPile(current.piles[move.dest], card)) return value;
        // Before the predecessor lands, offer approaches only. The engine still checks legality.
        if (move.source.type === "pounce" || cursorLocationsEqual(hands[seat]?.location, card)) return -Infinity;
        return value;
      });
      const best = bestIndex(filtered);
      if (!Number.isFinite(filtered[best])) return candidates.map(({ move }) => move.type === "wait" ? 0 : -Infinity);
      return filtered;
    },
    reviewDeckRotation() { base.reviewDeckRotation?.(); flights.length = 0; priorBoards.length = 0; },
  };
}
