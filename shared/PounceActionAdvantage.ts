import {
  ACTION_RANKING_FEATURE_NAMES,
  type ActionRankingCandidate,
  type ActionRankingFeatureName,
} from "./ActionRankingPolicy";
import type { ActionRankingDecisionReviewer } from "./pounceChampion/types";
import { peek } from "./CardUtils";
import type { CardState, PlayerState } from "./GameUtils";
import { isProductiveMove, type Move } from "./MoveHandler";
import { getPounceIncomingStageFeatures, reviewIncomingPremove } from "./PounceIncomingPremove";
import { getPounceTimingFeatures } from "./PounceTimingFeatures";
import { getPounceVisibleLaneFeatures } from "./PounceVisibleLanes";

export type PounceActionAdvantageModel = {
  version: 1;
  weights: number[];
  threshold: number;
  maximumScoreGap: number;
  decisionScope?: "setup" | "productive" | "incoming" | "incoming-suppress" | "destination" |
    "stock" | "stock-stalled" | "proposal";
  useTiming?: boolean;
  useLanes?: boolean;
  useReservePotential?: boolean;
  stockWhenCycling?: boolean;
  stageFallbackCenterOnly?: boolean;
  hidden?: PounceActionAdvantageHidden;
  proposalTimingScale?: number;
};

export type PounceActionAdvantageHidden = {
  inputWeights: number[][];
  biases: number[];
  outputWeights: number[];
};

type PairedFeatures = { baseline: readonly number[]; alternative: readonly number[] };

export type PounceStageSuppressionContext = {
  origin: "standard" | "learned" | "extra";
  fallbackFromConnector: boolean;
};

const familyNames = [
  "move.c2c", "move.c2s", "move.s2s", "move.cycle", "source.pounce", "source.deck",
] satisfies ActionRankingFeatureName[];
const differenceNames = [
  "move.immediatePointDelta", "move.clearsPounce", "dest.isEmpty", "source.exposesCard",
  "source.exposedCenterPlayable", "source.exposedCanPlaySoon",
  "solitaire.makesPouncePlayable", "solitaire.postTopConnectsPounce",
  "solitaire.exposesCenterPlayable", "solitaire.exposesCanPlaySoon", "solitaire.movesFullStack",
  "solitaire.destTopCanPlaySoon", "solitaire.deckMoveHelpful", "card.canPlaySoon",
  "center.ownPounceCanFollowAfter", "center.ownCanFollowAfter",
  "center.opponentPounceCanFollowAfter", "center.opponentPounceCanPlaySameNow",
  "center.opponentsCanPlaySameNow", "strategy.lastSlotUsed", "strategy.lastSlotOpened",
  "strategy.slotPounceAccessDelta", "strategy.slotBuriedAccessDelta",
  "strategy.centerOpponentPounceAccess", "strategy.centerWinningFinishFeed",
  "connector.tableauBridge", "connector.wasteBridge", "connector.pounceBridge",
  "connector.slotGain", "connector.partnerCenterPassed", "connector.partnerCenterAccess",
] satisfies ActionRankingFeatureName[];
const contextNames = [
  "own.pounceCount", "opponent.minPounceCount", "own.stockFraction", "own.emptyStackCount",
  "own.pounceCanPlaySoon", "own.stackCenterPlayableCount", "own.pointDifferential",
  "board.ticksSinceNonWaitMove", "opponent.handCenterPlayableCount", "board.isHeadsUp",
] satisfies ActionRankingFeatureName[];
const indices = (names: readonly ActionRankingFeatureName[]) =>
  names.map((name) => ACTION_RANKING_FEATURE_NAMES.indexOf(name));
const familyIndices = indices(familyNames);
const differenceIndices = indices(differenceNames);
const contextIndices = indices(contextNames);
const stockContextIndices = indices([
  "own.wasteFraction", "own.wasteCanPlaySoon", "own.wasteCenterDistance",
  "own.wasteOwnSolitaireDestinationCount", "own.wasteOwnSolitaireConnectorForPounce",
  "own.wastePounceConnectorCloseness", "own.wasteMatchesPounceParity",
]);
const cycleShapeIndices = indices(["cycle.resetsWaste", "cycle.stockFractionAfter", "cycle.cardsAdvanced"]);
const cycleIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("move.cycle");
const aceIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("card.isAce");
const fullStackIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("solitaire.movesFullStack");
const emptyDestinationIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("dest.isEmpty");
const exposedCenterIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("solitaire.exposesCenterPlayable");
const opensPounceIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("solitaire.makesPouncePlayable");
const pounceAccessIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.slotPounceAccessDelta");
const pounceFeedIndex = ACTION_RANKING_FEATURE_NAMES.indexOf("strategy.centerOpponentPounceAccess");

export function getActionAdvantageInputs(
  baseline: readonly number[],
  alternative: readonly number[],
  scoreGap: number,
  timing?: PairedFeatures,
  lanes?: PairedFeatures,
  useStock = false,
  reservePotential?: readonly number[]
): number[] {
  const baselineFamily = familyIndices.map((index) => baseline[index]);
  const alternateFamily = familyIndices.map((index) => alternative[index]);
  const diff = differenceIndices.map((index) => alternative[index] - baseline[index]);
  const context = contextIndices.map((index) => baseline[index]);
  const relevantInteractions = [context[0], context[1], context[2], context[3], context[6]]
    .flatMap((value) => alternateFamily.map((move) => value * move));
  const timingInputs = timing ? [
    ...timing.baseline, ...timing.alternative,
    ...timing.alternative.map((value, index) => value - timing.baseline[index]),
  ] : [];
  const laneInputs = lanes ? lanes.alternative.map((value, index) => value - lanes.baseline[index]) : [];
  const stockInputs = useStock ? [
    ...stockContextIndices.map((index) => baseline[index]),
    ...cycleShapeIndices.flatMap((index) => [baseline[index], alternative[index]]),
  ] : [];
  const reserveInputs = reservePotential ? reservePotential.map((value) =>
    (alternative[cycleIndex] - baseline[cycleIndex]) * value) : [];
  return [
    1, scoreGap / 22, ...baselineFamily, ...alternateFamily, ...diff, ...context,
    ...relevantInteractions, ...timingInputs, ...laneInputs, ...stockInputs, ...reserveInputs,
  ].map((value) => Number.isFinite(value) ? Math.max(-2, Math.min(2, value)) : 0);
}

export function predictActionAdvantage(
  model: PounceActionAdvantageModel, inputs: readonly number[]
): number {
  if (model.version !== 1 || model.weights.length !== inputs.length) {
    throw new Error("Action advantage model does not match inputs");
  }
  const linear = inputs.reduce((sum, value, index) => sum + value * model.weights[index], 0);
  const hidden = model.hidden;
  return hidden
    ? actionAdvantageHiddenActivations(hidden, inputs)
      .reduce((sum, value, index) => sum + value * hidden.outputWeights[index], linear)
    : linear;
}

export function getPounceStageSuppressionInputs(
  pair: readonly number[],
  stage: readonly number[],
  { origin, fallbackFromConnector }: PounceStageSuppressionContext
): number[] {
  return [...pair, ...stage, Number(origin === "standard"), Number(origin === "learned"),
    Number(origin === "extra"), Number(fallbackFromConnector)];
}

export function shouldSuppressPounceStage(
  decision: Parameters<ActionRankingDecisionReviewer>[0],
  { stagedIndex, fallbackIndex, ...context }: PounceStageSuppressionContext & {
    stagedIndex: number;
    fallbackIndex: number;
  },
  model: PounceActionAdvantageModel
): boolean {
  const { candidates, scores } = decision;
  const gap = scores[stagedIndex] - scores[fallbackIndex];
  if (model.decisionScope !== "incoming-suppress" || !Number.isFinite(gap) ||
      Math.abs(gap) > model.maximumScoreGap ||
      (model.stageFallbackCenterOnly && candidates[fallbackIndex]?.move.type !== "c2c")) return false;
  const observed = { ...decision, candidates: [candidates[stagedIndex], candidates[fallbackIndex]] };
  const timing = model.useTiming ? getPounceTimingFeatures(observed) : undefined;
  const lanes = model.useLanes ? getPounceVisibleLaneFeatures(observed) : undefined;
  const pair = getActionAdvantageInputs(
    observed.candidates[0].features, observed.candidates[1].features, gap,
    timing && { baseline: timing[0], alternative: timing[1] },
    lanes && { baseline: lanes[0], alternative: lanes[1] }
  );
  const stage = getPounceIncomingStageFeatures(decision, stagedIndex);
  return predictActionAdvantage(model, getPounceStageSuppressionInputs(pair, stage, context)) > model.threshold;
}

export function actionAdvantageHiddenActivations(
  hidden: PounceActionAdvantageHidden,
  inputs: readonly number[]
): number[] {
  return hidden.inputWeights.map((weights, unit) => Math.tanh(
    inputs.reduce((sum, value, index) => sum + value * weights[index], hidden.biases[unit])
  ));
}

export function reviewPounceActionAdvantage(
  decision: Parameters<ActionRankingDecisionReviewer>[0],
  model: PounceActionAdvantageModel,
  allowsMove?: (move: Move) => boolean,
  getReservePotential?: () => readonly number[]
): readonly number[] | undefined {
  const { candidates, scores } = decision;
  if (candidates.length === 0 || model.decisionScope === "incoming-suppress" || model.decisionScope === "proposal") return;
  if (model.decisionScope === "incoming") {
    const original = scores.indexOf(Math.max(...scores));
    const stagedScores = reviewIncomingPremove(decision, "unblock", model.proposalTimingScale ?? 0.65);
    if (!stagedScores) return;
    const staged = stagedScores.indexOf(Math.max(...stagedScores));
    const gap = scores[original] - scores[staged];
    if (staged === original || gap > model.maximumScoreGap) return;
    const [baseline, alternative] = [candidates[original], candidates[staged]];
    const observed = { ...decision, candidates: [baseline, alternative] };
    const timing = model.useTiming ? getPounceTimingFeatures(observed) : undefined;
    const lanes = model.useLanes ? getPounceVisibleLaneFeatures(observed) : undefined;
    const inputs = getActionAdvantageInputs(baseline.features, alternative.features, gap,
      timing && { baseline: timing[0], alternative: timing[1] },
      lanes && { baseline: lanes[0], alternative: lanes[1] });
    return predictActionAdvantage(model, inputs) > model.threshold ? stagedScores : undefined;
  }
  const destination = model.decisionScope === "destination";
  const stock = isPounceStockScope(model.decisionScope);
  const productive = model.decisionScope === "productive" || destination;
  if (stock && (decision.hands[decision.playerIndex]?.item || hasDirectPounceUnload(candidates))) return;
  if (model.decisionScope === "stock-stalled" &&
      !hasEarlyFullTableau(decision.board.players[decision.playerIndex])) return;
  if (!stock && !productive && !candidates.some(({ move }) => move.type === "s2s" || move.type === "c2s")) {
    return;
  }
  const ranked = scores.map((score, index) => ({ score, index }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const incumbent = ranked[0];
  const baseline = candidates[incumbent.index];
  if (stock && model.stockWhenCycling && baseline.move.type !== "cycle") return;
  if (baseline.endsRound || (productive && !isProductiveMove(baseline.move))) return;
  if (destination && (baseline.move.type !== "c2c" || baseline.features[aceIndex] > 0)) return;
  const families = new Set([getPounceMoveFamily(baseline.move)]);
  const equivalents = new Set([baseline.equivalenceKey]);
  let best = incumbent.index;
  let bestGain = model.threshold;
  let considered = 0;
  let timing: number[][] | undefined;
  let lanes: number[][] | undefined;
  let reservePotential: readonly number[] | undefined;
  for (const { score, index } of ranked.slice(1)) {
    const gap = incumbent.score - score;
    if (gap > model.maximumScoreGap || considered >= 3) break;
    const candidate = candidates[index];
    const family = stock ? getPounceStockPairKind(baseline, candidate, allowsMove) : getPounceMoveFamily(candidate.move);
    if (family == null || (!productive && families.has(family)) || (!destination && equivalents.has(candidate.equivalenceKey)) ||
        (destination && !isAlternateCenterDestination(baseline.move, candidate.move)) ||
        (productive && !isProductiveMove(candidate.move)) ||
        (model.useLanes && !allowsVisibleLaneOverride(baseline, candidate)) ||
        (allowsMove && !allowsMove(candidate.move)) ||
        candidate.move.type === "wait" || candidate.move.type === "premove" ||
        candidate.move.type === "flip_deck") {
      continue;
    }
    considered++;
    families.add(family);
    equivalents.add(candidate.equivalenceKey);
    if (model.useTiming) timing ??= getPounceTimingFeatures(decision);
    if (model.useLanes) lanes ??= getPounceVisibleLaneFeatures(decision);
    if (model.useReservePotential) {
      if (!getReservePotential) throw new Error("This stock model needs observed reserve potential");
      reservePotential ??= getReservePotential();
    }
    const gain = predictActionAdvantage(model, getActionAdvantageInputs(
      baseline.features, candidate.features, gap,
      timing && { baseline: timing[incumbent.index], alternative: timing[index] },
      lanes && { baseline: lanes[incumbent.index], alternative: lanes[index] },
      stock, reservePotential
    ));
    if (gain > bestGain) {
      bestGain = gain;
      best = index;
    }
  }
  return best === incumbent.index
    ? undefined : scores.map((score, index) => index === best ? incumbent.score + 1 : score);
}

export function hasDirectPounceUnload(candidates: readonly Pick<ActionRankingCandidate, "move">[]): boolean {
  return candidates.some(({ move }) => unloadsPounce(move));
}

export const EARLY_POUNCE_COUNT = 8;

export function hasEarlyFullTableau(player: Pick<PlayerState, "pounceDeck" | "stacks">): boolean {
  return player.pounceDeck.length >= EARLY_POUNCE_COUNT && player.stacks.every((stack) => stack.length > 0);
}

export function isPounceStockScope(scope: PounceActionAdvantageModel["decisionScope"]): boolean {
  return scope === "stock" || scope === "stock-stalled";
}

export type PounceStockPairKind = "setup-cycle" | "cycle-setup" | "center-cycle" | "cycle-center";

/** Compare a stock advance with a meaningful setup or a center play that feeds pounce. */
export function getPounceStockPairKind(
  incumbent: Pick<ActionRankingCandidate, "move" | "features" | "endsRound">,
  alternative: Pick<ActionRankingCandidate, "move" | "features" | "endsRound">,
  allowsLayout?: (move: Move) => boolean
): PounceStockPairKind | undefined {
  const incumbentCycles = incumbent.move.type === "cycle";
  if (incumbentCycles === (alternative.move.type === "cycle")) return;
  const productive = incumbentCycles ? alternative : incumbent;
  const { move, features } = productive;
  if (productive.endsRound) return;
  if (move.type === "c2c" && features[pounceFeedIndex] > 0) return incumbentCycles ? "cycle-center" : "center-cycle";
  if ((move.type === "c2s" && move.source === "deck" && features[emptyDestinationIndex] === 0) ||
      (move.type === "s2s" && allowsVisibleLaneOverride(incumbent, productive) && (!allowsLayout || allowsLayout(move)))) {
    return incumbentCycles ? "cycle-setup" : "setup-cycle";
  }
}

export function allowsVisibleLaneOverride(
  baseline: Pick<ActionRankingCandidate, "move" | "features">,
  alternative: Pick<ActionRankingCandidate, "move" | "features">
): boolean {
  if (unloadsPounce(baseline.move) && !unloadsPounce(alternative.move)) return false;
  if (alternative.move.type !== "s2s") return true;
  const features = alternative.features;
  const fullStack = features[fullStackIndex] > 0;
  if (fullStack && features[emptyDestinationIndex] > 0) return false;
  return fullStack || features[exposedCenterIndex] > 0 ||
    features[opensPounceIndex] > 0 || features[pounceAccessIndex] > 0;
}

export function createPounceLaneLayoutTracker() {
  const players: ({ context: string; visited: Set<string> } | undefined)[] = [];
  return ({ board, playerIndex }: Parameters<ActionRankingDecisionReviewer>[0]) => {
    const player = board.players[playerIndex];
    const context = [
      player.pounceDeck.length, cardKey(peek(player.pounceDeck)),
      player.deck.length, player.flippedDeck.length, cardKey(peek(player.flippedDeck)),
      ...board.piles.map((pile) => cardKey(peek(pile))),
    ].join("|");
    const previous = players[playerIndex];
    const visited = previous?.context === context ? previous.visited : new Set<string>();
    players[playerIndex] = { context, visited };
    visited.add(layoutKey(player.stacks));
    return (move: Move) => {
      if (move.type !== "s2s") return true;
      const { source, dest, count } = move;
      const after = player.stacks.slice();
      after[source] = player.stacks[source].slice(0, -count);
      after[dest] = player.stacks[dest].concat(player.stacks[source].slice(-count));
      return !visited.has(layoutKey(after));
    };
  };
}

function cardKey(card: CardState | undefined): string {
  return card ? `${card.suit}:${card.value}` : "";
}

function layoutKey(stacks: readonly CardState[][]): string {
  return stacks.map((stack) => stack.map(cardKey).join(",")).join("|");
}

function unloadsPounce(move: Move): boolean {
  return (move.type === "c2c" && move.source.type === "pounce") ||
    (move.type === "c2s" && move.source === "pounce");
}

function isAlternateCenterDestination(baseline: Move, alternative: Move): boolean {
  if (baseline.type !== "c2c" || alternative.type !== "c2c" ||
      baseline.dest === alternative.dest || baseline.source.type !== alternative.source.type) {
    return false;
  }
  return baseline.source.type !== "solitaire" ||
    (alternative.source.type === "solitaire" && baseline.source.index === alternative.source.index);
}

export function getPounceMoveFamily(move: Move): string {
  if (move.type === "c2c") return `c2c:${move.source.type}`;
  if (move.type === "c2s") return `c2s:${move.source}`;
  return move.type;
}
