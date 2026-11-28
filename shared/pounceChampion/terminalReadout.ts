import { ACTION_RANKING_FEATURE_NAMES, type ActionRankingCandidate, type ActionRankingFeatureName } from "../ActionRankingPolicy";
import { allowsVisibleLaneOverride, createPounceLaneLayoutTracker, hasDirectPounceUnload } from "../PounceActionAdvantage";
import { resolveAIMoveForBoard } from "../MoveHandler";
import { getPouncePublicMoveCard, isPouncePublicMove } from "../PouncePublicAfterstate";
import checkpoint from "../models/pounceChampion/pounce-parallel-paired-population-v1-weights.json";
import type { PounceRoomReviewer } from "./types";
import { bestIndex, prefer } from "./upperPolicyUtils";

const terminalPopulationTerms = [
  "bank", "wasteBank", "cycle", "wasteSetup", "tableauMerge", "openSlot", "useSlot",
  "pounceAccess", "exposeCenter", "ownFollow", "rivalFollow", "rivalPounceAccess",
  "wasteBridge", "tableauBridge", "coveredCenter",
  "developEarly", "developWhenBlocked", "bankWhenThreatened", "denyWhenThreatened",
  "cycleWithStock", "cycleLate", "slotWhileBlocked", "wasteBridgeStock",
] as const;

const selected = [
  "strategy.lastSlotOpened", "strategy.lastSlotUsed", "solitaire.makesPouncePlayable",
  "strategy.slotPounceAccessDelta", "strategy.buriedCenterExposed", "source.exposedCenterPlayable",
  "center.ownCanFollowAfter", "center.ownPounceCanFollowAfter", "center.opponentFollowPressureAfter",
  "strategy.centerOpponentPounceAccess", "strategy.centerWinningFinishFeed",
  "connector.wasteBridge", "connector.tableauBridge", "connector.partnerCenterPassed",
  "connector.coveredCenterAccess", "solitaire.postTopConnectsPounce",
] as const satisfies readonly ActionRankingFeatureName[];
const indices = selected.map((name) => ACTION_RANKING_FEATURE_NAMES.indexOf(name));
if (indices.some((index) => index < 0)) throw new Error("Terminal population feature schema changed");
const lastSlotUsed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.lastSlotUsed");
const rivalWinningFeed = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerWinningFinishFeed");
const connectsPounce = ACTION_RANKING_FEATURE_NAMES.indexOf("solitaire.postTopConnectsPounce");

const { parameters } = checkpoint.weights;
if (checkpoint.version !== 1 || checkpoint.players !== 4 || checkpoint.scoreBasis !== "raw" ||
    checkpoint.terms.length !== terminalPopulationTerms.length ||
    !terminalPopulationTerms.every((term, index) => checkpoint.terms[index] === term) ||
    parameters.length !== terminalPopulationTerms.length ||
    parameters.some((value) => !Number.isFinite(value) || Math.abs(value) > 20)) {
  throw new Error("Invalid champion strategic readout checkpoint");
}

export function createTerminalReadoutReviewer(base: PounceRoomReviewer, tactics: PounceRoomReviewer): PounceRoomReviewer {
  const track = createPounceLaneLayoutTracker();
  return {
    ...base,
    reviewDecision(decision) {
      const ordinary = base.reviewDecision(decision);
      const tactical = tactics.reviewDecision(decision);
      const { board, candidates, playerIndex: seat, hands, scores } = decision;
      const visited = track(decision);
      if (board.players.filter((player) => !player.isSpectating).length !== 4 || candidates.length < 2 ||
          hands[seat]?.item || hasDirectPounceUnload(candidates) ||
          tactical?.some((value, index) => Number.isFinite(value) && value > scores[index])) return ordinary;
      const ranked = ordinary ?? scores;
      const incumbent = bestIndex(ranked);
      const usual = candidates[incumbent];
      if (!Number.isFinite(ranked[incumbent]) || !isAdjustable(usual) || usual.endsRound) return ordinary;
      const actor = board.players[seat];
      const remaining = actor.pounceDeck.length;
      const rival = board.players.reduce((smallest, opponent, index) =>
        index === seat || opponent.isSpectating ? smallest : Math.min(smallest, opponent.pounceDeck.length), 13);
      const context = {
        early: Math.min(1, Math.max(0, remaining - 4) / 8),
        blocked: Number(actor.stacks.every((stack) => stack.length > 0)),
        pressure: Math.max(0, 1 - rival / 8),
        stock: actor.deck.length / Math.max(1, actor.deck.length + actor.flippedDeck.length),
      };
      let next = incumbent, best = ranked[incumbent] + offset(usual, context, parameters);
      for (let index = 0; index < candidates.length; index++) {
        if (index === incumbent || !Number.isFinite(ranked[index])) continue;
        const candidate = candidates[index];
        if (candidate.equivalenceKey === usual.equivalenceKey || !isAdjustable(candidate) ||
            !allowsVisibleLaneOverride(usual, candidate) || !visited(candidate.move)) continue;
        // Leave tactical imminent wins and a physically helpful empty slot to the incumbent.
        if (candidate.features[rivalWinningFeed] > 0 || (candidate.move.type === "c2s" &&
            candidate.features[lastSlotUsed] > 0 && candidate.features[connectsPounce] <= 0)) continue;
        const score = ranked[index] + offset(candidate, context, parameters);
        if (score > best) { next = index; best = score; }
      }
      if (next === incumbent) return ordinary;
      const move = resolveAIMoveForBoard(board, seat, candidates[next].move);
      if (move.type !== "cycle" && !(isPouncePublicMove(move) && getPouncePublicMoveCard(actor, move))) return ordinary;
      return prefer(ranked, next);
    },
    reviewMove(event) {
      base.reviewMove?.(event);
      tactics.reviewMove?.(event);
    },
    reviewDeckRotation() {
      base.reviewDeckRotation?.();
      tactics.reviewDeckRotation?.();
    },
  };
}

function isAdjustable({ move }: ActionRankingCandidate) {
  return move.type === "c2c" || (move.type === "c2s" && move.source === "deck") ||
    move.type === "s2s" || move.type === "cycle";
}

function offset({ move, features }: ActionRankingCandidate, { early, blocked, pressure, stock }: {
  early: number; blocked: number; pressure: number; stock: number;
}, weights: readonly number[]) {
  const [opens, uses, makesPounce, pounceAccess, buriedCenter, exposed, ownFollow, ownPounce,
    rivalFollow, rivalPounce, , wasteBridge, tableauBridge, passed, covered] = indices;
  const bank = Number(move.type === "c2c");
  const cycle = Number(move.type === "cycle");
  const setup = Number(move.type === "c2s");
  const merge = Number(move.type === "s2s");
  const wasteBank = Number(move.type === "c2c" && move.source.type === "deck");
  const slot = features[opens] - features[uses];
  const access = features[makesPounce] + Math.tanh(features[pounceAccess]);
  const exposure = Math.min(1, features[buriedCenter] + features[exposed]);
  const own = Math.tanh(features[ownFollow]) + features[ownPounce];
  const rival = Math.tanh(features[rivalFollow]);
  const denial = Math.tanh(features[rivalPounce]);
  const fromWaste = features[wasteBridge] * (0.5 + 0.5 * features[passed]);
  const fromTableau = features[tableauBridge] * (0.5 + 0.5 * features[passed]);
  const development = setup + merge;
  const terms = [bank, wasteBank, cycle, setup, merge, features[opens], features[uses], access, exposure, own,
    rival, denial, fromWaste, fromTableau, Math.tanh(features[covered]), early * development,
    blocked * (development + access), pressure * bank, pressure * (rival + denial), stock * cycle,
    pressure * cycle, blocked * slot, stock * fromWaste];
  return terms.reduce((value, term, index) => value + term * weights[index], 0);
}
