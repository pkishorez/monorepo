---
'laymos': patch
---

`laymos stories` no longer hangs after a Story that leaves background work in a scope. Each question now carries a `run` that runs its proof on the Story file's own copy of `effect`. Before, the runner ran proofs on its own copy, and because each copy numbers its fibers from zero, closing a scope could skip interrupting a fiber that had the same id as the closing one.
