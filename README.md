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
- `IMPROVEMENT_STATES`, `IMPROVEMENT_CANDIDATES`, `IMPROVEMENT_ROLLOUT_MOVES`, `IMPROVEMENT_ROLLOUT_COUNT`, `IMPROVEMENT_COMMON_RANDOM`, `IMPROVEMENT_MODE`, `IMPROVEMENT_MIN_RETURN_GAP`, `IMPROVEMENT_MAX_PAIRS`, `IMPROVEMENT_PREFERENCE_TEMPERATURE`, `IMPROVEMENT_EPOCHS`, `IMPROVEMENT_LR`, `IMPROVEMENT_TEMPERATURE`
- `RL_EPISODES`, `RL_LR`, `RL_TEMPERATURE`, `RL_LOCAL_REWARD_WEIGHT`, `RL_LOCAL_REWARD_DISCOUNT`, `RL_NORMALIZE_ADVANTAGES`, `RL_ADVANTAGE_CLIP`
- `PLAYERS`, `HIDDEN`, `HIDDEN_LAYERS`, `MAX_MOVES`, `SEED`
- `HIDDEN` and `HIDDEN_LAYERS` accept comma-separated layer sizes, for example `HIDDEN=192,96`
- `MODEL_OUT=C:\tmp\pounce-action-ranking-model.json` to save model weights
- `MODEL_IN=...\model.json npm run action-ranking:train` to fine-tune saved weights
- `MODEL_IN=...\model.json npm run action-ranking:evaluate` to evaluate saved weights
- `EVAL_RUNS=4` or `EVAL_SEEDS=seedA,seedB` to evaluate saved weights across multiple seeds
- `POUNCE_NEURAL_AI_MODEL=...\model.json npm run dev` to run Socket.IO bots with saved weights

Evaluation output includes same-seat teacher baseline metrics plus behavior
diagnostics such as decision count, center/solitaire/cycle move rates, pounce
remaining, and pounce-out rate. The model loader accepts both the original
single-hidden-layer checkpoint format and the newer multi-layer format.

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

`IMPROVEMENT_STATES` enables the counterfactual rollout pass: it samples
teacher-game states, tries several legal actions, lets the teacher finish from
each candidate, and trains from the resulting soft reward targets. By default,
candidate actions in the same state now share continuation randomness; increasing
`IMPROVEMENT_ROLLOUT_COUNT` averages multiple continuations per candidate.
`IMPROVEMENT_MODE=pairwise` trains only clear rollout-return preferences, using
`IMPROVEMENT_MIN_RETURN_GAP` and `IMPROVEMENT_MAX_PAIRS` to ignore low-signal
candidate differences. Larger or more aggressive improvement passes have
overcorrected in early tests. RL fine-tuning is wired in with batch-normalized,
clipped advantages and optional discounted local reward-to-go, but conservative
runs tested so far have mostly preserved the imitation checkpoint rather than
clearly improving it.

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
