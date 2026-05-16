# Agent Notes

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
