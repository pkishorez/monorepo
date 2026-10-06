# use-effect-ts

## 0.0.12

### Patch Changes

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Starts a fresh changelog alongside the `@kstackz` packages.

  React hooks that run Effect programs inside a component's lifetime and cancel them on unmount, plus TanStack Query wrappers for cached reads. You need them so Effects started from React never outlive their component or update unmounted state.

- [`f1ac87b`](https://github.com/pkishorez/monorepo/commit/f1ac87bdce327a8e3d165e3a69b947f454e5bbee) Thanks [@claude](https://github.com/claude)! - Declares the MIT license in `package.json`, so npm shows it, and names the copyright holder in `LICENCE`.
