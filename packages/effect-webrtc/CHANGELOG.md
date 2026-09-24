# effect-webrtc

## 0.0.1

### Patch Changes

- [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21) Thanks [@pkishorez](https://github.com/pkishorez)! - Replace the point-in-time Durable peer list with a live `peers` stream. Peer joins and leaves now update each User's private Peer Directory immediately, and the signaling streams recover after Durable Object hibernation. This prevents stale Peer Presence and removes the need for manual directory refreshes.
- Updated dependencies [[`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21)]:
  - auth-toolkit@0.0.3
  - @pkishorez/flow@0.0.10
  - rpc-toolkit@0.0.2
