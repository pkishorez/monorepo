---
'@kestack/kabuki': patch
---

A Message wakes only the Views whose Instance it changed. Each View, `useChild` and `useChildren` is told at its own Address, so with thousands of Views a Message costs about what one does: the Snapshot drawn is compared with the one before, skipping every part that is the same object in both, where every View used to look its Instance up from the root on each Message.
