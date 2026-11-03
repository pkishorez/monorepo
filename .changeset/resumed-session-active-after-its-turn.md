---
'@kestack/connect': patch
---

A Session Resumed on start is active from after its cut-off Turn ended, never a moment before.

**Fixed**

- The Bootstrap Sweep set a Resumed Session's `activeAt` from the time it read before stamping the Turn's `turn.ended`, so it could come out a millisecond before its own `endedAt`.
