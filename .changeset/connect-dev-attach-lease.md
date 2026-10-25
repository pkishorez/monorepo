---
'@kestack/connect': patch
---

Connect's own `pnpm dev` takes its lease on a running Connect under the same lock that saw it running, so it no longer attaches to a Connect that is about to stop.
