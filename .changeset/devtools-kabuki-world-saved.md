---
'@kestack/devtools-kabuki': patch
---

`@kestack/devtools-kabuki/fake`: `world.saved()` saves every Fake's change still waiting at once, and settles once each is written. Ask it before leaving the page: a write begun as the page unloads may not land.
