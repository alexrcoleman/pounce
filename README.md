# Pounce Online

This is a project to simulate the game Nertz / Pounce. It includes some online multiplayer logic to allow for competitive play with friends, as well as some Bots for local or online practice. There is also a "Simulation Mode" to rapidly simulate Bots playing against each other to analyze various strategies.

## Neural action-ranking training

The action-ranking prototype trains a small neural network to score the legal
moves generated from each board state. It first imitates the existing heuristic
bot, then optionally fine-tunes with rollout reward against teacher bots.

```powershell
npm run action-ranking:examples
npm run action-ranking:train
```

Useful training knobs:

- `IMITATION_DEALS`, `IMITATION_EPOCHS`, `IMITATION_LR`, `IMITATION_EQUIVALENT_TARGETS`
- `IMPROVEMENT_STATES`, `IMPROVEMENT_STATE_SOURCE`, `IMPROVEMENT_STATE_TEMPERATURE`, `IMPROVEMENT_STATE_SAMPLE`, `IMPROVEMENT_CANDIDATES`, `IMPROVEMENT_ROLLOUT_MOVES`, `IMPROVEMENT_ROLLOUT_COUNT`, `IMPROVEMENT_COMMON_RANDOM`, `IMPROVEMENT_MODE`, `IMPROVEMENT_MIN_RETURN_GAP`, `IMPROVEMENT_MAX_PAIRS`, `IMPROVEMENT_PREFERENCE_TEMPERATURE`, `IMPROVEMENT_PREFERENCE_SCOPE`, `IMPROVEMENT_VALUE_SCALE`, `IMPROVEMENT_VALUE_CENTER`, `IMPROVEMENT_VALUE_HUBER`, `IMPROVEMENT_REQUIRE_BEHAVIOR_GAP`, `IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT`, `IMPROVEMENT_EPOCHS`, `IMPROVEMENT_LR`, `IMPROVEMENT_TEMPERATURE`
- `RL_EPISODES`, `RL_LR`, `RL_TEMPERATURE`, `RL_LOCAL_REWARD_WEIGHT`, `RL_LOCAL_REWARD_DISCOUNT`, `RL_BASELINE_MODE`, `RL_COMMON_RANDOM`, `RL_CREDIT_MODE`, `RL_COUNTERFACTUAL_ROLLOUTS`, `RL_COUNTERFACTUAL_ROLLOUT_MOVES`, `RL_COUNTERFACTUAL_CANDIDATES`, `RL_COUNTERFACTUAL_MIN_RETURN_GAP`, `RL_COUNTERFACTUAL_MODE`, `RL_COUNTERFACTUAL_PREFERENCE_SCOPE`, `RL_COUNTERFACTUAL_VALUE_SCALE`, `RL_COUNTERFACTUAL_VALUE_CENTER`, `RL_COUNTERFACTUAL_VALUE_HUBER`, `RL_UPDATE_EPOCHS`, `RL_UPDATE_SCOPE`, `RL_NORMALIZE_ADVANTAGES`, `RL_ADVANTAGE_CLIP`
- `PLAYERS`, `HIDDEN`, `HIDDEN_LAYERS`, `MAX_MOVES`, `SEED`
- `HIDDEN` and `HIDDEN_LAYERS` accept comma-separated layer sizes, for example `HIDDEN=192,96`
- `MODEL_OUT=C:\tmp\pounce-action-ranking-model.json` to save model weights
- `MODEL_IN=...\model.json npm run action-ranking:train` to fine-tune saved weights
- `MODEL_IN=...\model.json npm run action-ranking:evaluate` to evaluate saved weights
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:compare` to compare two models on paired deals/seats
- `MODEL_A=...\candidate.json MODEL_B=...\baseline.json npm run action-ranking:diagnose` to compare top-ranked actions on sampled teacher states
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
agreement, teacher-action agreement, move-type deltas, feature deltas, and a few
concrete disagreements. `DIAG_DEALS`, `DIAG_MAX_EXAMPLES`,
`DIAG_MAX_DISAGREEMENTS`, and `DIAG_TOP_FEATURES` control the sample size and
output detail. This is useful for seeing whether a candidate is actually
changing center-vs-solitaire choices, pounce-card urgency, connector behavior,
or opponent-helping center plays before spending time on a large paired rollout.

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
the search budget and verification strength. Set `CONFIRM_GAMES` above `0` to
run a held-out confirmation comparison for search-passing candidates and
near-misses whose search lower bound is at least `CONFIRM_TRIGGER_MIN_DELTA`;
`CONFIRM_RUNS`, `CONFIRM_MIN_DELTA`, and `CONFIRM_SE_MULTIPLIER` control that
second gate. As with the manual comparisons below, this is still a search tool;
a promoted model still needs a larger final paired comparison before replacing
the current best checkpoint.

`IMPROVEMENT_STATES` enables the counterfactual rollout pass: it samples
teacher-game states, tries several legal actions, lets the teacher finish from
each candidate, and trains from the resulting soft reward targets. By default,
candidate actions in the same state now share continuation randomness; increasing
`IMPROVEMENT_ROLLOUT_COUNT` averages multiple continuations per candidate.
`IMPROVEMENT_STATE_SOURCE=policy` instead collects examples only from states
reached by the current neural policy in one rotating seat while teacher bots play
the other seats, which is useful for fine-tuning where the model actually acts.
`IMPROVEMENT_REQUIRE_BEHAVIOR_GAP=true` keeps only rollout states where the best
counterfactual action beats the behavior action by at least
`IMPROVEMENT_MIN_BEHAVIOR_IMPROVEMENT` point differential. That targeted mode is
most useful with policy-sourced states because it avoids training on decisions
where the current greedy or sampled behavior is already tied with the best
rollout candidate.
Early 80-state policy-source pairwise runs changed more relevant decisions but
still did not beat the imitation checkpoint in paired comparison.
`IMPROVEMENT_MODE=pairwise` trains only clear rollout-return preferences, using
`IMPROVEMENT_MIN_RETURN_GAP` and `IMPROVEMENT_MAX_PAIRS` to ignore low-signal
candidate differences. `IMPROVEMENT_PREFERENCE_SCOPE=behavior` narrows pairwise
updates to the best rollout action versus the recorded behavior action, which is
useful when policy-state examples are meant to correct the model's own decisions
instead of reshaping every candidate comparison in the state. Larger or more
aggressive improvement passes have overcorrected in early tests.
`IMPROVEMENT_MODE=value` instead treats each candidate's rollout point
differential as an action-value target and regresses the policy score toward it.
Targets are centered per state by default, then divided by
`IMPROVEMENT_VALUE_SCALE`; `IMPROVEMENT_VALUE_HUBER` can clip large regression
errors. This Q-style mode is useful for testing whether the network can learn
relative action values without converting every state into hard pairwise labels.

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
`RL_COUNTERFACTUAL_PREFERENCE_SCOPE=behavior` narrows pairwise labels to the
best rollout candidate versus the current greedy behavior action; the default
`all` trains the clearest candidate pair in each state.
`RL_COUNTERFACTUAL_MODE=value` uses the same counterfactual returns as
action-value regression targets. The value target scale, centering, and Huber
clipping are controlled by
`RL_COUNTERFACTUAL_VALUE_SCALE`, `RL_COUNTERFACTUAL_VALUE_CENTER`, and
`RL_COUNTERFACTUAL_VALUE_HUBER`.

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
behavior metrics. Treat that as noise or an update too small to affect greedy
play, not as an RL improvement.

Legacy model feature expansion is now enabled before fine-tuning. Re-running the
240-state behavior-scope recipe from the capacity checkpoint produced a 48-input
checkpoint and trained small nonzero weights on the newer connector/alternative
features, but its greedy behavior was identical to the prior 45-input
behavior-scope checkpoint over 384 paired games. That makes feature expansion
safe infrastructure, not a standalone policy improvement yet.

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
