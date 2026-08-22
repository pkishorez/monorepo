---
'std-toolkit': patch
---

Add `version` to `createStdSync`. When the stored version differs from the configured one (including clients that never had one), the Sync Store is emptied before anything is served, so a wiped or re-shaped backend never meets a stale local replica.
