# Agent Notes

## Main Integration Workflow

Use a branch-based flow for all non-trivial changes. Treat `origin/main` as the source of truth and the integration target; treat local `main` as a convenience mirror only.

- Do not commit directly to local `main`. Local `main` should stay clean and should only move by fast-forwarding to `origin/main`.
- Start new worktrees from `origin/main`, not from whatever local `main` currently points at:

```powershell
git fetch origin
git worktree add -b codex/<topic> <path> origin/main
```

- In an existing detached worktree, create a branch before committing:

```powershell
git fetch origin
git switch -c codex/<topic> origin/main
```

- Keep feature branches current by rebasing or merging `origin/main` into the branch, then rerun the relevant checks before integration.
- Prefer integrating by pushing the branch and merging it into `main` through the remote:

```powershell
git push -u origin codex/<topic>
```

- If intentionally integrating from the command line without a PR, update the branch against `origin/main`, run checks, then fast-forward the remote `main` directly from the branch. This avoids using local `main` as an intermediate merge target:

```powershell
git fetch origin
git rebase origin/main
npx.cmd tsc --noEmit
git push origin HEAD:main
```

The push should reject if `origin/main` moved after the fetch; fetch, rebase, recheck, and retry rather than forcing it.

### Local Main Mirror

The checkout at `C:\Users\alexr\code\pounce` currently owns local `main`, so refresh local `main` from that checkout only:

```powershell
git -C C:\Users\alexr\code\pounce fetch origin
git -C C:\Users\alexr\code\pounce switch main
git -C C:\Users\alexr\code\pounce pull --ff-only
```

New worktrees should still start from `origin/main` after `git fetch origin`, so a stale local `main` does not block parallel work. If the local checkout is not being used for development, it is fine to leave it clean on `main`; it does not need to participate in merges.

## Dev Server / Build Setup

- Use `npm run dev` for the full local app. It starts Next on port `3000` and the Socket.IO server on port `3001`.
- For UI-only checks, especially `/offline`, running just Next is usually enough:

```powershell
npx.cmd next dev -p 3010
```

- After a production build, a Next-only server can also be started on an alternate port:

```powershell
npx.cmd next start -p 3010
```

### Stale Next Process / Cache Issue

If Next prints its banner but never reaches `Ready`, browser or `curl` requests to `/offline` hang or reset, or `npm run build` stalls at `Creating an optimized production build ...`, first suspect a stale Next process or locked `.next` cache from an interrupted run.

Do not kill every `node.exe`; other repos may be using Node. Inspect only Pounce-related commands:

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like '*\code\pounce*' -and
    ($_.CommandLine -like '*next*' -or
      $_.CommandLine -like '*ts-node-dev*' -or
      $_.CommandLine -like '*concurrently*')
  } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine
```

Stop only the stale Pounce PIDs:

```powershell
Stop-Process -Id <pid>,<pid> -Force
```

Then clear the generated Next cache, with a path guard:

```powershell
$root = Resolve-Path -LiteralPath .
$next = Resolve-Path -LiteralPath .next -ErrorAction SilentlyContinue
if ($next -and $next.Path.StartsWith($root.Path)) {
  Remove-Item -LiteralPath $next.Path -Recurse -Force
}
```

After that, rerun `npm run build` or start Next again.

### Port Notes

Port `3000` may already be occupied on this machine. Check listeners before assuming the app is stuck:

```powershell
netstat -ano | Select-String ':3000|:3001|:3010'
```

If only the Next UI needs verification, prefer an alternate port such as `3010`.

## Verification Caveat

`npm run lint` currently fails because `.eslintrc.json` extends `next/core-web-vitals`, but the local install cannot load that config. `npx.cmd tsc --noEmit` is the reliable type check. `npm run build` still completes while reporting the ESLint config warning.
