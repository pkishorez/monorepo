---
status: superseded by rpc-toolkit ADR-0002
---

# RPC authorization inherits by specificity

Effect RPC authentication and authorization declarations apply to both RPCs and groups. An RPC inherits its group's authorization policy only when it has no policy of its own; the nearest declaration wins rather than implicitly combining policies. Consumers explicitly compose multiple requirements inside their own Effect-returning policy when they need conjunction, alternatives, or another evaluation strategy. This keeps nested declarations predictable and avoids imposing policy combinators on consumers.

Superseded: the rule now lives in rpc-toolkit as Nearest Wins, and auth-toolkit's Auth Cannotation inherits it rather than restating it.
