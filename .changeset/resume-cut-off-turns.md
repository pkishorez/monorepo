---
'@kestack/connect': patch
'@kestack/ai-toolkit': patch
'code': patch
---

A Turn cut off by Connect stopping is Resumed once when Connect starts again.

- The Bootstrap Sweep still ends a Turn left running as `interrupted`, then starts a new Turn on that Session with a fixed prompt asking the agent to check what it was changing and continue. A Turn that was itself Resumed, or whose agent never gave its native id, is only ended. Cancelled and failed Turns are left as they ended.
- The engine's `turn.started` Raw and the `turnStarted` Part carry `resumed: true` for a Resumed Turn. `MessageSchema` is at `v2` for it; `v1` Messages read unchanged.
- The Store's `lastRaw` is now `lastTurn`: the Raw of a Session's newest Turn.
- Code shows "Resumed after Connect restarted" in place of the prompt Connect sent.
