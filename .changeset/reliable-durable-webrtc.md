---
'effect-webrtc': patch
'rpc-toolkit': patch
---

Make Durable Object signaling subscriptions survive hibernation and keep the authenticated Peer Directory current without polling.

`rpc-toolkit` now persists every active streaming RPC automatically and restores it through Hibernation Replay, even when the handler does not use `StreamCheckpoint`. A close event waits for replay before it interrupts restored calls, which prevents a disconnected connection from being restored after its close was already processed. `StreamCheckpoint` remains available only for streams that need resumable progress.

`effect-webrtc` replaces the point-in-time Durable peer list with a live `peers` stream. Peer joins and leaves now update each User's private Peer Directory immediately, and the signaling streams recover after Durable Object hibernation. This prevents stale Peer Presence and removes the need for manual directory refreshes.
