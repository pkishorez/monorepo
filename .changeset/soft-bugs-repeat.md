---
'use-effect-ts': patch
---

Widen the peer ranges to `effect@^4.0.0-beta.102` and `react@^19.2.7`. `effect`
was pinned to the exact `4.0.0-beta.78`, which forced a duplicate install for
anyone already on a later beta. No runtime code changed.
