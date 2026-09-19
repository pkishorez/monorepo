# effect-webrtc

## 0.0.1

### Patch Changes

- [`9209fed`](https://github.com/pkishorez/monorepo/commit/9209fed3c72faaa0abc14248b342e31d85f90a46) Thanks [@pkishorez](https://github.com/pkishorez)! - Make Durable Object signaling subscriptions survive hibernation and keep the authenticated Peer Directory current without polling.

  `rpc-toolkit` now persists every active streaming RPC automatically and restores it through Hibernation Replay, even when the handler does not use `StreamCheckpoint`. A close event waits for replay before it interrupts restored calls, which prevents a disconnected connection from being restored after its close was already processed. `StreamCheckpoint` remains available only for streams that need resumable progress.

  `effect-webrtc` replaces the point-in-time Durable peer list with a live `peers` stream. Peer joins and leaves now update each User's private Peer Directory immediately, and the signaling streams recover after Durable Object hibernation. This prevents stale Peer Presence and removes the need for manual directory refreshes.

- Updated dependencies [[`de0ecfd`](https://github.com/pkishorez/monorepo/commit/de0ecfdabf9863c7020f478c66e12567009c7d65), [`8c85c6d`](https://github.com/pkishorez/monorepo/commit/8c85c6d5fba84703e47012faca532bdc3f7a0b39), [`7134458`](https://github.com/pkishorez/monorepo/commit/7134458c8c2c2cf08ceb66868b1bdf2445e3c179), [`63d69a8`](https://github.com/pkishorez/monorepo/commit/63d69a86a55876525bd04067f7e6414261451443), [`9458de2`](https://github.com/pkishorez/monorepo/commit/9458de2992fb2c447f2c032e203e1ccfecb2d347), [`9209fed`](https://github.com/pkishorez/monorepo/commit/9209fed3c72faaa0abc14248b342e31d85f90a46)]:
  - auth-toolkit@0.0.3
  - @pkishorez/flow@0.0.10
  - rpc-toolkit@0.0.2
