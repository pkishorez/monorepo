---
'@kestack/ai-toolkit': patch
---

Breaking: `retired` is gone from `@kestack/ai-toolkit/client`. Prune the Replica Store to the Machines listed, `store.prune([[Ai, machineIds]])`, which deletes older `Ai` versions and Machines gone alike.
