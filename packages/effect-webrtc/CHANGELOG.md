# @kestack/effect-webrtc

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: Peer Sessions are traced with Effect spans instead of Flow. On the wire, `NegotiationEnvelope`'s `flow` field is now `trace`, so a Peer on 0.0.0 cannot negotiate with one on this version; update every Peer and redeploy the Durable Signaling worker together. `FlowCarrierSchema`, `FlowMessageTokenSchema` and `FlowCarrier` are removed, and so is the `@kestack/flow` peer. Needs Effect `^4.0.0`; the optional `alchemy` peer is now `2.0.0-beta.80`.
- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/auth-toolkit@0.0.1
  - @kestack/rpc-toolkit@0.0.1
