# Pounce Online

This is a project to simulate the game Nertz / Pounce. It includes some online multiplayer logic to allow for competitive play with friends, as well as some Bots for local or online practice. There is also a "Simulation Mode" to rapidly simulate Bots playing against each other to analyze various strategies.

## Neural action-ranking training

The action-ranking prototype trains a small neural network to score the legal
moves generated from each board state. It first imitates the existing heuristic
bot, then optionally fine-tunes with rollout reward against teacher bots or
neural self-play opponents.

```powershell
npm run action-ranking:examples
npm run action-ranking:train
```

Useful training knobs:

- `IMITATION_DEALS`, `IMITATION_EPOCHS`, `IMITATION_LR`, `IMITATION_EQUIVALENT_TARGETS`
- `IMPROVEMENT_STATES`, `IMPROVEMENT_STATE_SOURCE`, `IMPROVEMENT_STATE_TEMPERATURE`, `IMPROVEMENT_STATE_SAMPLE`, `IMPROVEMENT_MAX_SCORE_GAP`, `IMPROVEMENT_MAX_WINNER_SCORE_GAP`, `IMPROVEMENT_MAX_CANDIDATE_SCORE_GAP`, `IMPROVEMENT_POLICY_CANDIDATES`, `IMPROVEMENT_CANDIDATES`, `IMPROVEMENT_ROLLOUT_MOVES`, `IMPROVEMENT_ROLLOUT_COUNT`, `IMPROVEMENT_COMMON_RANDOM`, `IMPROVEMENT_CONTINUATION`, `IMPROVEMENT_SCORE_WEIGHT`, `IMPROVEMENT_MODE`, `IMPROVEMENT_MIN_RETURN_GAP`, `IMPROVEMENT_MAX_PAIRS`, `IMPROVEMENT_PREFERENCE_TEMPERATURE`, `IMPROVEMENT_PREFERENCE_SCOPE`, `IMPROVEMENT_PAIRWISE_MARGIN`, `IMPROVEMENT_VALUE_SCALE`, `IMPROVEMENT_VALUE_CENTER`, `IMPROVEMENT_VALUE_TARGET_MODE`, `IMPROVEMENT_VALUE_HUBER`, `IMPROVEMENT_REQUIRE_BEHAVIOR_GAP`, `IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT`, `IMPROVEMENT_BEHAVIOR_GAP_SE_MULTIPLIER`, `IMPROVEMENT_EPOCHS`, `IMPROVEMENT_LR`, `IMPROVEMENT_TEMPERATURE`
- `RL_EPISODES`, `RL_LR`, `RL_TEMPERATURE`, `RL_LOCAL_REWARD_WEIGHT`, `RL_LOCAL_REWARD_DISCOUNT`, `RL_OPPONENT_MODE`, `RL_OPPONENT_MODEL`, `RL_BASELINE_MODE`, `RL_COMMON_RANDOM`, `RL_CREDIT_MODE`, `RL_COUNTERFACTUAL_SCAN_EPISODES`, `RL_COUNTERFACTUAL_ROLLOUTS`, `RL_COUNTERFACTUAL_ROLLOUT_MOVES`, `RL_COUNTERFACTUAL_CANDIDATES`, `RL_COUNTERFACTUAL_MIN_RETURN_GAP`, `RL_COUNTERFACTUAL_MAX_RETURN_GAP`, `RL_COUNTERFACTUAL_REQUIRE_BEHAVIOR_GAP`, `RL_COUNTERFACTUAL_MIN_BEHAVIOR_IMPROVEMENT`, `RL_COUNTERFACTUAL_STATE_SOURCE`, `RL_COUNTERFACTUAL_MODE`, `RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER`, `RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE`, `RL_COUNTERFACTUAL_MAX_POLICY_MARGIN`, `RL_COUNTERFACTUAL_REQUIRE_POLICY_CHANGE`, `RL_COUNTERFACTUAL_PREFERENCE_SCOPE`, `RL_COUNTERFACTUAL_PAIRWISE_MARGIN`, `RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_MODE`, `RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_SCALE`, `RL_COUNTERFACTUAL_PAIRWISE_MAX_WEIGHT`, `RL_COUNTERFACTUAL_MAX_SCORE_GAP`, `RL_COUNTERFACTUAL_SCORE_GAP_BUDGET`, `RL_COUNTERFACTUAL_SCORE_WEIGHT`, `RL_COUNTERFACTUAL_POUNCE_WEIGHT`, `RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR`, `RL_COUNTERFACTUAL_SKIP_SOLITAIRE_OVER_USEFUL_CYCLE`, `RL_COUNTERFACTUAL_ANCHOR_WEIGHT`, `RL_COUNTERFACTUAL_ANCHOR_EXAMPLES`, `RL_COUNTERFACTUAL_ANCHOR_TEMPERATURE`, `RL_COUNTERFACTUAL_BEHAVIOR_CORRECTION_WEIGHT`, `RL_COUNTERFACTUAL_BEHAVIOR_CORRECTION_MARGIN`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_WEIGHT`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_EXAMPLES`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MARGIN`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MAX_POLICY_MARGIN`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MODE`, `RL_COUNTERFACTUAL_VALUE_SCALE`, `RL_COUNTERFACTUAL_VALUE_CENTER`, `RL_COUNTERFACTUAL_VALUE_TARGET_MODE`, `RL_COUNTERFACTUAL_VALUE_HUBER`, `RL_UPDATE_EPOCHS`, `RL_UPDATE_SCOPE`, `RL_TRAINABLE_LAYERS`, `RL_NORMALIZE_ADVANTAGES`, `RL_ADVANTAGE_CLIP`
- `PLAYERS`, `HIDDEN`, `HIDDEN_LAYERS`, `MAX_MOVES`, `SEED`
- `HIDDEN` and `HIDDEN_LAYERS` accept comma-separated layer sizes, for example `HIDDEN=192,96`
- `MODEL_OUT=C:\tmp\pounce-action-ranking-model.json` to save model weights
- `MODEL_IN=...\model.json npm run action-ranking:train` to fine-tune saved weights
- `MODEL_IN=...\model.json npm run action-ranking:evaluate` to evaluate saved weights
- `MODEL_IN=...\model.json npm run action-ranking:evaluate-by-style` to evaluate saved weights against each fixed heuristic AI style
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:compare` to compare two models on paired deals/seats
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:compare-self-play` to compare two models sharing the same self-play table
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:diagnose` to compare top-ranked actions on sampled teacher states
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:trace-divergences` to inspect the first policy-action divergence in paired games
- `MODEL_IN=...\best.json npm run action-ranking:audit-labels` to audit rollout labels before training on them
- `MODEL_IN=...\best.json npm run action-ranking:audit-rl-labels` to audit accepted counterfactual RL labels before training on them
- `MODEL_IN=...\best.json npm run action-ranking:tune` to iterate reward fine-tunes and promote only paired-comparison improvements
- `MODEL_IN=...\best.json npm run action-ranking:tune-rl` to sweep counterfactual RL recipes and promote only paired-comparison improvements
- `npm run action-ranking:check-rl-modes` to smoke-test legacy feature expansion and counterfactual RL training mode routing
- `EVAL_RUNS=4` or `EVAL_SEEDS=seedA,seedB` to evaluate saved weights across multiple seeds
- `POUNCE_NEURAL_AI_MODEL=...\model.json npm run dev` to run Socket.IO bots with saved weights

Evaluation output includes same-seat teacher baseline metrics plus behavior
diagnostics such as decision count, center/solitaire/cycle move rates, pounce
remaining, and pounce-out rate. The model loader accepts both the original
single-hidden-layer checkpoint format and the newer multi-layer format. It also
expands older checkpoints onto the current action-feature list with zero weights
for new inputs, preserving existing scores while allowing future fine-tunes to
train newly added tactical features.
The current feature list includes `own.pointDifferential`, so RL fine-tunes can
condition a move on whether the player is ahead or behind, not just on the
player's raw card score.
It also includes post-move solitaire connector features for deck-to-solitaire
and stack-to-stack moves: how many visible own cards could connect below the
new exposed stack top, how close the best connector is, whether that connector
is the pounce card or a stack root, and the stock-vs-waste fraction for
deck-sourced solitaire moves. These are intended to make connector-vs-cycle
updates less dependent on broad move-type priors.
The feature set now also exposes more of the tactical shape a human uses:
source-stack height/bottom/exposed-card information, whether exposed cards can
play or match the pounce card's stack-compatibility parity, destination bottom
value, card parity and pounce-connector closeness, and opponent follow pressure
split by pounce/deck/solitaire visible cards after center plays.
Cycle moves now include a stock-memory proxy: the card that would become visible
after cycling, whether it can play center/solitaire/soon, whether it can connect
to the pounce card, whether the action only resets the waste pile, and the
remaining stock fraction after the cycle. These inputs are meant to let reward
labels explain when cycling is good because a remembered stock card is useful,
rather than pushing every cycle action up globally.
Cycle reset moves also expose the known card that would become visible after
resetting the waste and cycling once, so the policy can learn "reset because I
remember the next pass is useful" instead of treating all waste resets alike.
The global visible-pressure inputs count own and opponent pounce/deck/solitaire
cards that are playable on center now, plus pounce cards close to center play;
those are intended to help reward training learn tempo and opponent-help costs
without encoding a fixed move-type priority.
`action-ranking:compare-self-play` now fills the table with the candidate and
champion models directly instead of using heuristic opponents. By default it
splits seats by parity and replays each deal with the assignments swapped, so a
candidate can be checked for actual neural-vs-neural strength before promotion.

Current useful baseline recipe:

```powershell
$env:HIDDEN='96'
$env:IMITATION_DEALS='240'
$env:IMITATION_EPOCHS='8'
$env:IMPROVEMENT_STATES='0'
$env:RL_EPISODES='0'
$env:MODEL_OUT='.\node_modules\pounce-action-ranking-model.json'
npm run action-ranking:train
```

The strongest imitation-only recipe tried so far has been:

```powershell
$env:HIDDEN='192'
$env:IMITATION_DEALS='240'
$env:IMITATION_EPOCHS='10'
$env:IMPROVEMENT_STATES='0'
$env:RL_EPISODES='0'
$env:MODEL_OUT='.\node_modules\pounce-action-ranking-model.json'
npm run action-ranking:train
```

On a 768-game / 8-seed evaluation, that checkpoint was effectively even with the
same-seat heuristic baseline: `-0.002 +/- 0.287` baseline-adjusted point
differential. The neural player's raw score was slightly higher than teacher
opponents on average (`7.09` vs `6.93`), with a `25.0%` solo win rate.

The best reward fine-tune point estimate so far starts from that checkpoint and
uses a small, gap-filtered pairwise counterfactual rollout pass:

```powershell
$env:MODEL_IN='.\node_modules\pounce-action-ranking-capacity-model.json'
$env:IMITATION_DEALS='0'
$env:IMPROVEMENT_STATES='80'
$env:IMPROVEMENT_STATE_SOURCE='teacher'
$env:IMPROVEMENT_CANDIDATES='8'
$env:IMPROVEMENT_ROLLOUT_MOVES='450'
$env:IMPROVEMENT_ROLLOUT_COUNT='1'
$env:IMPROVEMENT_COMMON_RANDOM='true'
$env:IMPROVEMENT_MODE='pairwise'
$env:IMPROVEMENT_MIN_RETURN_GAP='2'
$env:IMPROVEMENT_MAX_PAIRS='8'
$env:IMPROVEMENT_PREFERENCE_TEMPERATURE='1'
$env:IMPROVEMENT_EPOCHS='1'
$env:IMPROVEMENT_LR='0.0005'
$env:RL_EPISODES='0'
$env:MODEL_OUT='.\node_modules\pounce-action-ranking-pairwise-gap2-lr5-model.json'
npm run action-ranking:train
```

On the same 768-game / 8-seed evaluation, that fine-tuned checkpoint measured
`+0.138 +/- 0.321` baseline-adjusted point differential, with raw score `7.23`
vs `6.93` and a `25.0%` solo win rate. Treat that as directionally interesting,
not proven: the error bars still overlap zero.

A paired model-vs-model comparison on the same deals/seats is stricter. Comparing
that pairwise fine-tune directly against its imitation checkpoint measured
`-0.026 +/- 0.061` point differential delta for the fine-tune, with tied point
differential in `95.6%` of games. That means the reward fine-tune is not yet a
proven replacement for the imitation checkpoint; use `action-ranking:compare`
before promoting a candidate model.

For strategy debugging, `action-ranking:diagnose` compares two model checkpoints
on the same sampled teacher-game decision states and reports top-action
agreement, teacher-action agreement, score drift, top-score margins, move-type
deltas, feature deltas, and a few concrete disagreements. `DIAG_DEALS`,
`DIAG_MAX_EXAMPLES`, `DIAG_MAX_DISAGREEMENTS`, and `DIAG_TOP_FEATURES` control
the sample size and output detail. `DIAG_STATE_SOURCE=teacher` is the default;
`modelA` or `modelB` instead samples states reached by that checkpoint's greedy
trajectory, which is useful when paired comparison changes occur outside the
teacher state distribution. This is useful for seeing whether a candidate is
actually changing center-vs-solitaire choices, pounce-card urgency, connector
behavior, or opponent-helping center plays before spending time on a large
paired rollout.
`action-ranking:trace-divergences` replays paired games until the first policy
split and reports both broad top feature deltas and a focused feature set for
connector/cycle debugging. `TRACE_FOCUS_FEATURES` accepts a comma-separated list
of feature names when a different tactical slice needs to be inspected.

`action-ranking:audit-labels` runs the same reward-improvement label collector
without updating the model. It reports which move-type pairs the rollouts prefer,
how often the rollout winner matches the current policy, teacher, or behavior
move, how large the return gaps are, and where immediate point reward disagrees
with the longer rollout value. The audit uses `LABEL_*` equivalents of the
improvement rollout knobs: `LABEL_STATES`, `LABEL_STATE_SOURCE`,
`LABEL_MAX_SCORE_GAP`, `LABEL_MAX_WINNER_SCORE_GAP`,
`LABEL_MAX_CANDIDATE_SCORE_GAP`, `LABEL_POLICY_CANDIDATES`,
`LABEL_CANDIDATES`, `LABEL_ROLLOUT_MOVES`, `LABEL_ROLLOUT_COUNT`,
`LABEL_CONTINUATION`, `LABEL_REQUIRE_BEHAVIOR_GAP`,
`LABEL_MIN_BEHAVIOR_IMPROVEMENT`, `LABEL_BEHAVIOR_GAP_SE_MULTIPLIER`, and
`LABEL_SCORE_WEIGHT`, and `LABEL_MIN_RETURN_GAP`.
`action-ranking:audit-rl-labels` audits the accepted counterfactual RL labels
for a model without updating it. It uses the `RL_COUNTERFACTUAL_*` knobs and
reports skip counts, winner-vs-behavior move-type pairs, rollout return gaps,
pounce-progress gaps, policy score gaps, state-context bins by move pair, and
sample candidate return tables.
`RL_AUDIT_EPISODES`, `RL_AUDIT_FOCUS_PAIR`, `RL_AUDIT_MAX_EXAMPLES`, and
`RL_AUDIT_SAMPLE_CANDIDATES` control audit size and output detail.

The best policy-state reward candidate so far uses targeted behavior-gap
examples and a behavior-only pairwise update:

```powershell
$env:MODEL_IN='.\node_modules\pounce-action-ranking-capacity-model.json'
$env:IMITATION_DEALS='0'
$env:IMPROVEMENT_STATES='240'
$env:IMPROVEMENT_STATE_SOURCE='policy'
$env:IMPROVEMENT_STATE_SAMPLE='true'
$env:IMPROVEMENT_STATE_TEMPERATURE='0.9'
$env:IMPROVEMENT_CANDIDATES='8'
$env:IMPROVEMENT_ROLLOUT_MOVES='450'
$env:IMPROVEMENT_ROLLOUT_COUNT='1'
$env:IMPROVEMENT_COMMON_RANDOM='true'
$env:IMPROVEMENT_MODE='pairwise'
$env:IMPROVEMENT_PREFERENCE_SCOPE='behavior'
$env:IMPROVEMENT_MIN_RETURN_GAP='2'
$env:IMPROVEMENT_REQUIRE_BEHAVIOR_GAP='true'
$env:IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT='2'
$env:IMPROVEMENT_EPOCHS='1'
$env:IMPROVEMENT_LR='0.0001'
$env:RL_EPISODES='0'
$env:MODEL_OUT='.\node_modules\pounce-action-ranking-behavior-scope-240-lr1-model.json'
npm run action-ranking:train
```

Against the imitation checkpoint, that candidate measured `+0.067 +/- 0.028`
point differential delta over a 1,536-game / 16-seed paired comparison, with
`97.3%` tied point differentials, `+0.048` average score delta, and a `+0.46`
percentage-point pounce-out delta. Treat it as the current best experimental
direction rather than a fully proven replacement; the effect is real enough to
keep exploring but still quite small.
The style-specific evaluator now measures the same neural seat against fixed
heuristic opponents and a same-seat all-heuristic baseline. A first
`pounce-action-ranking-behavior-scope-240-lr1` pass over 48 games x 4 seeds per
style measured baseline-adjusted point differential of `+0.384` vs Mom,
`+0.668` vs Alex-v2, `+0.174` vs Alex 75%, `+1.288` vs Alex 66%, and `-1.253`
vs Alex 1.0. That suggests the current neural policy has mostly learned and
slightly smoothed the rotating teacher population, while Alex 1.0 remains the
clearest fixed-style antagonist for future self-play/champion training.

For iterative improvement, `action-ranking:tune` repeatedly trains from the
current best model, runs paired comparison against that current best, and only
promotes when `averagePointDifferentialDelta - PROMOTE_SE_MULTIPLIER * standardError`
is greater than `PROMOTE_MIN_DELTA`. Defaults are intentionally conservative:
`PROMOTE_MIN_DELTA=0`, `PROMOTE_SE_MULTIPLIER=1`.

`action-ranking:tune-rl` runs the same promote-only loop across several
counterfactual RL recipes from the current best model. The default recipe set
tries exploratory broad pairwise with `behavior` scope, exploratory broad
pairwise with `all` scope, and exploratory broad value regression. Use
`RL_TUNE_RECIPES` as a JSON array of `{ "name": string, "options": { ... } }`
to sweep custom recipe knobs while inheriting conservative RL defaults.
`RL_TUNE_ROUNDS`, `RL_TUNE_OUT_DIR`, `COMPARE_GAMES`, and `COMPARE_RUNS` control
the search budget and verification strength. Set `RL_TUNE_DIAG_GAMES` above `0`
to include compact policy-state divergence diagnostics for each recipe; this
reports whether the candidate changes deployed greedy decisions on modelA/modelB
trajectories, not just held-out teacher states. `RL_TUNE_DIAG_MAX_EXAMPLES`
caps that diagnostic sample. Set `CONFIRM_GAMES` above `0` to run a held-out
confirmation comparison for search-passing candidates and near-misses whose
search lower bound is at least `CONFIRM_TRIGGER_MIN_DELTA`; `CONFIRM_RUNS`,
`CONFIRM_MIN_DELTA`, and `CONFIRM_SE_MULTIPLIER` control that second gate. As
an optional fixed-style safety gate, set `RL_TUNE_STYLE_GAMES` above `0`; passing
candidates are then compared against the current best on the fixed heuristic
styles using shared seeds. Promotion also requires the style lower bound
`averageBaselineAdjustedPointDifferentialDelta - seMultiplier * standardError`
to be at least `-RL_TUNE_STYLE_MAX_REGRESSION`, where `seMultiplier` comes from
`RL_TUNE_STYLE_SE_MULTIPLIER`. `RL_TUNE_STYLES` can narrow the gate to a
comma-separated subset such as `Alex 1.0`. Set `RL_TUNE_SELF_PLAY_GAMES` above
`0` to add a champion self-play gate. That
gate puts the candidate and current best at the same table, swaps seat parity by
default, and requires the lower-bound point-differential delta to stay above
`-RL_TUNE_SELF_PLAY_MAX_REGRESSION`. `RL_TUNE_SELF_PLAY_RUNS`,
`RL_TUNE_SELF_PLAY_SE_MULTIPLIER`, and `RL_TUNE_SELF_PLAY_SWAP_SEATS` tune the
self-play gate budget and strictness. This is still a search tool; a promoted
model still needs a larger final paired comparison before replacing the current
best checkpoint.

`IMPROVEMENT_STATES` enables the counterfactual rollout pass: it samples
teacher-game states, tries several legal actions, lets the teacher finish from
each candidate, and trains from the resulting soft reward targets. By default,
candidate actions in the same state now share continuation randomness; increasing
`IMPROVEMENT_ROLLOUT_COUNT` averages multiple continuations per candidate.
`IMPROVEMENT_CONTINUATION=policy` uses the current neural policy for the active
player after the initial counterfactual move, while teachers continue to play
the other seats; the default `teacher` continuation is useful for learning from
teacher-completed rollouts but can mismatch the deployed policy.
`IMPROVEMENT_STATE_SOURCE=policy` instead collects examples only from states
reached by the current neural policy in one rotating seat while teacher bots play
the other seats, which is useful for fine-tuning where the model actually acts.
`IMPROVEMENT_REQUIRE_BEHAVIOR_GAP=true` keeps only rollout states where the best
counterfactual action beats the behavior action by at least
`IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT` on the rollout objective. With the default
score weight, that objective is point differential. This targeted mode is most
useful with policy-sourced states because it avoids training on decisions where
the current greedy or sampled behavior is already tied with the best rollout
candidate.
`IMPROVEMENT_SCORE_WEIGHT` optionally blends raw scoring into the rollout
objective used for labels and value targets:
`pointDifferentialReturn + weight * scoreReturn`. The default `0` preserves the
existing point-differential objective. Positive values can test whether a local
score component avoids labels that tie differential while quietly reducing the
neural player's own score; audit output still reports objective return, point
differential return, and score return separately.
When `IMPROVEMENT_ROLLOUT_COUNT` is greater than `1`,
`IMPROVEMENT_BEHAVIOR_GAP_SE_MULTIPLIER` can make that filter confidence-aware:
the accepted lower bound is `mean gap - multiplier * standard error`, using
paired continuation seeds when common randomness is enabled. This helps avoid
training from high-variance labels whose apparent advantage may be rollout noise.
`IMPROVEMENT_MAX_SCORE_GAP` filters policy-sourced states to decisions where the
current model's top two candidate scores are close enough to plausibly move, and
`IMPROVEMENT_POLICY_CANDIDATES` forces the top-ranked policy alternatives into
the counterfactual candidate set. Together these mine labels from the decisions
the model is actually choosing between instead of mostly random alternatives.
`IMPROVEMENT_MAX_WINNER_SCORE_GAP` adds a stricter post-rollout filter: if the
rollout winner is still too far below the current policy top action, the label is
skipped instead of forcing a large reversal from a single noisy counterfactual.
`IMPROVEMENT_MAX_CANDIDATE_SCORE_GAP` applies the policy-score support filter
before rollouts, keeping behavior/teacher actions plus only candidates within
that many score units of the current policy top action. That avoids spending
rollouts on random, far-off-policy alternatives that are unlikely to become
deployed greedy actions.
Early 80-state policy-source pairwise runs changed more relevant decisions but
still did not beat the imitation checkpoint in paired comparison.
`IMPROVEMENT_MODE=pairwise` trains only clear rollout-return preferences, using
`IMPROVEMENT_MIN_RETURN_GAP` and `IMPROVEMENT_MAX_PAIRS` to ignore low-signal
candidate differences. `IMPROVEMENT_PREFERENCE_SCOPE=behavior` narrows pairwise
updates to the best rollout action versus the recorded behavior action, which is
useful when policy-state examples are meant to correct the model's own decisions
instead of reshaping every candidate comparison in the state. Larger or more
aggressive improvement passes have overcorrected in early tests.
`IMPROVEMENT_PAIRWISE_MARGIN` adds an explicit target score margin to pairwise
training, so high-confidence preferences can keep pushing until the rollout
winner is not merely above the loser but separated by that margin.
`IMPROVEMENT_MODE=value` instead treats each candidate's rollout point
differential as an action-value target and regresses the policy score toward it.
Targets are centered per state by default, then divided by
`IMPROVEMENT_VALUE_SCALE`; `IMPROVEMENT_VALUE_HUBER` can clip large regression
errors. `IMPROVEMENT_VALUE_TARGET_MODE=residual` keeps the current policy score
as a fixed baseline and regresses only a centered rollout-value delta on top of
it; that preserves the imitation logit scale better than the default `absolute`
mode when fine-tuning a strong checkpoint. This Q-style mode is useful for
testing whether the network can learn relative action values without converting
every state into hard pairwise labels.

RL fine-tuning is wired in with batch-normalized, clipped advantages and optional
discounted local reward-to-go. `RL_BASELINE_MODE=teacher` compares sampled policy
rollouts against a same-seat teacher-only rollout. `RL_BASELINE_MODE=greedy`
instead compares against the current greedy neural policy on the same deal/seat,
which is usually the better signal when fine-tuning an already useful checkpoint.
`RL_COMMON_RANDOM=true` shares timing randomness between baseline and sampled
rollouts while keeping policy sampling on a separate random stream; that reduces
variance from turn-order jitter. `RL_UPDATE_EPOCHS` can replay the sampled policy
gradient batch, but values above `1` should be treated carefully because the
updates are off-policy after the first pass. `RL_UPDATE_SCOPE=exploratory`
updates only sampled decisions that differed from the current greedy action at
that state, which is usually cleaner with `RL_BASELINE_MODE=greedy` because it
targets the exploration choices that made the sampled rollout differ from the
deployed policy. In a 128-episode exploratory run from the current best
behavior-scope checkpoint, only about `3.8` of `53.4` sampled decisions per game
were exploratory updates, which is a useful diagnostic for whether RL is
actually moving the deployed greedy policy.
`RL_OPPONENT_MODE=self` switches the sampled rollout to neural-vs-neural play:
all active seats use the current policy, transitions are captured for every
neural seat, and each transition is credited against that acting player's own
final point differential. The default `teacher` mode keeps the older
one-neural-seat setup with heuristic opponents. Self-play mode works with
episode policy-gradient updates and with counterfactual labels; counterfactual
continuations also use all neural seats in self-play mode.
`RL_OPPONENT_MODE=champion` trains one rotating learner seat against frozen
neural opponents. In `action-ranking:train`, the frozen opponent comes from
`RL_OPPONENT_MODEL` when set, otherwise from `MODEL_IN`; in `action-ranking:tune-rl`,
the frozen opponent defaults to the current best checkpoint for that round. This
mode is useful for candidate-vs-champion improvement runs because opponent
decisions are neural but not sampled or trained.
`RL_TRAINABLE_LAYERS=output` freezes the imitation-trained hidden layers during
RL updates and trains only the final scoring layer. The default `all` preserves
the older behavior. Output-only updates are a conservative test for whether
small counterfactual batches can adjust the policy head without distorting the
representation learned from imitation.
`RL_CREDIT_MODE=counterfactual` goes one step further: for sampled decisions that
are eligible for update, it snapshots the board before the move and rolls out
both the sampled action and the greedy action with shared continuation
randomness. The policy-gradient advantage is then the sampled action's
counterfactual point-differential return minus the greedy action's return, gated
by `RL_COUNTERFACTUAL_MIN_RETURN_GAP`. This is slower, but it attacks the main
credit-assignment problem from episode-level REINFORCE: a good or bad final score
usually cannot be attributed to every sampled decision in the game.
`RL_COUNTERFACTUAL_MODE=pairwise` trains counterfactual labels as direct
pairwise preferences instead of a listwise policy-gradient update. By default
the counterfactual rollout compares the sampled action and the greedy action;
setting `RL_COUNTERFACTUAL_CANDIDATES` above `2` also evaluates top-ranked
policy alternatives for supervised `pairwise` and `value` modes.
`RL_COUNTERFACTUAL_SCAN_EPISODES` can be set above `RL_EPISODES` for supervised
counterfactual modes to mine extra policy states for labels while leaving the
reported full-episode RL metrics tied to `RL_EPISODES`. This is useful when
low-margin behavior-correction states are rare and the bottleneck is finding
enough deployable labels rather than training harder on the same tiny batch.
`RL_COUNTERFACTUAL_STATE_SOURCE=greedy` switches supervised counterfactual
`pairwise` and `value` modes from sampled exploratory decisions to states
reached by the deployed greedy policy, bypassing `RL_UPDATE_SCOPE=exploratory`
for those labels. The default `sampled` keeps the older behavior. Policy-gradient
counterfactual updates still use sampled decisions because their advantage is
defined as sampled action return minus greedy action return.
`RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER` makes counterfactual gap filtering
confidence-aware when `RL_COUNTERFACTUAL_ROLLOUTS` is above `1`: the accepted
gap is the mean selected-vs-greedy gap for policy-gradient mode, or the mean
best-vs-worst candidate gap for supervised modes, minus this multiplier times
the paired standard error across rollout seeds. The default `0` preserves the
older mean-gap behavior.
`RL_COUNTERFACTUAL_MAX_RETURN_GAP` skips counterfactual labels whose accepted
objective gap is above the configured cap. This is mainly a guardrail for tiny
supervised batches where one high-impact rollout outlier can generalize into
several deployed greedy-policy reversals. The default `0` disables the cap.
`RL_COUNTERFACTUAL_REQUIRE_BEHAVIOR_GAP=true` adds a stricter supervised
counterfactual gate: the rollout winner must beat the current greedy behavior
action by at least `RL_COUNTERFACTUAL_MIN_BEHAVIOR_IMPROVEMENT`. This uses the
same `RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER` confidence lower bound when multiple
rollouts are available. It is useful when broad best-vs-worst labels are mostly
replaying decisions the policy already makes, rather than correcting deployed
greedy behavior.
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE` adds an agreement gate for supervised
counterfactual labels. With multiple paired rollouts, the rollout winner must
beat the greedy behavior action in at least this fraction of paired
continuations. The default `0` disables the gate; `1` requires unanimous
winner-over-behavior continuations.
`RL_COUNTERFACTUAL_MAX_POLICY_MARGIN` skips counterfactual rollout collection
when the current policy's top action is already ahead of the second-best action
by more than the configured score margin. This is mainly for greedy-state
supervised runs, where low-margin states are more likely to produce deployable
top-action changes than already-settled decisions.
`RL_COUNTERFACTUAL_REQUIRE_POLICY_CHANGE=true` keeps only supervised
counterfactual labels whose rollout winner differs from the current greedy top
action. Pair it with `RL_COUNTERFACTUAL_MAX_SCORE_GAP` to mine labels that are
both behavior-correcting and close enough in policy score to plausibly flip the
deployed greedy action.
`RL_COUNTERFACTUAL_BEHAVIOR_CORRECTION_WEIGHT` adds an auxiliary pairwise update
after supervised value or pairwise training: the accepted rollout winner is
trained directly over the current greedy behavior action with
`RL_COUNTERFACTUAL_BEHAVIOR_CORRECTION_MARGIN`. This is meant for filtered
deployable-label runs where value regression alone changes scores but rarely
changes the top action.
`RL_COUNTERFACTUAL_PREFERENCE_SCOPE=behavior` narrows pairwise labels to the
best rollout candidate versus the current greedy behavior action; the default
`all` trains the clearest candidate pair in each state.
`RL_COUNTERFACTUAL_PAIRWISE_MARGIN` applies the same explicit margin to
counterfactual pairwise labels, which is useful for testing whether RL labels are
strong enough to actually change the deployed greedy action instead of only
nudging scores.
`RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_MODE=return_gap` scales supervised pairwise
RL update strength by `returnGap / RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_SCALE`,
capped by `RL_COUNTERFACTUAL_PAIRWISE_MAX_WEIGHT`. The default `uniform` keeps
the previous fixed-strength behavior. Return-gap weighting is useful when a
small accepted label batch should still learn high-signal corrections without
letting near-threshold rollout gaps move the deployed policy as hard as clear
wins.
`RL_COUNTERFACTUAL_MAX_SCORE_GAP` can skip supervised counterfactual labels when
the rollout winner is currently below the greedy action by more than that score
gap. This targets uncertain decisions first and avoids asking a small batch of
rollout labels to overturn strong existing priors.
`RL_COUNTERFACTUAL_SCORE_GAP_BUDGET` is an alternative to that hard cutoff for
supervised counterfactual modes: when set above `0`, labels that pass the other
filters are sorted by the rollout winner's current score gap behind greedy, then
only the closest N are trained. This keeps the deployed-label miner focused on
near-margin behavior changes without starving the run when a fixed score-gap cap
is too narrow for the current checkpoint.
`RL_COUNTERFACTUAL_SCORE_WEIGHT` optionally blends final personal score into
per-decision counterfactual returns:
`pointDifferentialReturn + weight * scoreReturn`. The default `0` preserves the
existing point-differential objective. Positive values apply to counterfactual
policy-gradient advantages, pairwise preferences, and value targets while still
recording point-differential and score returns separately on supervised examples.
`RL_COUNTERFACTUAL_POUNCE_WEIGHT` optionally rewards reducing the player's
pounce deck during the counterfactual continuation:
`pointDifferentialReturn + scoreWeight * scoreReturn + pounceWeight *
pounceProgressReturn`, where pounce progress is the starting pounce count minus
the final pounce count. The default `0` preserves the existing objective.
`RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR=true` skips supervised labels where
the rollout winner is cycling while an evaluated card-to-solitaire move has an
active post-move connector feature. This is a targeted guardrail for the observed
failure mode where a small counterfactual batch teaches broad `cycle > c2s`
changes against live connector moves. It is disabled by default.
`RL_COUNTERFACTUAL_SKIP_SOLITAIRE_OVER_USEFUL_CYCLE=true` skips the mirror
failure mode: supervised labels where the rollout winner is a solitaire move
while an evaluated cycle action would reveal a useful stock card. A cycle reveal
counts as useful when the revealed card can play center immediately, or can play
soon while also connecting to the player's pounce/solitaire shape. This is
disabled by default and is intended for self-play recipes that otherwise
over-learn `c2s > cycle` from a tiny accepted label batch.
`RL_COUNTERFACTUAL_ANCHOR_WEIGHT` enables conservative policy anchoring for
supervised counterfactual modes: after applying the RL labels, it distills the
pre-update policy over sampled decision states so narrow counterfactual lessons
are less likely to generalize into broad connector or cycling regressions.
`RL_COUNTERFACTUAL_ANCHOR_EXAMPLES` caps that replay batch, and
`RL_COUNTERFACTUAL_ANCHOR_TEMPERATURE` controls the anchor target softness.
`RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_WEIGHT` adds a narrower supervised anchor
for cases where the pre-update policy scores a deck-to-solitaire connector
above cycling. It creates explicit connector-vs-cycle pairwise replay examples
instead of replaying the whole action distribution.
`RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_EXAMPLES` caps that batch,
`RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MARGIN` sets the pairwise target margin,
and `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MAX_POLICY_MARGIN` optionally keeps
only near-tie connector-over-cycle priors. Set
`RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MODE=symmetric` to preserve whichever
connector-or-cycle action the pre-update policy scored higher; the default
`connector` mode preserves the original connector-over-cycle guardrail only.
`RL_COUNTERFACTUAL_MODE=value` uses the same counterfactual returns as
action-value regression targets. The value target scale, centering, and Huber
clipping are controlled by
`RL_COUNTERFACTUAL_VALUE_SCALE`, `RL_COUNTERFACTUAL_VALUE_CENTER`,
`RL_COUNTERFACTUAL_VALUE_TARGET_MODE`, and `RL_COUNTERFACTUAL_VALUE_HUBER`.

RL runs tested so far have not beaten the reward-tuned checkpoint. A small
64-episode greedy-baseline run with `RL_LR=0.00005` preserved the greedy policy
exactly in paired comparison. A stronger all-decision run
(`RL_LR=0.0005`, `RL_UPDATE_EPOCHS=2`) changed behavior but measured
`-0.017 +/- 0.053` against the behavior-scope checkpoint over 384 paired games.
A stronger exploratory-only run (`RL_LR=0.005`, `RL_UPDATE_EPOCHS=2`) changed
more decisions but measured `-0.068 +/- 0.076` over 384 paired games. The next
RL work should improve credit assignment, not merely increase learning rate.

The first per-decision counterfactual RL runs improved the learning signal but
still did not improve the deployed greedy policy. A 64-episode counterfactual
policy-gradient run produced 247 exploratory selected-vs-greedy updates with
average absolute return gap `0.62` and measured `-0.002 +/- 0.096` over 384
paired games. A 128-episode lower-LR version measured `-0.033 +/- 0.060`.
Filtering to gaps of at least `1` reduced the run to 57 updates with average gap
`5.48` and measured `-0.022 +/- 0.064`. Pairwise selected-vs-greedy training on
the same counterfactual labels was too sharp at this data scale: a 64-episode
run created 23 high-gap preferences and measured `-0.081 +/- 0.056`.

The first value-regression runs are wired in but have not produced a better
deployed greedy policy yet. A 240-state behavior-gap value pass from the capacity
checkpoint measured `+0.039 +/- 0.123` against capacity over 384 paired games.
The same value pass on top of the current behavior-scope checkpoint measured
`-0.002 +/- 0.045` against that checkpoint. A 64-episode
`RL_COUNTERFACTUAL_MODE=value` run from the behavior-scope checkpoint produced
247 counterfactual decision examples, 494 candidate-value updates, and measured
`-0.036 +/- 0.036`. The main open RL problem is now collecting enough stable
per-decision counterfactual labels and calibrating action-value targets without
washing out the useful imitation and behavior-gap rankings.

Broader per-decision counterfactual labels are also wired in with
`RL_COUNTERFACTUAL_CANDIDATES`. With `RL_COUNTERFACTUAL_CANDIDATES=5`, a
64-episode value-regression run evaluated `4.55` candidates per accepted
decision on average, trained 1,125 candidate-value updates from 247 decision
states, and measured `-0.039 +/- 0.045` against the behavior-scope checkpoint.
The analogous broad pairwise run filtered to 60 high-gap decision states with
average candidate return spread `8.06`, trained one clearest pair from each, and
measured `-0.007 +/- 0.007`. Using
`RL_COUNTERFACTUAL_PREFERENCE_SCOPE=behavior` narrowed that to 24 best-vs-greedy
pairs but measured the same `-0.007 +/- 0.007`. Applying broad counterfactual
labels to all decisions rather than exploratory decisions was worse at this data
scale: a 16-episode value run measured `-0.102 +/- 0.065`, and a 16-episode
pairwise run measured `-0.086 +/- 0.053`. This is a better diagnostic path, but
still not a better deployed policy.

The first `action-ranking:tune-rl` sweeps also produced no promotion-worthy RL
candidate. The default 64-episode recipe set did not beat the current
behavior-scope checkpoint. A custom low-LR behavior-scope pairwise sweep had one
near-miss at `+0.149 +/- 0.149` over 96 search games, but a larger 768-game
held-out paired comparison was an exact tie on point differential, score, and
behavior metrics. A follow-up diagnostic over 2,000 sampled teacher-state
decisions found 100% top-action agreement between that candidate and the
behavior-scope checkpoint, so treat the search bump as noise or an update too
small to affect greedy play, not as an RL improvement.
Adding an explicit pairwise target margin made stronger counterfactual updates
large enough to alter greedy choices. A 64-episode behavior-scope run with
`RL_COUNTERFACTUAL_PAIRWISE_MARGIN=1`, `RL_LR=0.001`, and
`RL_UPDATE_EPOCHS=5` changed `0.35%` of 2,000 sampled teacher-state decisions,
mostly cycling instead of deck-to-solitaire moves. It measured
`+0.020 +/- 0.108` over 768 paired games, so the margin mechanism is useful for
crossing decision boundaries but is not yet a better checkpoint.
Reducing label noise did not solve that by itself: a 32-episode version with
`RL_COUNTERFACTUAL_ROLLOUTS=3` changed only one of 2,000 sampled decisions and
measured `+0.009 +/- 0.109` over 384 paired games. Extending the counterfactual
horizon to `RL_COUNTERFACTUAL_ROLLOUT_MOVES=1800` also changed one sampled
decision, still cycle-over-connector, and measured `-0.011 +/- 0.093`. The next
RL direction should improve state/label targeting or add regularization that
preserves useful connector priors while applying counterfactual corrections.
Policy anchoring and score-gap filtering are now wired in to test that more
conservative path. Anchoring with `RL_COUNTERFACTUAL_ANCHOR_WEIGHT=0.25` reduced
the broad margin run from 7 to 3 changed decisions in the 2,000-state
diagnostic, but those changes were still cycle-over-connector and measured
`-0.029 +/- 0.047` over 384 paired games. Filtering labels with
`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5` prevented the bad connector flips at the
original learning rate; raising `RL_LR` to `0.005` produced 2 changed decisions,
both deck-to-solitaire over cycle, but still measured `-0.026 +/- 0.055`.
These controls reduce harmful generalization, but they have not found a better
checkpoint yet.
Score-weighted counterfactual RL is also wired in. A 64-episode broad value run
from the behavior-scope checkpoint with `RL_COUNTERFACTUAL_SCORE_WEIGHT=0.5`,
`RL_COUNTERFACTUAL_CANDIDATES=5`, `RL_COUNTERFACTUAL_VALUE_SCALE=8`,
`RL_COUNTERFACTUAL_VALUE_HUBER=2`, and `RL_LR=0.00005` collected 247
counterfactual decision examples and 1,125 value updates, but preserved 100%
diagnostic top-action agreement and measured `-0.046 +/- 0.020` point
differential with `-0.055` raw score over 384 paired games. Switching the same
recipe to `RL_COUNTERFACTUAL_VALUE_TARGET_MODE=residual` kept the update almost
perfectly anchored, tied raw score, and measured `-0.0069 +/- 0.0069`. That
makes score-weighted counterfactual returns usable, but still not sufficient to
produce a better deployed greedy policy at this budget. The policy-state
diagnostic explains the tiny residual comparison drift: on the same compare seed,
`DIAG_STATE_SOURCE=modelA` found one near-tie `cycle>c2s` flip among 11,123
sampled decisions, while `modelB` states had zero flips. The non-residual value
run showed 5-6 flips over the same policy-state diagnostic, matching its larger
paired-play regression.
An `action-ranking:tune-rl` sweep with policy-state diagnostics tested stronger
residual score-weighted value updates and a conservative anchored pairwise
recipe. The best search result was the pairwise recipe
(`RL_COUNTERFACTUAL_SCORE_WEIGHT=0.5`, `RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5`,
`RL_COUNTERFACTUAL_ANCHOR_WEIGHT=0.25`,
`RL_COUNTERFACTUAL_PAIRWISE_MARGIN=1`, `RL_LR=0.001`,
`RL_UPDATE_EPOCHS=5`), which measured `+0.130 +/- 0.127` over 192 search games
with 2-4 policy-state flips per roughly 5,300 sampled deployment decisions. A
larger 1,536-game paired comparison rejected it as a promotion candidate:
`-0.012 +/- 0.021` point differential and `-0.039` raw score. The strongest
residual value near-miss (`RL_COUNTERFACTUAL_SCORE_WEIGHT=0.25`,
`RL_LR=0.0002`, `RL_UPDATE_EPOCHS=2`) similarly shrank from
`+0.050 +/- 0.050` over 192 search games to `-0.009 +/- 0.010` over 1,536
games, with `-0.019` raw score. These recipes are useful diagnostics for tiny
decision-boundary movement, but not improved checkpoints.

Greedy-state counterfactual collection is also wired in with
`RL_COUNTERFACTUAL_STATE_SOURCE=greedy`. This trains supervised counterfactual
labels on states reached by the deployed greedy policy instead of only sampled
exploration states. A conservative 64-episode residual-value run from the
behavior-scope checkpoint collected 1,601 accepted counterfactual states and
4,919 value updates, but measured `-0.016 +/- 0.010` point differential and
`-0.021` raw score over 768 paired games. Increasing `RL_LR` to `0.0002`
produced one near-tie top-action flip in 3,408 deployed-policy diagnostic states
and measured `-0.024 +/- 0.001`. A stronger anchored pairwise run
(`RL_COUNTERFACTUAL_PAIRWISE_MARGIN=1`,
`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5`,
`RL_COUNTERFACTUAL_ANCHOR_WEIGHT=0.25`, `RL_LR=0.001`,
`RL_UPDATE_EPOCHS=5`) accepted 686 counterfactual states, skipped 609 labels
by score gap, applied 2,560 anchor updates, and measured `-0.095 +/- 0.020`.
The greedy-state source is a useful diagnostic because it greatly densifies
labels on deployed states, but the first tested recipes still point slightly
away from the current best policy.
Counterfactual gap confidence filtering is now available with
`RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER`. A 48-episode greedy-state residual-value
run with `RL_COUNTERFACTUAL_ROLLOUTS=3`,
`RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER=1`, and `RL_LR=0.0001` accepted 604
labels, skipped 497 unstable gaps, and applied 1,990 value updates. It measured
`-0.008 +/- 0.018` point differential and `-0.012` raw score over 768 paired
games, with zero top-action disagreements across 3,406 deployed-policy
diagnostic states. That is not an improved checkpoint, but it is the cleanest
greedy-state RL result so far and suggests variance-aware filtering is worth
keeping for larger or more targeted runs.
Low-margin counterfactual state targeting is available with
`RL_COUNTERFACTUAL_MAX_POLICY_MARGIN`. A 64-episode greedy-state residual-value
run with `RL_COUNTERFACTUAL_MAX_POLICY_MARGIN=0.25`,
`RL_COUNTERFACTUAL_ROLLOUTS=3`, `RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER=1`, and
`RL_LR=0.0002` skipped 1,783 high-margin states before rollout, skipped 47
unstable low-margin gaps, accepted 61 labels, and measured
`-0.026 +/- 0.001` point differential with `-0.039` raw score over 768 paired
games. A targeted anchored pairwise version accepted only 35 labels after
policy-margin, confidence, and score-gap filters, but produced three
`cycle>c2s` deployed-state flips in 3,420 diagnostic states and measured
`-0.036 +/- 0.056`. The filter is useful for making multi-rollout experiments
cheaper and more action-focused, but the accepted labels still need a better
objective or additional diagnostics to avoid reinforcing cycle-over-connector
changes.
Behavior-scoped pairwise labels did not solve that cycle preference: the same
targeted run with `RL_COUNTERFACTUAL_PREFERENCE_SCOPE=behavior` still produced
one `cycle>c2s` deployed-state flip plus one near-tie center-card flip and
measured `-0.082 +/- 0.085` over 768 paired games. Pounce-progress reward is
also wired in with `RL_COUNTERFACTUAL_POUNCE_WEIGHT`, but
`RL_COUNTERFACTUAL_POUNCE_WEIGHT=1` on the targeted anchored pairwise recipe
produced the same three `cycle>c2s` diagnostic flips and the same
`-0.036 +/- 0.056` paired result as the unweighted run. That suggests the bad
cycle labels are not caused only by ignoring pounce-out progress within the
current 450-move continuation horizon.
`action-ranking:audit-rl-labels` can now inspect those accepted labels directly.
On the targeted low-margin pairwise recipe above, using the trainer's internal
RL seed (`SEED=action-ranking-training:rl`) reproduced the 35-label batch:
1,783 states skipped by policy margin, 47 skipped by confidence, 26 skipped by
score gap, and 35 accepted. The accepted labels contained only one
`cycle>c2s` winner-vs-behavior pair, but it was a large outlier:
`+9.11` objective return, `+9` score return, and `+2.67` pounce progress while
the policy still scored the connector only `0.23` above cycle. That single label
was enough to generalize into three deployed `cycle>c2s` flips after training,
so the next mitigation should focus on high-impact outlier labels or
feature-local anchoring, not only broad move-type filtering.
`RL_COUNTERFACTUAL_MAX_RETURN_GAP` adds that outlier guardrail. Setting it to
`8` on the same targeted pairwise recipe skipped 17 high-gap labels, accepted
23 labels, removed the accepted `cycle>c2s` audit pair, and reduced deployed
diagnostic `cycle>c2s` flips from three to one. It still measured
`-0.069 +/- 0.034` over 768 paired games with a small score and pounce-out
regression, so the cap is useful for isolating the failure mode but is not a
promotable RL recipe by itself.
Output-only RL updates are now available with `RL_TRAINABLE_LAYERS=output`.
On the same capped targeted pairwise recipe, freezing the hidden layers reduced
the deployed diagnostic max absolute score drift from about `0.25` to `0.03`
and produced zero top-action disagreements across 3,406 model-policy states,
but still measured `-0.0282 +/- 0.0004` over 768 paired games. Removing the
max-return cap while keeping output-only updates accepted the original 35-label
batch and still produced zero diagnostic top-action disagreements, but measured
`-0.0334 +/- 0.0030`. That suggests hidden-layer drift was responsible for most
of the visible cycle-over-connector overgeneralization, while the remaining
performance gap is more likely label objective/selection quality.
`action-ranking:trace-divergences` can now explain those rare paired-comparison
losses by replaying paired games until the first policy-action split, then
finishing both trajectories. On the capped output-only pairwise recipe, only
four of 768 paired games diverged, but all four were `cycle>c2s` near-ties and
all four lost for the RL model, averaging `-5.42` point differential, `-4.5`
score, and `+1.75` pounce cards remaining on those divergent games. Increasing
anchor strength to `1` or replaying all 2,090 anchor states did not remove those
same four splits, so the next targeted fix should add connector-vs-cycle
protection or better label selection rather than just more generic anchoring.
The targeted connector-vs-cycle anchor is now wired in and confirms that this is
a very narrow decision-boundary issue. A broad connector anchor overcorrected:
it removed the original `cycle>c2s` splits but introduced 32 first divergences,
mostly `c2s>cycle`, and measured `-0.074 +/- 0.015`. Adding
`RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MAX_POLICY_MARGIN=0.05` was too narrow on
the same 64-episode capped output-only recipe and collected zero connector
anchor examples, reproducing the original four `cycle>c2s` losses. Widening the
connector window to `0.25` collected two connector examples. At full connector
anchor weight it shifted too far, producing two `c2s>cycle` divergences and
measuring `-0.009 +/- 0.009`; at weight `0.5` it left one `cycle>c2s`
divergence and measured `-0.0035 +/- 0.0035`. The cleanest diagnostic setting
was `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_WEIGHT=0.75` with the `0.25` connector
policy-margin cap: it collected the same two connector examples, produced zero
first divergences over 768 paired games, and tied the behavior-scope checkpoint
exactly on point differential, score, and behavior metrics. That makes the
connector anchor useful as a guardrail, not evidence of an improved policy.
Behavior-gap filtering is now wired in because the capped output-only label
audit exposed another issue: the 23 accepted supervised RL states had
`91.3%` winner-behavior agreement, so most updates were not corrections to the
deployed greedy action. With
`RL_COUNTERFACTUAL_REQUIRE_BEHAVIOR_GAP=true` and
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_IMPROVEMENT=1`, the same audit kept only one
high-confidence correction. Lowering the behavior threshold to `0.001` kept two
corrections with the confidence bound, or five without it; those five were
mostly deck-to-solitaire refinements plus one `c2s>cycle` correction. Training
that small behavior-gated batch with behavior-scoped output-only pairwise
updates still overgeneralized toward `c2s>cycle`: without the confidence bound
it measured `-0.032 +/- 0.016`, and with the confidence bound it measured
`-0.023 +/- 0.028` over 768 paired games. The gate is useful instrumentation,
but the current recipe needs more reliable correction volume or a weaker update,
not just a stricter accept/reject filter.
The connector anchor can now run in
`RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MODE=symmetric`, which preserves whichever
connector-or-cycle side the pre-update policy preferred instead of always
anchoring connector over cycle. On the 128-episode weak behavior-gated output
pairwise recipe, symmetric anchoring collected four accepted behavior-gap labels,
512 generic anchors, and 10 connector/cycle anchors. It measured
`+0.0048 +/- 0.0048` over the original 768-game paired comparison, then
`+0.0026 +/- 0.0017` over a 1,536-game held-out confirmation. The confirmation
trace found only three first divergences, all `cycle>c2s`: two helped and one
hurt the tuned model. This is still too small to call a promoted policy, but it
turns the connector anchor from a one-way guardrail into a safer local control
for low-margin connector/cycle decisions.
Return-gap pairwise weighting is now wired in for supervised counterfactual RL.
On the permissive version of the same 128-episode behavior-gated recipe
(`RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER=0`), the trainer accepted 12 labels instead
of 4. With `RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_SCALE=8`, the primary pairwise
updates averaged `0.437x` strength; with scale `4`, they averaged `0.731x`; and
with uniform weighting they averaged `1.0x`. All three landed on the same
768-game deployed comparison as the stricter symmetric-anchor recipe:
`+0.0048 +/- 0.0048` with one beneficial first divergence. The scale-8 weighted
model also matched the same 1,536-game confirmation result:
`+0.0026 +/- 0.0017`. That means weighting is available and observable, but this
particular label batch is still limited by finding more deployable correction
states rather than by primary pairwise strength.
`RL_COUNTERFACTUAL_SCAN_EPISODES=256` doubled the scan budget for that weighted
symmetric recipe while keeping `RL_EPISODES=128`. It accepted 33 behavior-gap
labels, averaged 54 scanned decisions per scan episode, collected 29
connector/cycle anchors, and kept primary pairwise strength at `0.473x`.
The original 768-game comparison stayed at `+0.0048 +/- 0.0048`, but the
1,536-game confirmation softened to `+0.0011 +/- 0.0020`; tracing found two
`cycle>c2s` first divergences, one helpful and one harmful. More scan volume is
therefore mechanically useful, but the next label-quality filter needs to
distinguish good cycle-over-connector delays from cases where the connector
should still be taken.

Uncertainty-targeted improvement collection is also wired in. With
`IMPROVEMENT_MAX_SCORE_GAP` and `IMPROVEMENT_POLICY_CANDIDATES`, the collector
can mine rollout labels only from low-margin policy decisions while forcing the
policy's top alternatives into the candidate set. On the behavior-scope
checkpoint, 120-state policy-sourced runs with score-gap caps of `0.5` and `1`
found 76-84 high-return behavior-gap examples after scanning 2,400 policy
states, but the resulting greedy changes were still tiny and mostly
cycle-over-connector; they measured `-0.058 +/- 0.058` and
`-0.041 +/- 0.046` over 384 paired games. Re-scoring the same style of labels
with `IMPROVEMENT_CONTINUATION=policy` eliminated sampled-state top-action
changes in the diagnostic, but still measured `-0.016 +/- 0.038`. Policy
continuation is better aligned with deployed play, but uncertainty mining alone
has not produced an improved checkpoint.
The label audit explains why: on an 80-state policy-continuation audit with
`LABEL_MAX_SCORE_GAP=1`, `LABEL_POLICY_CANDIDATES=5`, and behavior-gap
filtering, 65 accepted labels still picked cycle as the rollout winner in
`70.8%` of states, with the current policy's top action averaging about `14.9`
score units above that winner. Adding `IMPROVEMENT_MAX_WINNER_SCORE_GAP=1`
kept only 8-9 near-surface labels after 1,600 scanned states and removed the
worst immediate-reward conflicts, but the resulting small pairwise update had
100% top-action agreement with the starting checkpoint over 2,000 sampled
teacher states and measured `-0.030 +/- 0.030` over 384 paired games. That makes
the winner-score filter useful for avoiding bad labels, but it also shows that
we need either more label volume or a value-style update that can use weak
near-policy signals without erasing the existing policy.
Residual value targets are now wired for that latter path. On the same 80-state
policy-continuation label set, `IMPROVEMENT_MODE=value`,
`IMPROVEMENT_VALUE_TARGET_MODE=residual`, `IMPROVEMENT_VALUE_SCALE=8`,
`IMPROVEMENT_VALUE_HUBER=2`, and `IMPROVEMENT_LR=0.001` trained from 53
examples and produced bounded score drift while preserving 100% top-action
agreement over 2,000 sampled teacher states. In paired evaluation it still
measured `-0.043 +/- 0.045` over 384 games, so residual value regression is
safer infrastructure but not yet an improvement.
Multi-rollout confidence filtering is also wired in. With `LABEL_ROLLOUT_COUNT=3`
and `LABEL_BEHAVIOR_GAP_SE_MULTIPLIER=1`, the audit skipped 15 additional
high-variance labels after 800 scanned policy states, leaving 9 accepted labels;
the remaining winners still sat far below the current policy top action, so the
score-support problem remained. Combining that confidence gate with
`LABEL_MAX_WINNER_SCORE_GAP=1` left zero labels at the same budget. Training the
confidence-only residual-value recipe from 6 examples preserved 100% diagnostic
top-action agreement but measured `-0.084 +/- 0.015` over 384 paired games.
Variance filtering is useful instrumentation, but by itself it is not enough to
make the current rollout labels policy-improving.
Pre-rollout policy support filtering is the cleaner fix for the off-policy label
problem. With `LABEL_MAX_CANDIDATE_SCORE_GAP=1`, the same 80-state audit filtered
455 far-off-policy candidates before rollout and kept 8 accepted two-candidate
labels. The rollout winner was only `0.194` score units below the current policy
top on average, and the label set no longer had immediate-reward conflicts. A
conservative pairwise update from that source still preserved 100% diagnostic
top-action agreement and measured `-0.015 +/- 0.013` over 384 paired games. A
stronger update with `IMPROVEMENT_LR=0.002` and `IMPROVEMENT_EPOCHS=5` changed
0.55% of 2,000 sampled teacher-state decisions, all deck-to-solitaire over
cycle. It tied point differential on average over 384 games but lost raw score
by `0.190`, so this is a better-targeted correction mechanism, not a better
checkpoint yet.
Score-weighted improvement objectives are now available for probing that raw
score loss. `IMPROVEMENT_SCORE_WEIGHT=0.25` on the same candidate-support recipe
kept the near-policy label shape and changed 0.55% of sampled decisions, still
all deck-to-solitaire over cycle; paired comparison measured `+0.019 +/- 0.160`
point differential but `-0.193` raw score over 384 games. A stronger
`IMPROVEMENT_SCORE_WEIGHT=1` collected more examples and changed 0.70% of
sampled decisions, but measured `-0.115 +/- 0.087` point differential and
`-0.276` raw score. The blended objective is useful instrumentation, but these
weights did not produce a better checkpoint.

Legacy model feature expansion is now enabled before fine-tuning. Re-running the
240-state behavior-scope recipe from the capacity checkpoint produced a 48-input
checkpoint and trained small nonzero weights on the newer connector/alternative
features, but its greedy behavior was identical to the prior 45-input
behavior-scope checkpoint over 384 paired games. That makes feature expansion
safe infrastructure, not a standalone policy improvement yet.
`own.pointDifferential` has since been added as a 49th feature. Focused
connector/cycle tracing showed the harmful and helpful scan-budget `cycle>c2s`
splits were identical on the visible connector features, while differing in
state context: one occurred while already far ahead with five pounce cards, and
the other near even with seven pounce cards. Existing checkpoints expand with a
zero weight for this feature, so behavior is preserved until a future all-layer
or fresh train can use the extra state signal.
A first all-layer version of the same scan-256 weighted symmetric recipe
(`RL_TRAINABLE_LAYERS=all`, `RL_LR=0.00005`) moved all 192
`own.pointDifferential` input weights, but only weakly: mean absolute first-layer
weight was `0.00000096`. It measured `+0.0043 +/- 0.0052` over the original
768-game comparison and `+0.00065 +/- 0.01446` over the 1,536-game held-out
comparison. The held-out trace found 15 first divergences, 14 of them
`cycle>c2s`, including severe losses when behind with a large pounce pile. The
trainer-seed audit showed the accepted `cycle>c2s` labels themselves were also
behind/near-even, high-pounce, negative-score states on average
(`-2.11` point differential, `11.67` pounce cards, `-22.67` current points), so
the next fix should target label reliability or hidden-layer generalization
rather than a simple ahead/behind rule.
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE=1` now tests that label-reliability
idea directly by requiring the rollout winner to beat greedy behavior in every
paired continuation. On the same scan-256 output-only weighted symmetric recipe
it cut accepted labels from 37 to 15 and skipped 135 labels by behavior win
rate, but it kept the three accepted `cycle>c2s` corrections. The trained model
measured `+0.0017 +/- 0.0122` over the original 768-game comparison and
`+0.0017 +/- 0.0135` over the 1,536-game held-out comparison. Held-out tracing
still found 14 first divergences, all `cycle>c2s`. That means the current
rollout objective is consistently preferring some cycle-over-connector delays;
the next improvement likely needs a better objective/horizon or richer features
for why the connector matters, not just stricter rollout agreement.
The action feature set now adds that richer connector context directly:
post-move connector count/closeness, pounce-vs-stack-root connector flags, and
a deck stock fraction feature active on deck-to-solitaire moves. Old checkpoints
expand with zero weights for these inputs, preserving behavior until a fresh
train or all-layer fine-tune learns from them.
First all-layer probe from `pounce-action-ranking-behavior-scope-240-lr1` using
those inputs (`pounce-rl-connector-features-all-pairwise-64-scan128`) accepted
1,029 behavior-gap counterfactual pairwise updates from 128 scanned episodes.
The new connector input weights moved in all 192 hidden units, but weakly
(largest absolute first-layer weight about `0.00043`). A 384-game / 8-seed
paired comparison against the behavior-scope checkpoint measured
`-0.0104 +/- 0.0104` point differential, with 383 tied games and one
baseline-favored split. Tracing found that split was `c2c>c2c`, not
connector-vs-cycle, so this recipe is instrumentation progress rather than a
promotion candidate.
A 128-episode label audit with the same behavior-gap connector/cycle settings
accepted 49 labels: three `c2s>cycle` and three `cycle>c2s`. The new features
showed why a simple deck-threshold interpretation is still too weak:
`c2s>cycle` appeared at deck stock fractions around `0.52-0.72`, while
`cycle>c2s` appeared at `0.34`, `0.875`, and `0.94`. One `cycle>c2s` label
also had an active stack-root connector
(`postTopConnectorCount=0.2`, `postTopConnectorCloseness=1`,
`postTopConnectsStackRoot=1`). So the next likely improvement is not only more
connector representation; it is filtering or reshaping rollout labels whose
long-horizon point-differential result prefers cycling over an apparently live
connector.
Re-imitation-training the 45-input behavior-scope checkpoint onto the current
70-feature vector is not a shortcut: a 240-deal, 4-epoch continuation reached
`92.8%` imitation accuracy but measured `-0.273 +/- 0.201` against the starting
checkpoint over 384 paired games. The new tactical inputs should therefore be
introduced through targeted reward labels or fresh broad training, not by simply
continuing imitation on the current teacher mix.
`RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR` now tests the targeted label
filtering path directly. In a 64-episode behavior-gap pairwise audit from
`pounce-action-ranking-behavior-scope-240-lr1`, it skipped 2 live-connector
`cycle>c2s` labels while leaving non-connector cycle labels available. A broad
128-episode output-only guarded run accepted 1,437 labels and skipped 193
connector/cycle labels; its 384-game search comparison was mildly positive
(`+0.026 +/- 0.022`), but a 1,536-game confirmation rejected it
(`-0.009 +/- 0.0068`). A conservative exploratory-only version accepted 44
labels, skipped 4 connector/cycle labels, and tied the baseline exactly over
384 paired games. Treat the guard as useful label-quality infrastructure, not
yet an improved policy.
First self-play RL probes from `pounce-action-ranking-behavior-scope-240-lr1`
showed that the new `RL_OPPONENT_MODE=self` path works but still needs sharper
label filtering. A conservative 16-episode residual-value recipe accepted 24
self-play counterfactual labels, skipped 2 connector/cycle labels, and produced
zero deployed greedy differences over 128 paired heuristic-seat games. A sharper
24-episode anchored pairwise-margin recipe accepted 23 labels and 256 anchor
examples, changed about `0.2%` of sampled top actions, and measured
`-0.099 +/- 0.106` over 192 paired heuristic-seat games. Direct neural-vs-neural
self-play comparison was closer (`-0.018 +/- 0.065` over 128 paired deals), but
not positive. The traced regression was a `c2s>cycle` flip where cycling would
have revealed a center-playable, soon-playable card matching pounce parity, so
`RL_COUNTERFACTUAL_SKIP_SOLITAIRE_OVER_USEFUL_CYCLE` now guards that specific
label shape for future self-play recipes. Re-running the same pairwise recipe
with that guard skipped 2 useful-cycle labels plus 1 connector/cycle label, but
still regressed (`-0.226 +/- 0.062` over 192 paired heuristic-seat games) and
still produced `c2s>cycle` disagreements. The guard is useful instrumentation;
this self-play pairwise recipe is still too aggressive.
First champion-mode probes with the 97-input reset-memory/visible-pressure
feature set were encouraging but still too weak to promote. A
`champion-greedy-residual-value-pressure` recipe scanned 48 greedy-state
episodes against frozen neural opponents, accepted 1,565 counterfactual value
labels, and applied 4,916 value-gradient updates. The 192-game search comparison
measured only `+0.0017 +/- 0.0017`, but a larger 1,536-game paired comparison
measured `+0.0195 +/- 0.0176`; swapped-seat neural self-play measured
`+0.0095 +/- 0.0175` over 768 games. Tracing found only 5 first divergences in
1,536 games: three `cycle>c2s`, one `c2s>c2s`, and one same-type center split,
with mixed outcomes. A guarded champion pairwise-pressure recipe accepted 31
labels, skipped 2 connector/cycle and 4 useful-cycle labels, added 512 anchor
updates, and produced zero deployed greedy differences over 192 games. Stronger
residual-value variants (`lr=0.00006` and `2` update epochs at `lr=0.00004`)
regressed (`-0.026 +/- 0.026` and `-0.057 +/- 0.057` over 192 games) while still
showing full top-action agreement in small diagnostics. The current best clue is
therefore not "turn the same recipe up"; it is targeted low-margin/deployed-state
mining or feature-specific filtering that finds more useful top-action flips
without amplifying broad cycle-vs-solitaire drift.
`RL_COUNTERFACTUAL_REQUIRE_POLICY_CHANGE` now supports that targeted mining
path directly by dropping labels whose rollout winner is already the current
greedy action. In the RL mode smoke it skipped 25 already-greedy labels while
keeping 84 supervised correction labels. A first champion deployable residual
value probe using greedy states, `RL_COUNTERFACTUAL_REQUIRE_POLICY_CHANGE=true`,
and `RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.05` wrote a candidate but tied the
behavior-scope checkpoint exactly over 384 paired games. This suggests the
filter is useful for label quality, but the accepted corrections still need
either stronger near-margin weighting or a better state miner to produce enough
deployed top-action movement.
`RL_COUNTERFACTUAL_BEHAVIOR_CORRECTION_WEIGHT` is now wired for that near-margin
path. The RL mode smoke confirmed the auxiliary behavior-correction loss applied
111 winner-vs-greedy updates in a filtered value run. A first champion probe
with `RL_COUNTERFACTUAL_REQUIRE_POLICY_CHANGE=true`,
`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.05`, and behavior correction kept only 1
correction label, skipped 408 already-greedy winners and 301 score-gap labels,
then tied the behavior-scope checkpoint exactly over 384 paired games. So the
loss plumbing works, but the hard `0.05` score-gap cap is too tight for this
checkpoint; the next useful miner should widen the cap, rank the closest
deployable labels, or keep a budget of near-margin candidates instead of using a
single hard threshold.
That budgeted miner is now available with
`RL_COUNTERFACTUAL_SCORE_GAP_BUDGET`. In the RL mode smoke, a budget of 4 kept
the 4 closest deployable labels, skipped 65 farther labels, and accepted labels
with average current score gap `0.028`. On the behavior-scope checkpoint, a
small champion residual-value probe with a budget of 32 kept 32 labels, skipped
246 farther labels, applied 32 behavior-correction updates, but still tied the
baseline exactly over 384 paired games; direct diagnosis showed maximum score
movement of only `0.024`, far below normal top-action margins. A stronger
budgeted pairwise probe did move the deployed policy, but regressed
`-0.170 +/- 0.038` over 384 paired games. The current conclusion is that
score-gap budgeting is a useful primitive, but it needs larger over-scans or a
stricter low-margin state miner; training high-gap corrections harder can flip
actions, but the first flips are not better.

## Deploying

The production app runs on Google Cloud Run:

- Project: `pounce-409615`
- Service: `pounce`
- Region: `us-east4`

Deploy from the repo root with:

```powershell
gcloud run deploy pounce `
  --source . `
  --project pounce-409615 `
  --region us-east4
```

Cloud Run builds the included `Dockerfile` from source and updates the existing service. The existing service settings should be preserved by default, including port `8080`, `maxScale=1`, memory, CPU, concurrency, timeout, startup probe, and public access. The startup probe should hit `/api/startup/ready`, which verifies nginx can reach the Socket.IO server and that Socket.IO can reach Next. Run `git status --short` first because `--source .` uploads the current working tree, including uncommitted files that are not ignored.

### Automated deploys

GitHub Actions deploys the app automatically through `.github/workflows/deploy-cloud-run.yml` whenever a commit is pushed to `main` or `master`. The workflow also supports manual runs from the Actions tab.

The workflow uses GitHub OIDC with Google Workload Identity Federation, so it does not need a long-lived Google service account key. Before the first run, add these repository secrets in GitHub under Settings > Secrets and variables > Actions > Secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: the full Workload Identity Provider resource, such as `projects/123456789/locations/global/workloadIdentityPools/github/providers/pounce`.
- `GCP_SERVICE_ACCOUNT`: the deploy service account email, such as `github-actions-deploy@pounce-409615.iam.gserviceaccount.com`.
- `GAME_SERVER_DRAIN_SECRET`: a random secret used by GitHub Actions to call the game server drain endpoint before deploying.

The Google Cloud setup needs the IAM, IAM Credentials, Security Token Service, Cloud Run, Cloud Build, and Artifact Registry APIs enabled. The deploy service account should be allowed to impersonate from the GitHub provider, have Cloud Run Source Developer and Service Usage Consumer on the project, and have Service Account User on the Cloud Run runtime service account. The default Cloud Build service account also needs Cloud Run Builder on the project. Restrict the Workload Identity Provider condition to this repository and the deploy branches.

Before each automated deploy, the workflow posts to `/api/admin/drain` on the currently deployed service and waits 5 minutes. During that window, the game server broadcasts an update toast to connected players and rejects new online rooms while still allowing players to rejoin existing rooms.

### Artifact image cleanup

Cloud Run source deploys push images to the Artifact Registry repository `cloud-run-source-deploy`. The deploy workflow applies `deploy/artifact-registry-cleanup-policy.json` on every run so old images do not accumulate indefinitely.

The policy deletes untagged `pounce` images older than 3 days, while keeping the 10 newest `pounce` image versions. The current deployment image is tagged as `latest`, so the delete policy targets the old images left behind after `latest` moves. Artifact Registry cleanup policies do not detect whether a Cloud Run revision still references an image digest; the 10-version keep rule is the rollback cushion for recent untagged revisions.

To apply or update the policy manually:

```powershell
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy `
  --project pounce-409615 `
  --location us-east4 `
  --policy deploy/artifact-registry-cleanup-policy.json `
  --no-dry-run
```

To test changes before enabling deletion, use `--dry-run` instead of `--no-dry-run`. Artifact Registry cleanup policies run in the background and can take about a day to take effect.

The deploy service account needs permission to update cleanup policies on the repository. The simplest setup is Artifact Registry Administrator on the `cloud-run-source-deploy` repository, or a custom role that includes `artifactregistry.repositories.update`.

```powershell
gcloud artifacts repositories add-iam-policy-binding cloud-run-source-deploy `
  --project pounce-409615 `
  --location us-east4 `
  --member serviceAccount:github-actions-deploy@pounce-409615.iam.gserviceaccount.com `
  --role roles/artifactregistry.admin
```

## Planned todos:

### Infra

- Find a way to deploy nextjs+socketio (github pages?)
- Consider how to make serverless work (assuming one pod for now still, maybe spins down if no sockets)
- Separate homepage from `rooms/<roomcode>` page

### User Play / Interface

- Fix touch dragging on mobile (iphone)
- Add compact mobile version
- Allow two-clicks to drag (nice for long-distance moves where dragging trackpad that far gets cumbersome)
- Deal hands before starting to allow prep (maybe fixed 5 seconds from deal to start, removed in automation mode)
- Draw area around each players section maybe (shaded gray box? ensure player1 lies over player2)
- Maybe flip all the cards over and simulate tallying them up (fly them all into a pile, count up to their score?)
- Add sound effects for card movements (volume cycles < solitaire < field)
- Improve HandsLayer performance? Maybe not super important
- Perhaps rework code system to be more secure (lobbylist + passwords?)
- Add toggle for "fair decks" mode (i.e. queueing up repeat decks)
- Add "copy join link" to Room section

- Consider moving from sockets to p2p (https://socket.io/blog/socket-io-p2p/), removing the need for socket server (only static content basically). Could consider changing billing mode in this case. This would also allow offline play potentially with app support.

### Bots/Simulation

- Update the computer cost function to somehow include how much it takes to think about something (instead of pre-emptively incurring a fixed cost after every move, trigger some cost depending on the move [ex. back-to-back on the same pile is easy, or changing which pile you're going to play a certain card on is easy, but switching move entirely is a lot harder])

- Update reaction logic. Delaying the entire board a fixed amount isnt great. Any moves they play should appear instantly (this solves their weakeness on back-to-back moves), as well as a limited set of "subscribed" piles? (their own hand / solitaire pile, and some they care about)

- Maybe update pile locations after a human sends an Ace out to avoid that Ace?

- Add strategy to pre-emptively "play" a card that doesnt play (ex. after 4H gets played in the center, pre-play 6H; maybe only if you see 5H in someones hand, or saw the 4H coming in someones hand too )

- Add competition-priority boost (note: requires reworking moves from a fixed ordering to weighted ordering). If someone else has a card you want to play to the center, prioritize playing that over other moves (ex. P=5H Solitaire=7C 8H \_ KH; we could move the pounce card out, or play a solitaire move to merge 7C into 8H, but we really should just play KH on the board if it can play since the other moves arent "competitive" )

- Fix reactions not updating when failing a play (Should learn about that pile ideally). May need to track board per AI

### Random

- Fix spectating mode (have "opted-in" spectate mode, which doesnt automatically disable when a new round starts, but can be manually left. This would also be used for Simulation Mode)
- Fix bug with closing page not disconnecting (Doesnt happen locally, but in prod, may need to fix logging and debug)
