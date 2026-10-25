---
'@kestack/connect': patch
---

`./dev` runs one Connect per branch, shared by every App's `pnpm dev`: `ensureConnect` starts it detached or reuses it and takes a lease, `withConnect` runs an App against it, and it stops 3 s after the last lease is gone. `runConnectDev` attaches when one already runs.
