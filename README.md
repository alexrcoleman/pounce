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

- `IMITATION_DEALS`, `IMITATION_EPOCHS`, `IMITATION_LR`, `IMITATION_EQUIVALENT_TARGETS`, `IMITATION_TEACHER_STYLE`
- `IMPROVEMENT_STATES`, `IMPROVEMENT_STATE_SOURCE`, `IMPROVEMENT_STATE_TEMPERATURE`, `IMPROVEMENT_STATE_SAMPLE`, `IMPROVEMENT_MAX_SCORE_GAP`, `IMPROVEMENT_MAX_WINNER_SCORE_GAP`, `IMPROVEMENT_MAX_CANDIDATE_SCORE_GAP`, `IMPROVEMENT_POLICY_CANDIDATES`, `IMPROVEMENT_CANDIDATES`, `IMPROVEMENT_ROLLOUT_MOVES`, `IMPROVEMENT_ROLLOUT_COUNT`, `IMPROVEMENT_COMMON_RANDOM`, `IMPROVEMENT_CONTINUATION`, `IMPROVEMENT_SCORE_WEIGHT`, `IMPROVEMENT_MODE`, `IMPROVEMENT_MIN_RETURN_GAP`, `IMPROVEMENT_MAX_PAIRS`, `IMPROVEMENT_PREFERENCE_TEMPERATURE`, `IMPROVEMENT_PREFERENCE_SCOPE`, `IMPROVEMENT_PAIRWISE_MARGIN`, `IMPROVEMENT_VALUE_SCALE`, `IMPROVEMENT_VALUE_CENTER`, `IMPROVEMENT_VALUE_TARGET_MODE`, `IMPROVEMENT_VALUE_HUBER`, `IMPROVEMENT_REQUIRE_BEHAVIOR_GAP`, `IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT`, `IMPROVEMENT_BEHAVIOR_GAP_SE_MULTIPLIER`, `IMPROVEMENT_EPOCHS`, `IMPROVEMENT_LR`, `IMPROVEMENT_TEMPERATURE`
- `RL_EPISODES`, `RL_LR`, `RL_TEMPERATURE`, `RL_LOCAL_REWARD_WEIGHT`, `RL_LOCAL_REWARD_DISCOUNT`, `RL_OPPONENT_MODE`, `RL_OPPONENT_MODEL`, `RL_BASELINE_MODE`, `RL_COMMON_RANDOM`, `RL_CREDIT_MODE`, `RL_COUNTERFACTUAL_SCAN_EPISODES`, `RL_COUNTERFACTUAL_SCAN_SEED_COUNT`, `RL_COUNTERFACTUAL_ROLLOUTS`, `RL_COUNTERFACTUAL_ROLLOUT_MOVES`, `RL_COUNTERFACTUAL_CANDIDATES`, `RL_COUNTERFACTUAL_MIN_RETURN_GAP`, `RL_COUNTERFACTUAL_MAX_RETURN_GAP`, `RL_COUNTERFACTUAL_REQUIRE_BEHAVIOR_GAP`, `RL_COUNTERFACTUAL_MIN_BEHAVIOR_IMPROVEMENT`, `RL_COUNTERFACTUAL_STATE_SOURCE`, `RL_COUNTERFACTUAL_MODE`, `RL_COUNTERFACTUAL_GAP_SE_MULTIPLIER`, `RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE`, `RL_COUNTERFACTUAL_MIN_BEHAVIOR_WINS`, `RL_COUNTERFACTUAL_MAX_POLICY_MARGIN`, `RL_COUNTERFACTUAL_REQUIRE_POLICY_CHANGE`, `RL_COUNTERFACTUAL_PREFERENCE_SCOPE`, `RL_COUNTERFACTUAL_PAIRWISE_MARGIN`, `RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_MODE`, `RL_COUNTERFACTUAL_PAIRWISE_WEIGHT_SCALE`, `RL_COUNTERFACTUAL_PAIRWISE_MAX_WEIGHT`, `RL_COUNTERFACTUAL_PAIRWISE_FEATURE_MODE`, `RL_COUNTERFACTUAL_MAX_TRANSITIONS_PER_EPISODE`, `RL_COUNTERFACTUAL_MAX_SCORE_GAP`, `RL_COUNTERFACTUAL_SCORE_GAP_BUDGET`, `RL_COUNTERFACTUAL_MAX_LABELS_PER_MOVE_PAIR`, `RL_COUNTERFACTUAL_EXCLUDE_MOVE_PAIRS`, `RL_COUNTERFACTUAL_BEHAVIOR_MOVE_TYPES`, `RL_COUNTERFACTUAL_STOP_AFTER_LABELS`, `RL_COUNTERFACTUAL_VALIDATION_ROLLOUTS`, `RL_COUNTERFACTUAL_MIN_VALIDATION_RETURN_GAP`, `RL_COUNTERFACTUAL_MIN_VALIDATION_WINS`, `RL_COUNTERFACTUAL_SCORE_WEIGHT`, `RL_COUNTERFACTUAL_POUNCE_WEIGHT`, `RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR`, `RL_COUNTERFACTUAL_SKIP_WEAK_CYCLE_OVER_CONNECTOR`, `RL_COUNTERFACTUAL_SKIP_SOLITAIRE_OVER_USEFUL_CYCLE`, `RL_COUNTERFACTUAL_ANCHOR_WEIGHT`, `RL_COUNTERFACTUAL_ANCHOR_EXAMPLES`, `RL_COUNTERFACTUAL_ANCHOR_TEMPERATURE`, `RL_COUNTERFACTUAL_BEHAVIOR_CORRECTION_WEIGHT`, `RL_COUNTERFACTUAL_BEHAVIOR_CORRECTION_MARGIN`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_WEIGHT`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_EXAMPLES`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MARGIN`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MAX_POLICY_MARGIN`, `RL_COUNTERFACTUAL_CONNECTOR_ANCHOR_MODE`, `RL_COUNTERFACTUAL_MOVE_TYPE_ANCHOR_WEIGHT`, `RL_COUNTERFACTUAL_MOVE_TYPE_ANCHOR_EXAMPLES`, `RL_COUNTERFACTUAL_MOVE_TYPE_ANCHOR_TEMPERATURE`, `RL_COUNTERFACTUAL_VALUE_SCALE`, `RL_COUNTERFACTUAL_VALUE_CENTER`, `RL_COUNTERFACTUAL_VALUE_TARGET_MODE`, `RL_COUNTERFACTUAL_VALUE_HUBER`, `RL_UPDATE_EPOCHS`, `RL_UPDATE_SCOPE`, `RL_TRAINABLE_LAYERS`, `RL_NORMALIZE_ADVANTAGES`, `RL_ADVANTAGE_CLIP`
- `PLAYERS`, `HIDDEN`, `HIDDEN_LAYERS`, `MAX_MOVES`, `SEED`
- `HIDDEN` and `HIDDEN_LAYERS` accept comma-separated layer sizes, for example `HIDDEN=192,96`
- `MODEL_OUT=C:\tmp\pounce-action-ranking-model.json` to save model weights
- `MODEL_IN=...\model.json npm run action-ranking:train` to fine-tune saved weights
- `RL_ONLY=true MODEL_IN=...\model.json npm run action-ranking:train` to run a pure RL fine-tune without accidental imitation or improvement updates
- `MODEL_IN=...\model.json npm run action-ranking:evaluate` to evaluate saved weights
- `MODEL_IN=...\model.json npm run action-ranking:evaluate-by-style` to evaluate saved weights against each fixed heuristic AI style
- `MODEL_IN=...\model.json npm run action-ranking:imitation-by-style` to measure top-action agreement and move-family drift against each fixed heuristic AI style
- `MODEL_IN=...\candidate.json BASELINE_MODEL=...\baseline.json npm run action-ranking:report` to summarize model size/features, fixed-heuristic strength, paired baseline comparison, and neural self-play comparison in one output
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:compare` to compare two models on paired deals/seats
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:compare-self-play` to compare two models sharing the same self-play table
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:compare-by-style` to compare two models against each fixed heuristic style
- `STYLE_A="Alex 75%" STYLE_B="Alex 66%" OPPONENTS="Mom" GAMES=8192 npm run action-ranking:compare-styles` to compare fixed heuristic styles with paired deal-level confidence intervals
- `PLAYERS=3 GAMES=512 npm run action-ranking:tournament` to run fixed-style heuristic tournaments; add `MODEL_SPECS="label=path;other=path"` to include neural models
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:diagnose` to compare top-ranked actions on sampled teacher states
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:trace-divergences` to inspect the first policy-action divergence in paired games
- `MODEL_IN=...\best.json npm run action-ranking:audit-labels` to audit rollout labels before training on them
- `MODEL_IN=...\best.json npm run action-ranking:audit-rl-labels` to audit accepted counterfactual RL labels before training on them; this also supports `RL_OPPONENT_MODE=self|champion` and `RL_OPPONENT_MODEL`
- `MODEL_IN=...\best.json npm run action-ranking:tune` to iterate reward fine-tunes and promote only paired-comparison improvements
- `MODEL_IN=...\best.json npm run action-ranking:tune-rl` to sweep counterfactual RL recipes and promote only paired-comparison improvements
- `npm run action-ranking:check-rl-modes` to smoke-test legacy feature expansion and counterfactual RL training mode routing
- `EVAL_RUNS=4` or `EVAL_SEEDS=seedA,seedB` to evaluate saved weights across multiple seeds
- `EVAL_GAMES=0` can skip the small built-in evaluation in `action-ranking:train` when running quick training smoke checks
- `POUNCE_NEURAL_AI_MODEL=...\model.json npm run dev` to run Socket.IO bots with saved weights

For exact one-off counterfactual RL recipes, prefer `action-ranking:train` with
`RL_ONLY=true`. `action-ranking:tune-rl` is a sweeper: unless `RL_TUNE_RECIPES`
is supplied, it runs its built-in recipe set rather than treating every `RL_*`
environment variable as a single direct recipe.

Evaluation output includes same-seat teacher baseline metrics plus behavior
diagnostics such as decision count, center/solitaire/cycle move rates, pounce
remaining, and pounce-out rate. The model loader accepts both the original
single-hidden-layer checkpoint format and the newer multi-layer format. It also
expands older checkpoints onto the current action-feature list with zero weights
for new inputs, preserving existing scores while allowing future fine-tunes to
train newly added tactical features.
Counterfactual RL training also reports `counterfactualPolicyShift`: pre/post
top-action rates for the rollout winner and current behavior action on the
accepted supervised labels, plus the changed-top-action rate. Use it as a cheap
sanity check before spending hundreds of paired games on a candidate; a batch
with zero changed top actions probably only moved scores inside existing
margins.
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
The current feature surface adds a compact whole-solitaire context: how many own
stack tops can play soon, how many newly exposed second cards could play center
or soon, best buried/bottom pounce-connector closeness, and whether a source move
exposes a card with another solitaire destination. These are meant to let rollout
labels explain why exposing or preserving a pile matters without feeding the
network a full recurrent board memory.
It also repeats a compact own-deck context on every candidate: visible waste-card
soon/play-to-solitaire/pounce-connector shape plus stock-lookahead reach for
center play, soon play, solitaire destinations, and pounce connectors. That gives
non-cycle moves a lightweight memory proxy for the deck opportunity they are
preserving or delaying. The current 130-input surface also exposes direct
stock/waste fractions plus the current pounce-card value/parity on every
candidate, so reward labels do not have to reconstruct those ideas from separate
count features.
Center moves now carry a sharper tempo/threat signal: own follow-up cards are
split by pounce/deck/solitaire source, and opponent follow-up pressure is
weighted by how close that opponent is to pouncing out. This is meant to give RL
enough context to learn "do not feed the opponent's pounce card" without baking
that as a fixed heuristic priority.
A first 130-input threat-context warmup from the 118-input deck-context warmup
(`48` imitation deals, `2` epochs, `IMITATION_LR=0.005`) reached `92.92%`
teacher accuracy and saved an `805 KB` model with 25,345 parameters. It stayed
close to the 118-input warmup in paired heuristic-seat play
(`-0.042 +/- 0.057` over 128 games) and had a noisy positive neural self-play
point estimate (`+0.297 +/- 0.328` over 64 games). Treat this as feature-surface
preparation for reward/self-play work, not as a promoted stronger policy yet.
A first reliability-filtered reward probe from this 130-input warmup used greedy
states, `3` counterfactual rollouts, unanimous behavior win-rate filtering,
`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5`,
`RL_COUNTERFACTUAL_SCORE_GAP_BUDGET=8`, and the connector/useful-cycle guards.
The audit accepted only `7` labels in `128` scanned episodes, mostly same-family
`c2s>c2s` and `c2c>c2c` corrections plus one high-gap `cycle>c2s`. Training the
matching behavior-scoped, return-gap-weighted pairwise recipe accepted `6`
labels and applied `12` pairwise updates, but produced zero label-state
top-action flips and exact ties in paired, fixed-style, and self-play gates. The
next useful lever is therefore update calibration or targeted deployed-state
mining, not larger confirmation budgets for this exact recipe.
A stronger calibrated retry from the same 130-input warmup confirmed the current
failure mode. An all-layer `RL_LR=0.005`, `RL_UPDATE_EPOCHS=5`,
return-gap-weighted pairwise recipe moved 2 of 8 accepted label states, but
generalized into broad `cycle>c2s` drift and regressed by `-0.120` average point
differential over 768 paired heuristic-seat games. Tracing found 131
`cycle>c2s` first divergences averaging `-1.170` points. Adding
`RL_COUNTERFACTUAL_REQUIRE_SAME_MOVE_TYPE=true` filtered that batch to
same-family labels only: a 512-episode scan accepted 8 labels
(`c2c>c2c:7`, `c2s>c2s:1`), skipped 17 move-type mismatches, changed 2 of 8
label-state top actions, and measured essentially neutral against the warmup
(`-0.030 +/- 0.044` over 768 games). A first-divergence trace found only 18
divergences in those 768 games, mostly `c2c>c2c` ordering changes; the
divergent games skewed negative (`-1.278` average point differential), so the
remaining issue is noisy same-family ordering rather than runaway move-type
priority drift. The guard prevents the obvious bad cross-type generalization,
but the same-family label stream is still too sparse and local to promote by
itself.
The next pass isolated the opposite experiment family: cross-type labels only,
with same-family pairs filtered out. Five-rollout unanimity was too strict and
accepted zero labels in 64 audited episodes, but five rollouts with a `0.8`
behavior-win threshold found a small strategic stock-memory shape: two
`cycle>c2s` labels where cycling revealed useful stock cards while the player
was behind with a high pounce count. Those labels averaged `+14.37` point
differential, `+8.30` score, and `+4.50` pounce-progress return over the
deck-to-solitaire behavior. A narrow cycle-memory training run now uses
`RL_COUNTERFACTUAL_REQUIRE_DIFFERENT_MOVE_TYPE=true` for this family. The
stronger `LR=0.001` update flipped both accepted cycle labels but leaned
negative in the quick gate (`-0.219 +/- 0.712` over 32 games), while lower or
near-gap updates either tied the warmup exactly or did not flip deployed
decisions. This is the best current candidate shape for actual divergent
strategy, but it needs better contextual regularization or more near-deployable
labels before promotion.
Cross-type cycle-memory probes can now also require local reward support with
`RL_COUNTERFACTUAL_MIN_SCORE_RETURN_GAP` and
`RL_COUNTERFACTUAL_MIN_POUNCE_PROGRESS_GAP`. In a 64-episode audit using
cross-type-only labels, 5 rollouts, `0.8` behavior win-rate, and both local
minimums set to `1`, the accepted batch was exactly the two `cycle>c2s`
stock-memory labels above; two same-family labels were skipped before the local
support filters, and no accepted label failed the score/pounce gates. This gives
the next training sweep a cleaner way to ask for "cycle because it advances the
stock toward useful score/pounce progress" rather than generic cycle preference.
The follow-up no-promotion sweep confirmed the label quality but not the policy
improvement: output-only and all-layer candidates still changed deployed behavior
in fewer than `1.1%` of traced games, with the `cycle>c2s` divergences skewing
negative, and the anchored candidate made no deployed changes. Treat these
stock-memory labels as audit clues, not as a ready training target.
Imitation training can now target a single fixed heuristic style with
`IMITATION_TEACHER_STYLE="Alex 75%"`, and `action-ranking:imitation-by-style`
reports top-action/equivalence/family agreement against each style. On the
130-input mixed warmup over 16 deals per style, top-action agreement was roughly
`92%` for Mom/Alex-v2/Alex 75%/Alex 66% and `86%` for Alex 1.0. A small Alex 75%
continuation (`48` deals, `2` epochs, `IMITATION_LR=0.003`) improved Alex 75%
top-action agreement to `93.4%`, equivalence agreement to `98.8%`, and nearly
matched that teacher's cycle/deck-solitaire rates, but it did not improve
gameplay: paired vs the mixed threat-context warmup measured
`-0.331 +/- 0.555`, neural self-play tied at `+0.021 +/- 0.667`, and fixed-style
evaluation still regressed. So single-style imitation is useful for controlled
seeds and diagnostics, but it is not itself a strategic improvement.
`action-ranking:tournament` now gives a direct baseline for that question. In
the current code, a 3-player all-distinct fixed-style tournament with 512 deals
per matchup and seat rotations (15,360 simulated rounds) did confirm
`Alex 75%` as the best current heuristic, but the gap is modest rather than a
60% round-win ceiling: `Alex 75%` scored `35.05% +/- 0.49%` score-win share and
`+0.525 +/- 0.114` average point differential, followed by `Alex 66%` at
`34.21% +/- 0.49%`, `Alex-v2` at `33.43% +/- 0.49%`, `Alex 1.0` at
`32.99% +/- 0.48%`, and `Mom` at `30.99% +/- 0.48%`. The default 3-style
3-player matchup (`Mom`, `Alex-v2`, `Alex 75%`) put `Alex 75%` at only
`36.02% +/- 1.21%`, and even against two `Mom` opponents it measured
`34.62% +/- 1.20%`. A 4-player all-distinct tournament likewise kept the top
heuristic near the field (`Alex 75%` at `26.66% +/- 0.48%`). This means
"mixed to best fixed heuristic" may be a much smaller supervised/RL target than
expected under the current simulator and scoring metric. It also makes the
existing `player.index`/`player.botIndex` action features suspicious for mixed
teacher imitation: they let the model learn seat-conditioned teacher styles,
which is useful for cloning the mixed bot table but awkward for learning one
portable stronger policy.
The intentionally weak `No solitaire unless stuck` style is available for
tournament diagnostics but is excluded from the normal rotating AI styles. A
3-player all-distinct tournament with this sixth participant (`128` deals per
matchup, `7,680` simulated rounds) put it far below the heuristic family:
`2.08% +/- 0.23%` score-win share, `-18.996 +/- 0.139` average point
differential, and only a `0.68%` pounce-out rate. This is a useful simulator
sanity check: broad solitaire/center strategy choices do matter, even if the
Alex threshold variants are clustered tightly.
A higher-sample strategy check sharpened that interpretation. In the newer
strategy-analysis code, `Center pressure` is the old `Alex 75%` profile and
`Balanced setup` is old `Alex 66%`. Over `1,000` seeded hands with `25` trials
per advice strategy, raw-best hand share was `46.0% +/- 3.1%` for Balanced
setup, `32.6% +/- 2.9%` for Solitaire heavy, and `21.4% +/- 2.5%` for Center
pressure; however, the paired point-differential delta was still positive for
Center pressure over Balanced setup (`+0.176 +/- 0.100`) and negative for
Solitaire heavy (`-0.799 +/- 0.171`). A direct paired tournament over `8,192`
deals with seat rotations found `Alex 75%` vs `Alex 66%` still statistically
unclear (`+0.0037 +/- 0.0103` score-win-share delta and `+0.103 +/- 0.240`
point differential), while both were clearly above `Mom` by roughly five score
win-share points and `+1.3` to `+1.4` point differential. So `Alex 75%` remains
a plausible local optimum, but the threshold edge is too thin to be the main RL
target.
`action-ranking:compare-styles` now provides a direct paired style check with
deal-level confidence intervals. Over `32,768` deals with seat rotations in the
`Alex 75%` / `Alex 66%` / `Mom` table, a fresh confirmation run found
`Alex 75%` ahead on average point differential by `+0.094` with a `95%` CI of
`+0.010` to `+0.178`, and on raw score by `+0.063` with a `95%` CI of `+0.007`
to `+0.118`. The full-table score-win-share delta was still not significant
(`+0.16pp`, `95%` CI `-0.26pp` to `+0.57pp`), and the head-to-head score share
was also statistically unclear (`50.20%`, `95%` CI `49.95%` to `50.45%`).
Against the intentionally weak `No solitaire unless stuck` style, the same
comparator over `4,096` deals found a decisive sanity-check gap:
`+28.73 +/- 0.28` point differential and a `+87.78pp +/- 0.85pp`
head-to-head win-rate delta for `Alex 75%`. Strategy matters in the simulator;
the Alex threshold variants are simply very close.
A first 118-input deck-context warmup from the 108-input solitaire-context
checkpoint (`48` imitation deals, `2` epochs, `IMITATION_LR=0.005`) reached
`92.97%` teacher accuracy and saved a `730 KB` model with 23,041 parameters. It
preserved the 108-input policy in paired play (`+0.089 +/- 0.265` over 64 games)
but was not a promotion by itself, and the first tiny direct self-play
policy-gradient probe from it changed no paired heuristic-seat outcomes over 64
games while measuring `-0.229 +/- 0.229` in neural self-play. Treat the deck
context as a better feature substrate for future reward labels, not as an
already stronger policy.
A champion-mode counterfactual pairwise probe from that warmup is the first
deck-context reward-label path with a small same-direction signal. The compact
recipe (`RL_OPPONENT_MODE=champion`, greedy counterfactual states, behavior-scope
pairwise labels, `RL_COUNTERFACTUAL_SCORE_GAP_BUDGET=6`,
`RL_COUNTERFACTUAL_STOP_AFTER_LABELS=6`, weak-cycle and useful-cycle guards)
accepted 2 strong `c2s>c2s` labels, flipped both accepted-label top actions, and
over a 4-seed report measured `+0.059 +/- 0.066` paired vs the deck-context
warmup and `+0.076 +/- 0.068` in neural self-play. Scaling the same gates to a
16-label budget accepted 7 labels and improved paired heuristic-seat comparison
to `+0.130 +/- 0.083`, but neural self-play regressed to
`-0.122 +/- 0.086`; the broader batch appears to dilute the useful signal. The
next sweep should vary the compact recipe's seeds/regularization before raising
the label budget.
A no-promotion `action-ranking:tune-rl` sweep now supports that kind of check:
`RL_TUNE_DISABLE_PROMOTION=true` keeps every recipe anchored to the same starting
checkpoint, and `RL_TUNE_EVALUATE_ALL_GATES=true` runs self-play/style gates even
for near-misses. A sampled-state 3-recipe compact champion sweep on a fresh seed
tested the all-layer recipe, `RL_COUNTERFACTUAL_ANCHOR_WEIGHT=0.25`, and
return-gap pair weighting with scale `8`. None reproduced the earlier positive
paired signal: all-layer tied paired/self-play exactly, anchoring measured
`-0.013 +/- 0.013` paired and `+0.005 +/- 0.005` self-play, and return-gap
weighting measured `-0.008 +/- 0.008` paired and `+0.036 +/- 0.036` self-play.
Because that was not a strict greedy-state reproduction, do not use it as the
final verdict on the compact champion recipe. The broader lesson still holds:
the path is seed-sensitive, and the next useful work is improving label
yield/reliability before spending larger confirmation budgets.
Cycle moves now include a stock-memory proxy: the card that would become visible
after cycling, whether it can play center/solitaire/soon, whether it can connect
to the pounce card, whether the action only resets the waste pile, and the
remaining stock fraction after the cycle. These inputs are meant to let reward
labels explain when cycling is good because a remembered stock card is useful,
rather than pushing every cycle action up globally.
Cycle reset moves also expose the known card that would become visible after
resetting the waste and cycling once, so the policy can learn "reset because I
remember the next pass is useful" instead of treating all waste resets alike.
Cycle moves also include distance-weighted lookahead summaries across the
known stock order: whether a future visible stock card can play to center, can
play soon, can move to solitaire, or can act as a pounce connector. This is a
stateless memory proxy for the feed-forward model, giving it a way to value
cycling back toward a remembered card without adding recurrent network state.
A light imitation warmup from the behavior-scope checkpoint on the expanded
102-feature surface (`48` deals, `2` epochs, `IMITATION_LR=0.005`) preserved
behavior: it measured `-0.008 +/- 0.114` over 384 paired games against the
starting checkpoint, with matching `20.8%` pounce-out rate. A 2,000-state
teacher diagnostic found `99.7%` top-action agreement, with the new
`cycle.lookaheadCanPlaySoonReach` showing up in the few cycle-vs-deck-solitaire
divergences. This is not a promotion, but it confirms the lookahead inputs can
be introduced without destabilizing the current policy.
A first reliability-gated RL probe from that lookahead warmup accepted 8
behavior-changing pairwise labels after 61 greedy-state scan episodes
(`RL_COUNTERFACTUAL_ROLLOUTS=2`,
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE=1`,
`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5`), with average score gap `0.110` and
average pair weight `0.781`. It looked mildly positive against the warmup on one
384-game comparison (`+0.057 +/- 0.035`) and traced only 7 first divergences in
384 games, with `cycle>c2s` divergences usually helping on that trace seed.
Against the original behavior-scope checkpoint on the same comparison seed,
however, the candidate measured `-0.102 +/- 0.016`, so it is not promotable.
The useful lesson is narrower: lookahead features make some cycle-over-connector
corrections legible, but the warmup/RL stack still needs a stronger promotion
gate and better calibration before replacing the behavior-scope checkpoint.
The next guarded probe also drops supervised counterfactual labels where the
rollout winner and current behavior action have identical action-feature
vectors. A follow-up audit from the lookahead warmup skipped 2 unlearnable
feature-tie labels while keeping 8 accepted examples after 40 scanned greedy
episodes. Training the matching 8-label useful-cycle-guarded pairwise candidate
accepted average return gap `6.56`, skipped 2 feature ties and 1 useful-cycle
label, but still measured `-0.119 +/- 0.201` against the lookahead warmup and
`-0.065 +/- 0.137` against the behavior-scope checkpoint over 384 paired games.
So the filter improves label hygiene, not policy strength by itself.
The lookahead warmup's fixed-style check is consistent with "learned the modern
heuristic family": over 384 games per style it measured baseline-adjusted
point-differential deltas of `+1.530` vs `Mom`, `-0.065` vs `Alex-v2`,
`+0.454` vs `Alex 75%`, `-0.214` vs `Alex 66%`, and `+0.187` vs `Alex 1.0`.
That is roughly parity around the tuned Alex variants rather than an independent
new cutoff strategy.
A follow-up warmup onto the 108-input solitaire-context surface from the
lookahead checkpoint (`48` deals, `2` epochs, `IMITATION_LR=0.005`) also
preserved behavior: 99.85% top-action agreement over 2,000 teacher states and
`-0.079 +/- 0.135` against the lookahead warmup over 384 paired games, while
measuring `+0.049 +/- 0.061` against the older behavior-scope checkpoint on the
same budget. The saved JSON is about 667 KB. The comparable guarded audit from
that warmup skipped 1 feature-tie label, down from 2 in the previous lookahead
audit, and accepted a more mixed label batch including `s2s>s2s` refinements.
Training those labels with the old default imitation-continuation plus pairwise
RL regressed (`-0.603 +/- 0.144` against the 108-input warmup). Re-running as a
pure RL update avoided the large regression but still did not promote:
`-0.034 +/- 0.071` against the 108-input warmup and `-0.085 +/- 0.152` against
the behavior-scope checkpoint. The lesson is that the extra solitaire context is
useful infrastructure, but the small 8-label pairwise recipe remains too noisy
or underpowered to create a stronger deployed policy by itself.
The policy-shift diagnostic now makes that visible before full evaluation. A
guarded all-layer 16-label pairwise probe at `RL_LR=0.001` flipped 3 of 16
accepted-label greedy actions and looked positive over 384 paired games
(`+0.0417 +/- 0.0380`), but a 1,536-game confirmation rejected it
(`-0.0169 +/- 0.0222`) and traced 24 of 31 first divergences to harmful
`cycle>c2s` flips. Broadening the cycle-over-connector guard improved the shape
but still tied the warmup over 1,536 games (`-0.00065 +/- 0.0151`) with a small
raw-score gain. `RL_COUNTERFACTUAL_MAX_LABELS_PER_MOVE_PAIR` now adds a label
mix budget: the first capped probe selected 8 labels, two each from
`s2s>s2s`, `c2c>c2c`, `cycle>c2s`, and `c2s>c2s`, but measured
`-0.010 +/- 0.032` over 384 games. So label-mix budgeting is useful tooling,
not yet a promoted strategy. `RL_COUNTERFACTUAL_EXCLUDE_MOVE_PAIRS=cycle>c2s`
then confirmed the other side of the problem: excluding that pair still mined
16 labels (`s2s>s2s`, `c2c>c2c`, and `c2s>c2s`) but produced zero accepted-label
top-action flips. The remaining blocker is deciding which cycle-vs-solitaire
reward labels deserve enough trust to change deployed play, rather than simply
removing that family wholesale.
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
self-play gate budget and strictness. For exploratory sweeps where every recipe
should be checked against the same starting checkpoint, set
`RL_TUNE_DISABLE_PROMOTION=true`. Set `RL_TUNE_EVALUATE_ALL_GATES=true` to run
style/self-play gates for every recipe even when the paired promotion lower bound
does not pass. This is still a search tool; a promoted model still needs a larger
final paired comparison before replacing the current best checkpoint.

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
`RL_COUNTERFACTUAL_SCAN_SEED_COUNT` multiplies that supervised counterfactual
scan over independent seed namespaces. The first namespace still feeds the
reported episode metrics, while later namespaces only add label-mining states.
Use it when a focused label family is promising but too seed-sensitive to
produce a stable training batch from one deal/timing stream.
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
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_WINS` is the exact-count version of that gate.
With `RL_COUNTERFACTUAL_ROLLOUTS=3`, set it to `2` for a precise two-of-three
requirement or `3` for unanimity. It avoids brittle decimal thresholds such as
`0.67`, which is slightly stricter than two wins out of three.
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
`RL_COUNTERFACTUAL_PAIRWISE_FEATURE_MODE=delta` masks features that are
identical between the pairwise winner and loser before applying the supervised
pairwise gradient. The default `raw` keeps the normal full-feature update. Delta
mode is an experimental trust-region lever for same-family labels, where shared
move-type and state features can otherwise teach a broad c2s/cycle preference
instead of the destination-order difference that separated the candidates.
`RL_COUNTERFACTUAL_MAX_TRANSITIONS_PER_EPISODE` caps expensive counterfactual
rollout probes per scanned episode. When set above `0`, the scanner first uses
cheap current-policy filters, ranks eligible transitions by the top-action score
margin, and only rolls out the closest decisions. This is meant for champion and
self-play mining, where a full greedy episode can expose many legal decisions
but only a few are close enough to represent deployable policy changes.
`RL_COUNTERFACTUAL_MAX_SCORE_GAP` can skip supervised counterfactual labels when
the rollout winner is currently below the greedy action by more than that score
gap. For supervised counterfactual modes, the same cap is also applied before
rollout candidate evaluation, so far-off-policy alternatives do not spend
rollout budget just to be rejected later. This targets uncertain decisions first
and avoids asking a small batch of rollout labels to overturn strong existing
priors.
`RL_COUNTERFACTUAL_SCORE_GAP_BUDGET` adds a closest-label budget for supervised
counterfactual modes: when set above `0`, labels that pass the other filters are
sorted by the rollout winner's current score gap behind greedy, then only the
closest N are trained. It can be combined with
`RL_COUNTERFACTUAL_MAX_SCORE_GAP`: the cap filters out high-gap labels first,
then the budget keeps the closest remaining labels. This keeps the deployed-label
miner focused on near-margin behavior changes without starving every run when a
fixed score-gap cap is too narrow for the current checkpoint.
`RL_COUNTERFACTUAL_MAX_LABELS_PER_MOVE_PAIR` can cap how many accepted
supervised labels share the same winner-vs-behavior move-type pair, such as
`cycle>c2s`. It composes with `RL_COUNTERFACTUAL_SCORE_GAP_BUDGET`, selecting
near-margin labels while preventing one tactical family from dominating a tiny
batch. Training and audit output report `acceptedMovePairCounts` plus the
move-pair budget skip count.
`RL_COUNTERFACTUAL_EXCLUDE_MOVE_PAIRS` accepts a comma-separated list such as
`cycle>c2s,c2s>cycle` and skips matching supervised labels after the usual
policy-change gate. This is intended for focused ablations of a noisy tactical
family, not as a default strategy rule.
`RL_COUNTERFACTUAL_BEHAVIOR_MOVE_TYPES` accepts a comma-separated list of current
greedy behavior move types, such as `c2s` or `cycle,c2s`, and skips supervised
counterfactual states whose current behavior is outside that set before rollout.
Use it for targeted state mining, for example destination-refinement scans that
should spend rollout budget only on deck/pounce-to-solitaire decisions.
`RL_COUNTERFACTUAL_STOP_AFTER_LABELS` can stop supervised counterfactual scans
early after that many post-filter labels have been collected, while still
running at least `RL_EPISODES` episodes when episode metrics are requested. This
is useful for broad capped scans where `RL_COUNTERFACTUAL_SCAN_EPISODES` is a
high ceiling and the goal is to mine a fixed number of low-margin labels without
spending the full ceiling every run.
`RL_COUNTERFACTUAL_VALIDATION_ROLLOUTS` adds a held-out rollout gate after the
normal supervised counterfactual filters. The rollout winner must still beat the
current greedy behavior action on fresh continuation seeds before the label is
trained. `RL_COUNTERFACTUAL_MIN_VALIDATION_RETURN_GAP` sets the minimum held-out
objective gap, and `RL_COUNTERFACTUAL_MIN_VALIDATION_WINS` requires at least
that many held-out paired wins. This is disabled by default; use it when a small
label family looks promising on its mining seeds but fails larger paired/style
gates.
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
`RL_COUNTERFACTUAL_MIN_SCORE_RETURN_GAP` and
`RL_COUNTERFACTUAL_MIN_POUNCE_PROGRESS_GAP` are supervised label filters rather
than reward terms. When set above `0`, the rollout winner must beat the current
behavior action by at least that much on raw score return and/or pounce progress
return before the label is accepted. This is useful for risky cross-type probes
where point-differential rollouts should also show direct tactical support.
`RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR=true` skips supervised labels where
the rollout winner is cycling while an evaluated card-to-solitaire move has an
active post-move connector feature, directly supports the pounce card, or is a
deck move with high remaining stock and matching pounce-build parity. This is a
targeted guardrail for the observed failure mode where a small counterfactual
batch teaches broad `cycle > c2s` changes against live solitaire support moves.
It is disabled by default.
`RL_COUNTERFACTUAL_SKIP_WEAK_CYCLE_OVER_CONNECTOR=true` is the narrower version:
it only skips those cycle-over-supported-connector labels when cycling does not
beat the best evaluated supported connector on pounce progress, or when it loses
raw score in the counterfactual continuation. This keeps genuinely useful stock
delay labels available while filtering labels whose point-differential rollout
win does not show direct pounce/score support. It is disabled by default.
`RL_COUNTERFACTUAL_SKIP_SOLITAIRE_OVER_USEFUL_CYCLE=true` skips the mirror
failure mode: supervised labels where the rollout winner is a solitaire move
while an evaluated cycle action would reveal, reset toward, or look ahead to a
useful stock card. A cycle counts as useful when that card can play center
immediately, or can play soon while also connecting to the player's
pounce/solitaire shape. This is disabled by default and is intended for
self-play recipes that otherwise over-learn `c2s > cycle` from a tiny accepted
label batch.
`RL_COUNTERFACTUAL_REQUIRE_SAME_MOVE_TYPE=true` skips supervised
counterfactual labels where the rollout winner and current behavior action have
different coarse move types, such as `cycle>c2s` or `c2s>cycle`. This is useful
for destination/order refinements after cross-type labels show broad
generalization failures. Supervised collection now also uses this filter while
choosing rollout candidates, so scarce candidate slots are spent on same-family
alternatives instead of moves that would be rejected later. It is disabled by
default.
`RL_COUNTERFACTUAL_REQUIRE_DIFFERENT_MOVE_TYPE=true` applies the complementary
filter: it skips same-family labels such as `c2c>c2c`, `c2s>c2s`, and
`s2s>s2s`. Use it for strategy-shift probes like stock-memory `cycle>c2s`,
where same-family center/solitaire ordering labels would otherwise dominate a
small score-gap budget. It also prefilters rollout candidates for supervised
collection. It is disabled by default.
Supervised counterfactual modes also skip labels where the rollout winner and
the current behavior action have identical action-feature vectors. Those labels
can show up as same-move-type destination refinements, but if the model sees the
same input for both actions, the pairwise/value update is unlearnable and only
adds noise to small score-gap budgets.
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
`RL_COUNTERFACTUAL_MOVE_TYPE_ANCHOR_WEIGHT` adds a label-state distillation
anchor for same-move-type supervised labels. For each accepted label where the
rollout winner and greedy behavior share a move type, it replays the pre-update
policy's full candidate scores on that same state, using
`RL_COUNTERFACTUAL_MOVE_TYPE_ANCHOR_EXAMPLES` as a cap and
`RL_COUNTERFACTUAL_MOVE_TYPE_ANCHOR_TEMPERATURE` for the reward-target
softness. This is narrower than the general anchor: it is meant to let
destination/order labels fight within a move family while discouraging hidden
layer drift that changes unrelated move-family boundaries.
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
actions, but the first flips are not better. The budget and cap now compose, so
the next sweep can scan broadly with `RL_COUNTERFACTUAL_SCORE_GAP_BUDGET` while
still enforcing a wider but real `RL_COUNTERFACTUAL_MAX_SCORE_GAP` such as
`0.25` or `0.5`. A 24-episode capped champion probe with
`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5` found only 2 usable labels, skipped 306
high-gap labels, and tied the baseline exactly over 384 paired games. A
96-episode capped scan then timed out after 8 minutes before producing output,
so `RL_COUNTERFACTUAL_STOP_AFTER_LABELS` was added to make high-ceiling
low-margin scans practical: use a large scan ceiling with a cap and stop once
the desired number of accepted labels has been mined.
With that early stop, a capped audit targeting 8 labels
(`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5`,
`RL_COUNTERFACTUAL_SCORE_GAP_BUDGET=8`,
`RL_COUNTERFACTUAL_STOP_AFTER_LABELS=8`) stopped after 34 scanned episodes,
accepted labels with average score gap `0.208`, and showed a cycle-heavy label
mix: 4 of 8 winners were `cycle > c2s`. Training those labels with a stronger
behavior-scoped pairwise update moved only 2 of 3,759 diagnosed decisions and
measured `-0.103 +/- 0.161` over 384 paired games. Adding
`RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR=true` produced a cleaner label mix
after 56 scanned audit episodes, skipping 89 connector/cycle labels; the
corresponding pairwise run stopped after 22 scanned training episodes and tied
the baseline at `-0.0017 +/- 0.0087` over 384 paired games. That is the best
shape so far: capped low-margin, connector-guarded labels avoid the clear
regressions, but single-rollout labels still do not pull ahead. The next
candidate should spend rollout budget on reliability, for example
`RL_COUNTERFACTUAL_ROLLOUTS=3`,
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE=1`, and a modest stop-after-label
target.
The capped low-margin path now prefilters by `RL_COUNTERFACTUAL_MAX_SCORE_GAP`
before rollout, which makes reliability probes much cheaper. A two-label audit
with `RL_COUNTERFACTUAL_ROLLOUTS=2`,
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_WIN_RATE=1`,
`RL_COUNTERFACTUAL_MAX_SCORE_GAP=0.5`,
`RL_COUNTERFACTUAL_SCORE_GAP_BUDGET=2`,
`RL_COUNTERFACTUAL_STOP_AFTER_LABELS=2`, and
`RL_COUNTERFACTUAL_SKIP_CYCLE_OVER_CONNECTOR=true` reached the label target
after one scanned episode instead of the earlier 16-episode, roughly one-minute
scan. The matching four-label behavior-scoped pairwise training run reached its
target after 31 scanned episodes, accepted average score gap `0.241`, and
applied four weighted updates, but measured `-0.515 +/- 0.082` over 384 paired
games against the behavior-scope checkpoint. The runtime bottleneck is improved;
label quality and update calibration are still the blocker before this path can
promote a stronger policy.
The 108-feature warmup line now has richer move-pair audit summaries and a
narrower `RL_COUNTERFACTUAL_SKIP_WEAK_CYCLE_OVER_CONNECTOR` guard. A strict
near-margin audit using the current solitaire-context warmup model kept two
`cycle>c2s` labels because both beat the evaluated connector on pounce progress
and raw score; a looser broad audit skipped 13 weak cycle-over-connector labels,
showing the guard filters the intended shape without globally banning stock-delay
labels. A small all-layer pairwise candidate using the weak guard plus the
useful-cycle mirror guard accepted only 7 labels (`cycle>c2s:3`, `c2c>c2c:3`,
`c2s>c2s:1`) and moved 2 label-state top actions. It measured essentially
neutral but not promotable against the 108-feature warmup checkpoint over 384
paired games (`-0.005 +/- 0.062` point differential, `+0.052` raw score).
Tracing found 9 first divergences, 6 of them `cycle>c2s`; those averaged
positive point differential and better pounce remaining, but still included
large losses when behind with 13 pounce cards. The guard is a useful filter, but
we still need better reliability/state-context selection before training
cycle-over-connector labels hard.
The next check shifted away from cross-type cycling and mined same-type solitaire
destination refinements with `RL_COUNTERFACTUAL_REQUIRE_SAME_MOVE_TYPE=true`,
`RL_COUNTERFACTUAL_EXCLUDE_MOVE_PAIRS=c2c>c2c`, and a pounce-progress support
gap. A 64-episode audit found one clean `c2s>c2s` label: `pounce->stack:2` over
`pounce->stack:0`, only `0.008` policy-score points behind, with `+6.73`
rollout point-differential gap, `+2.6` raw-score gap, and `+2.2` pounce-progress
gap. Training shards did not find any accepted labels, even after a stronger
pairwise update recipe, so this looks like a promising but very sparse strategic
shape. The same/different move-type filters now prefilter rollout candidate
slots; the audit's mismatch skips dropped to zero, but the next improvement still
needs targeted state mining rather than stronger updates.
`RL_COUNTERFACTUAL_BEHAVIOR_MOVE_TYPES=c2s` is now available for that next pass:
it skips off-family greedy states before rollout so broad scans can spend their
budget on solitaire-destination decisions instead of unrelated center/cycle
states. In the same 64-episode audit, it skipped 2,944 off-family states before
rollout, kept the known `c2s>c2s` label, and cut wall-clock time from roughly
140 seconds to about 10 seconds. A 512-episode focused audit found two clean
`c2s>c2s` labels with average `+5.47` point-differential gap, `+3.3` raw-score
gap, and `+2.1` pounce-progress gap. Training is still delicate: an unanchored
all-layer pairwise update flipped its label state but leaked into `c2s>cycle`
decisions, while an output-only update was too weak to flip the label state.
Adding policy anchoring reduced deployed changes to 5 first divergences in 768
traced games, mostly same-family or mixed, but the quick gate was still slightly
negative (`-0.013 +/- 0.013`). The useful next shape is anchored or otherwise
regularized same-family destination learning, not an unanchored c2s preference.
The next near-margin destination pass added `RL_COUNTERFACTUAL_MAX_POLICY_MARGIN`
and `RL_COUNTERFACTUAL_MAX_SCORE_GAP` caps at `0.25`, which kept the c2s-only
scan focused on deployed, learnable states instead of hundreds of far-off-policy
destination preferences. With the behavior move filter, same-type filter, and
pounce-progress support gap, a 512-episode audit kept 7 clean `c2s>c2s` labels
with average policy-score gap `0.104` and average pounce-progress support
`+2.43`. Training on the matching 13-label batch moved 5 of 13 label-state top
actions without anchoring, but a 4-seed / 1,536-game paired comparison measured
`-0.016 +/- 0.022` point differential and `-0.077` raw score. The new
move-type label-state anchor applied 13 distillation anchors and moved 4 of 13
label states; one 768-game paired seed was mildly positive (`+0.064 +/- 0.051`),
but tracing still showed move-family drift, mostly `cycle>c2s`, and it is not a
promotion candidate. This confirms the useful label shape is real but still
sparse and calibration-sensitive; the next improvement should collect more
near-margin same-family labels and validate them across multiple seeds before
harder updates.
`RL_COUNTERFACTUAL_SCAN_SEED_COUNT=4` now broadens that same c2s-destination
scan without changing the metric episode count. The 512x4 audit scanned 2,048
episodes and kept 34 clean `c2s>c2s` labels with average return gap `+7.27`,
average policy-score gap `0.079`, and average pounce-progress support `+2.27`.
The matching training pass accepted 30 labels. An unanchored all-layer update
flipped 11 label states but leaked badly into `c2s>cycle` deployment changes
and measured `-0.093 +/- 0.180` over 1,536 paired games. The move-type
label-state anchor reduced that to statistical neutrality
(`-0.017 +/- 0.167`) and made divergence traces less ugly, while output-only
updates were effectively no-ops (`-0.003 +/- 0.009` with 99.7% tied point
differentials). The immediate takeaway is good news but not a promotion: label
mining is no longer the main blocker for this family; the next blocker is a
tighter trust-region or feature-local update that can learn c2s destination
ordering without perturbing coarse move-family and unrelated center ordering.
The first feature-local attempt added
`RL_COUNTERFACTUAL_PAIRWISE_FEATURE_MODE=delta`, which zeros pairwise features
shared by the rollout winner and behavior action before applying the preference
gradient. Delta alone was worse over the same 30-label batch
(`-0.071 +/- 0.051`) even though its trace made `cycle>c2s` divergences helpful;
the damage moved to noisy `c2s>c2s` ordering. Combining delta with the broad
policy anchor (`RL_COUNTERFACTUAL_ANCHOR_WEIGHT=0.5`,
`RL_COUNTERFACTUAL_ANCHOR_EXAMPLES=1024`) tied point differential exactly over
1,536 paired games, with small positive raw score (`+0.024`) and pounce-out
nudges. Its trace still skewed negative on first divergences, especially
same-family c2s choices, so this is useful trust-region infrastructure rather
than a promoted policy. The next likely step is label reliability for c2s
destination ordering itself, not more generic anti-drift regularization.
That label-reliability pass used three continuations per candidate. Requiring
unanimity was too sparse: a 256x2 audit accepted only two labels without the
standard-error lower bound, and one label with it. The practical threshold is
two wins out of three, now represented exactly as
`RL_COUNTERFACTUAL_MIN_BEHAVIOR_WINS=2` rather than a rounded win-rate. Scaling
that shape to 512x4 accepted 17 `c2s>c2s` labels with average return gap
`+6.77`, behavior win-rate `0.88`, raw-score support `+4.02`, and pounce
progress `+1.78`. Delta plus broad anchoring moved only 4 of 17 label states and
looked promising in the first 1,536-game paired gate (`+0.060 +/- 0.084`) with a
positive divergence trace, but an 8-seed / 3,072-game confirmation rejected the
signal (`-0.004 +/- 0.047`, raw score `-0.021`). The c2s destination path is
now well controlled, but still not a statistically stronger policy; the next
step should either improve the objective/horizon for those labels or switch to a
broader self-play/champion training signal.
A smoke champion-mode pass from the 130-input threat-context warmup now uses
the same frozen-opponent setup in both training and label audit. The narrow
`0.25` policy-margin recipe with 2-rollout unanimous behavior support found one
accepted `c2c>c2c` label, flipped that label state, and measured
`+0.019 +/- 0.024` over 1,536 paired heuristic-seat games. A trace saw first
divergences in only `1.43%` of games; those divergences averaged `+1.88`
points, mostly from `c2c>c2c`, but the sample was just 11 divergences. Widening
the policy-margin cap to `0.5` found two `c2s>c2s` labels but flipped no
accepted label states, traced only one divergence in 384 games, and measured
slightly negative over 768 paired games (`-0.031 +/- 0.052`). So champion RL is
not blocked by wiring anymore, but the label stream is still too sparse for a
deployed strategic jump. The next useful work is improving label throughput or
using a targeted high-yield deployed-state miner before spending large
confirmation budgets.
`RL_COUNTERFACTUAL_MAX_TRANSITIONS_PER_EPISODE` now provides that deployed-state
miner. On the same champion `0.5` policy-margin recipe, a budget of `4`
transitions per episode was too narrow and missed the known labels, while a
budget of `12` recovered the two accepted `c2s>c2s` labels from the unbudgeted
32-episode run while skipping 596 otherwise eligible transitions. Scaling the
budgeted scan to a high ceiling with `RL_COUNTERFACTUAL_STOP_AFTER_LABELS=8`
reached 8 labels after 58 scanned episodes (`c2c>c2c:5`, `c2s>c2s:2`,
`s2s>s2s:1`), with average return gap `+3.44`, unanimous 2-of-2 behavior wins,
and average policy score gap `0.156`.

Training that 8-label champion batch with delta pairwise features, return-gap
weights, and a broad policy anchor moved only 1 of 8 accepted label states at
`RL_LR=0.001`; its 1,536-game gate was mildly positive but noisy
(`+0.027 +/- 0.049`) and its first-divergence trace skewed negative. Doubling
the learning rate to `0.002` moved 2 of 8 label states and produced a much
cleaner trace (`5.2%` first-divergence rate, `+2.08` average point differential
on divergences), but the larger 3,072-game confirmation still did not promote
(`+0.019 +/- 0.025`, raw score `+0.021`). The budgeted champion path is now
fast enough to iterate and can find real deployed-near labels, but the current
same-family center/solitaire batch is still a thin signal rather than a stronger
policy.

A targeted cross-type champion audit using the transition budget found a more
interesting but still thin stock-tempo signal. A strict `c2s`/`cycle` scan with
policy-change, behavior-win, raw-score, and pounce-progress gates found no
labels over 96 episodes. Relaxing the score/progress gates and scanning 128
episodes with 16 transitions per episode accepted three `cycle>c2s` labels; all
three preferred cycling over a deck-to-solitaire connector, with average return
gap `+10.22`, average raw-score support `+10.17`, and average pounce-progress
support `+4.83`. Training that 3-label batch from the 130-input threat-context
warmup flipped all three accepted label states, but the 1,536-game paired gate
was neutral (`+0.003 +/- 0.040`). Its trace stayed mostly localized
(`3.1%` first-divergence rate, 20 of 24 first divergences were `cycle>c2s`) and
the `cycle>c2s` divergences averaged positive point differential, but they still
split `40%` model-A wins to `55%` baseline wins on that trace seed. Treat this
as evidence that stock-memory `cycle>c2s` labels exist, not as a promoted
strategy.

Increasing the strict cross-type scan to 512 episodes with a 24-transition
per-episode budget found seven clean `cycle>c2s` labels instead of one: average
return gap `+8.07`, raw-score support `+3.71`, pounce-progress support `+2.79`,
and average policy score gap `0.221` against cycling. A broad-anchor training
pass (`anchor=0.75`, 1,024 anchor examples) moved only 1 of 7 label states and
measured neutral (`-0.003 +/- 0.058`). A deliberately low-anchor diagnostic
(`anchor=0.1`, 512 anchor examples, `RL_LR=0.003`, 10 epochs) moved 5 of 7 label
states and produced the first statistically positive paired heuristic-seat
confirmation from this path: over 3,072 paired games it measured
`+0.101 +/- 0.070` point differential, `+0.093` raw score, a `+0.39pp`
pounce-out-rate delta, and only a `+0.15pp` cycle-rate delta. Its 768-game trace
also had the right shape: `7.6%` first-divergence rate, 41 of 58 first
divergences were `cycle>c2s`, and those averaged `+1.42` point differential
with model-A wins at `58.5%` versus `36.6%` for the baseline. A tiny 192-game
neural self-play smoke was positive (`+0.259`) but too small for promotion. This
candidate is promising enough for a larger self-play/style gate, but the
low-anchor setting should still be treated as exploratory until that gate passes.

The larger gates rejected that early stock-tempo candidate. Its style-safety run
found a meaningful regression against `Mom` (`-0.118` baseline-adjusted point
differential with a 95% CI of roughly `-0.166` to `-0.070`). Adding a symmetric
connector/cycle anchor fixed the style-regression shape and looked positive in a
small paired/self-play gate, but the 3,072-game confirmation erased the signal
(`-0.001 +/- 0.043`). A multiseed low-anchor version accepted eight strict
labels and was cleaner by style, yet its 3,072-game confirmation was still
statistically unclear (`+0.037 +/- 0.090`, raw score nearly flat). Expanding the
strict cross-type budget to 13 accepted `cycle>c2s` labels flipped every label
state but also pushed the margin too hard; its first 1,536-game gate stayed
noisy (`+0.049 +/- 0.155`) with slightly negative raw score. The takeaway is
that the stock-delay label family is real, but not yet robust enough to promote:
the next useful work is either better label reliability/horizon selection or a
tighter trust-region that changes fewer unrelated deck/solitaire priorities.
Held-out validation is now wired into that reliability path. Re-running the
strict `cycle>c2s` scan with two fresh validation continuations per accepted
label rejected 6 would-be labels and kept 3 `cycle>c2s` labels; the survivors
had average mining gap `+10.44`, average held-out gap `+4.56`, and 2/2 held-out
wins. A matching low-anchor training pass accepted 5 validated labels and
flipped all accepted label states, but its first paired gate stayed noisy
(`+0.039 +/- 0.196`, raw score `+0.080`) and its style-safety aggregate was
slightly negative (`-0.021 +/- 0.162`, despite raw score `+0.156`). So held-out
validation is useful label-quality infrastructure, not a promotion by itself;
the next update needs a narrower trust region or a broader validated label
batch before spending large confirmation budgets.

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
