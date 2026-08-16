---
'use-effect-ts': patch
---

**Breaking:** move the `effect` peer range from the exact `4.0.0-beta.78` to
`^4.0.0-beta.102`, and the `react` peer range from `>=19.2.3` to `^19.2.7`.
Pinning `effect` to a single beta forced a duplicate install for anyone already
on a later beta. No runtime code changed.
