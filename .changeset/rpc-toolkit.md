---
'rpc-toolkit': patch
---

Persist every active streaming RPC automatically and restore it through Hibernation Replay, even when the handler does not use `StreamCheckpoint`. A close event waits for replay before it interrupts restored calls, which prevents a disconnected connection from being restored after its close was already processed. `StreamCheckpoint` remains available only for streams that need resumable progress.
