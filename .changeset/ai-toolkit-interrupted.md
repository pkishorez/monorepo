---
'@kestack/ai-toolkit': patch
---

A session the server stopped mid-turn is now `interrupted`, not `idle`: a stop writes nothing, and the next start ends its turn with `turn.ended { interrupted }` and marks the session. Nothing restarts on its own; the next message resumes the agent by its native id. A session also keeps how its last turn ended as its status, so `Session.status` is now `idle | running | cancelled | failed | interrupted`, and `TurnEndStatus` gains `interrupted`. Removing a project stops its sessions' agents without writing `cancelled`.
