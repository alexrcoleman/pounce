# Neural Action-Ranking AI

This branch adds an optional neural action-ranking bot for Pounce. The model does
not generate moves directly. Instead, the simulation enumerates legal discrete
actions, builds a feature vector for each candidate, and the model scores/ranks
those candidates.

## Runtime Modes

Room settings expose three AI modes:

- `Fixed AIs`: current deterministic/basic AI behavior. This remains the default.
- `Trained model`: every AI player uses the neural action-ranking policy.
- `Hybrid`: the first AI player uses the neural policy and remaining AI players
  use fixed AIs, which makes side-by-side comparison easier.

The champion model is committed at
`shared/models/pounce-action-ranking-cursor-champion.json` and is loaded by
`shared/NeuralActionRankingBot.ts`. The server can still override it with
`POUNCE_NEURAL_AI_MODEL`.

## Model Shape

Models are JSON-serialized feed-forward MLPs. Version 2 stores:

- `featureNames`: feature names used by the model.
- `hiddenLayerSizes`: default training currently uses `[48]`.
- `layerWeights` / `layerBiases`: tanh hidden layers.
- `outputWeights` / `outputBias`: scalar score for one candidate action.

The policy applies a softmax over candidate scores when it needs action
probabilities. For normal play it takes the highest-scored candidate.

Model loading aligns inputs by feature name. If the build adds new features, old
models keep their learned weights and the new feature weights initialize to zero.
That keeps the committed champion behavior stable until we retrain.

## Action Space

`shared/ActionRankingPolicy.ts` enumerates legal actions from the current board:

- center plays from pounce, deck/waste, or solitaire.
- card-to-solitaire moves.
- solitaire-to-solitaire moves.
- deck cycling / flip-deck.
- wait actions.
- premove actions.

The neural bot asks for wait and premove candidates during play so the model can
learn human-like timing and setup behavior.

## Feature Families

The feature vector is defined by `ACTION_RANKING_FEATURE_NAMES`.

- Move/source/destination: action type, source, destination, moved card count,
  source/destination stack shape, and immediate point delta.
- Card shape: value, color, solitaire parity, pounce parity match, pounce
  connector closeness, center distance, and whether it can play soon.
- Own deck/waste: waste playability, stock/waste fraction, stock lookahead, and
  waste connector signals.
- Own pounce/solitaire: pounce count/value, empty stack count, stack top/next
  playability, stack-bottom connector closeness, and raw per-stack bottom cards.
- Solitaire move nuance: tuck/deck-helpful bits, whether the move exposes useful
  cards, whether source/destination are close to center piles, and post-move
  connector counts.
- Center pressure: whether own/opponent visible cards can play now or soon after
  a center move.
- Opponent pressure: opponent pounce/deck/stack pressure and visible hand
  pressure when cursor state is available.
- Timing/stuck context: heads-up flag, ticks since last move/non-wait move,
  no-visible-center-move context, and closest center-distance advantage.
- Cycle lookahead: what cycling or resetting waste may reveal soon.

The raw solitaire-bottom features are per stack:

- `own.stackNBottomPresent`
- `own.stackNBottomValue`
- `own.stackNBottomSuitHearts`
- `own.stackNBottomSuitSpades`
- `own.stackNBottomSuitDiamonds`
- `own.stackNBottomSuitClubs`
- `own.stackNBottomStackParity`

These give the model the exact visible bottom cards needed to learn or replace
parts of the old `deckMoveHelpful` heuristic.

## `deckMoveHelpful`

`solitaire.deckMoveHelpful` is still present as a hard-coded binary feature. It
is true for a deck-to-solitaire move when the destination solitaire stack top is
within five ranks above, and solitaire-compatible with, either the current pounce
card or one of the player's solitaire stack-bottom cards.

With the raw stack-bottom cards, pounce card features, destination top card
features, and card parity/value features, future models can learn a more nuanced
version of this rule. The current champion was trained before the raw bottom-card
features were added, so those new inputs have zero model weights until retrained.

## Training And Evaluation

Useful scripts:

- `npm run action-ranking:train`: train imitation / improvement / RL variants.
- `npm run action-ranking:tune`: run imitation/improvement tuning sweeps.
- `npm run action-ranking:tune-rl`: run RL fine-tuning sweeps.
- `npm run action-ranking:check-rl-modes`: compare RL mode candidates.
- `npm run action-ranking:tournament`: compare policies in simulated play.
- `ts-node --transpile-only scripts/measureActionRankingFeatureUsage.ts`:
  ablate feature groups and measure how much a model's decisions depend on them.
- `ts-node --transpile-only scripts/probeEndgameActionRanking.ts`: inspect
  targeted endgame behavior.

Important environment knobs include `MODEL_IN`, `MODEL_OUT`, `PLAYERS`,
`HIDDEN_LAYERS`, `IMITATION_DEALS`, `IMPROVEMENT_STATES`, `RL_EPISODES`,
`INCLUDE_WAIT`, `INCLUDE_PREMOVE`, and `SEED`.

## Current Status

The committed champion is useful enough to ship as an optional opponent, but it
should be treated as an iteration point rather than a solved strategy. The best
current use is opt-in comparison against fixed AIs.

Recommended next work:

- Retrain after the raw solitaire-bottom features are in place.
- Re-run feature usage to confirm the model uses bottom-card, timing, hand, and
  opponent-pressure inputs instead of leaning mostly on move-type shortcuts.
- Keep measuring 1v1 and 4-player performance separately.
- Promote only when tournament point differential and win-rate confidence
  intervals both justify the change.
