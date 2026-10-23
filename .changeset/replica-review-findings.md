---
'@kestack/ai-toolkit': patch
'@kestack/std-toolkit': patch
'code': patch
---

Fixes from review. A Codex steer's model and settings, which `turn/steer` cannot carry, go with the session's next `turn/start`. A cancel the agent never answers ends the Turn after the grace all the same, and a Turn ended that way still writes its `turn.ended`. `newToOld` no longer joins two stretches whose ends merely share a `_u`, so records between them are not skipped on reopen. In the app, each message sent is kept apart until the server answers it, so one refused comes back whole even when another was sent meanwhile; and a Fork's inherited history runs to the last end its agent reported for the Turn, not the first.
