---
'@kestack/connect': patch
'@kestack/ai-toolkit': patch
---

A Turn cut off by Connect stopping is resumed once when Connect starts again.

- The `turnStarted` Part carries `resumed: true`; `MessageSchema` is at v2, and v1 reads unchanged.
- The Store's `lastRaw` is `lastTurn`.
- Code shows "Resumed after Connect restarted".
