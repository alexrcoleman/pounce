# Pounce Online

This is a project to simulate the game Nertz / Pounce. It includes some online multiplayer logic to allow for competitive play with friends, as well as some Bots for local or online practice. There is also a "Simulation Mode" to rapidly simulate Bots playing against each other to analyze various strategies.

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
