# @kstackz/effect-webrtc

## 0.0.12

### Patch Changes

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial release under the `@kstackz` scope.

  Direct peer-to-peer connections and Effect RPC over WebRTC data channels. You name the peer you want, and it handles signaling (memory, Nostr, or Cloudflare Durable Objects), negotiation, and reconnects. You need it to connect browsers and Node processes directly without writing WebRTC plumbing.

- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`0285248`](https://github.com/pkishorez/monorepo/commit/02852488585c71fd99b8e4defbb9185396f293dd)]:
  - @kstackz/auth-toolkit@0.0.12
  - @kstackz/flow@0.0.12
  - @kstackz/rpc-toolkit@0.0.12
