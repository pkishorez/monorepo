---
'@kestack/cli-platform': patch
'@kestack/connect': patch
---

- `@kestack/cli-platform`: new `Downloads.use(key)` marks an entry used now. `ActorPlugin` marks the downloaded file it runs every day, so `Downloads.prune` from any CLI on the computer never deletes a running Plugin's file.
- `ke-connect serve` deletes the shared downloads no Connection has used for 30 days as it starts.
- cloudflared is pinned to 2026.10.3, kept as `cloudflared-2026.10.3` in the shared cache; it was whatever release was latest when first downloaded.
- Development: the dev script runs this checkout's `ke-connect serve` as a process of its own, and names each branch's Connection `dev-<branch>` (`dev-<branch>-real` with real sign-in), clear of `main`. As it starts, it removes the `dev-` Connections of branches with no checkout any more, as `ke-connect remove` does. `./dev` lives in `src/connection/cli/dev`; its exports are unchanged.
