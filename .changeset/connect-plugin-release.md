---
'@kestack/cli-platform': patch
---

- `@kestack/cli-platform`: new `Downloads.use(key)` marks an entry used now. `ActorPlugin` marks the downloaded file it runs every day, so `Downloads.prune` from any CLI on the computer never deletes a running Plugin's file.
