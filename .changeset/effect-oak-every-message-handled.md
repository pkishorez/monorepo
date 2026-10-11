---
'effect-oak': patch
---

`build` logs a warning, once, for each Message an Actor declares that has no rule at the top or in any State: such a Message is always ignored. A Message with no rule in the current State is still ignored without a warning.
