---
'@kestack/ai-toolkit': patch
---

`AiClient.layer(url, { key })` proves itself to a Machine with its Machine Key, offering the subprotocols `ai-toolkit` and `key.<key>`; without a key it connects as before. The `Ai` Replica is keyed by Machine id: `Ai.get(machineId)` is the Instance of one Machine, in its own IndexedDB database. It is a new Replica, `ai-m3`, synced afresh, and `retired` now names every unkeyed one before it.
