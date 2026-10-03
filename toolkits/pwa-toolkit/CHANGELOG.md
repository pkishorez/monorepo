# @kstackz/pwa-toolkit

## 0.0.12

### Patch Changes

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial release under the `@kstackz` scope.

  Turns a TanStack Start app into an installable, offline-capable PWA: a Vite plugin that builds the service worker and precache, runtime caching rules, update and install prompts, Worker RPC, and a Kill Switch build. You need it because the usual PWA plugins expect an `index.html`, and a server-rendered Start app has none.

- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`1dd5049`](https://github.com/pkishorez/monorepo/commit/1dd5049705d9f722a6fc2486240a2e7cd11bbbe3), [`0285248`](https://github.com/pkishorez/monorepo/commit/02852488585c71fd99b8e4defbb9185396f293dd)]:
  - @kstackz/ui-toolkit@0.0.12
