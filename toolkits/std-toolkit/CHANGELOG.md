# @kstackz/std-toolkit

## 0.0.12

### Patch Changes

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial release under the `@kstackz` scope.

  Store many entity types in one table and keep a browser copy in sync. It gives you versioned schemas that still read old rows, one table definition that runs on DynamoDB, SQLite, IndexedDB, or memory without code changes, and a sync engine that keeps TanStack DB collections fresh. You need it so every app does not hand-write its own schema migrations, storage layer, and sync loop.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`63ff114`](https://github.com/pkishorez/monorepo/commit/63ff114e32f517d4f58873b6ea4809a137744eb6) Thanks [@kishorenuma](https://github.com/kishorenuma)! - An ESchema's `schema` now keeps `_v` when sent as JSON, as Effect RPC and HTTP API do. Its JSON form was the latest version's fields alone, so encoding dropped `_v` and decoding read every value as v1: an evolved entity's write either failed with `Decode failed` or was migrated from v1 again, resetting fields added since. On the wire it is now the latest version with its `_v`, and an older or unversioned value is refused instead of migrated; stored values still migrate when read.
