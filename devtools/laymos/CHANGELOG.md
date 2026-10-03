# laymos

## 0.0.12

### Patch Changes

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Starts a fresh changelog alongside the `@kstackz` packages.

  laymos writes a project's architecture down in `laymos.config.json` and checks the real imports against it, so rule breaks show up in lint instead of in review. It also runs Stories: small executable docs that prove a behavior.

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`ca6e1d8`](https://github.com/pkishorez/monorepo/commit/ca6e1d8230af130c1747987752b49185c2c3b18b) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `laymos stories` no longer hangs after a Story that leaves background work in a scope. Each question now carries a `run` that runs its proof on the Story file's own copy of `effect`. Before, the runner ran proofs on its own copy, and because each copy numbers its fibers from zero, closing a scope could skip interrupting a fiber that had the same id as the closing one.
- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c)]:
  - @kstackz/effect-tracer@0.0.12
  - @kstackz/flow@0.0.12
