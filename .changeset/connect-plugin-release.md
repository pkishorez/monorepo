---
'@kestack/connect': patch
---

- `@kestack/cli-platform`: `Downloads.use(key)` marks an entry used, so a running Plugin's file is never pruned.
- `ke-connect serve` deletes downloads unused for 30 days. cloudflared is pinned to 2026.10.3.
- A deploy ships the code Plugin to R2, and Cloud Connect serves it at `/plugins/<name>/<sha256>.mjs`.
- Code shows when a Connection's Plugin is updating or stopped, and when `ke-connect` needs an update.
- The dev script runs `ke-connect` as `dev-<branch>` and removes Connections of deleted branches.
