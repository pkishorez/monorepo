# db-dynamodb — Effect v4 migration notes

Minimal v3→v4 migration. No public API changes; all 299 tests pass, zero
removed/skipped.

## Folded packages

- `scripts/generate/index.ts`: `import { FileSystem } from '@effect/platform'`
  → `import { Effect, FileSystem } from 'effect'`. In v4 `FileSystem` is a
  **top-level core module** (`effect/FileSystem`), not under `unstable/*`.
- `scripts/generate/manifest-loader.ts`:
  `import { HttpClient } from '@effect/platform'` →
  `import { HttpClient } from 'effect/unstable/http'`. The `client.get(url)`,
  `response.status`, and `response.json` API is unchanged.
- `@effect/platform-node` (`NodeFileSystem`, `NodeHttpClient` in
  `scripts/generate.ts`) is a **surviving** package — left untouched at
  `4.0.0-beta.78`.
- No real `@effect/rpc` import existed; only a doc comment referenced it
  (updated to `effect/unstable/rpc`). `DynamoCommand.toRpcHandler` is a plain
  object builder with no Effect dependency.

## v4 API changes applied

- **`Effect.gen(this, fn)` → `Effect.gen({ self: this }, fn)`** (35 sites
  across the 5 service files). A wrong `self` makes `this` `unknown` inside the
  generator, which cascades into ~160 "Object is of type 'unknown'" errors —
  fixing `gen` resolves almost all of them.
- **`Effect.either` → `Effect.result`** (returns `Result`, tags
  `'Success'`/`'Failure'`, accessors `.success`/`.failure`). Updated all
  consumer sites: `_tag === 'Right'` → `'Success'`, `'Left'` → `'Failure'`,
  `.right` → `.success`, `.left` → `.failure` (services + integration test
  runtime assertions).
- **`Effect.catchAll` → `Effect.catch`** (services, play, all test files).
- **`Effect.andThen(Option.getOrNull)` → `Effect.map(Option.getOrNull)`** —
  v4 `andThen` rejects plain value-returning functions.
- **`Stream.paginateChunkEffect` → `Stream.paginate`** — the page fn now
  returns `Effect<[ReadonlyArray<A>, Option<S>]>` emitting flattened array
  elements. To keep emitting one whole batch per page, wrap the items array:
  `Chunk.of(items)` → `[items]`, `Chunk.of(snapshot)` → `[snapshot]`.
- **`Stream.runCollect` returns `Array<A>` (not `Chunk`)** — dropped the
  trailing `Effect.map(Chunk.toArray)` / `Chunk.toArray(...)` in tests and the
  now-unused `Chunk` imports.
- **`Schema.partial(struct)` → `struct.mapFields(Struct.map(Schema.optional))`**
  (`Struct` added to the `effect` import).
- **`Schema.encode` → `Schema.encodeEffect`**,
  **`Schema.decodeUnknown` → `Schema.decodeUnknownEffect`** (effectful codecs
  gained the `Effect` suffix).
- **`Schema.optionalWith(s, { exact: true })` → `Schema.optionalKey(s)`**
  (migration-inspection test).

## Diff

`17 files changed, 135 insertions(+), 143 deletions(-)` — net negative.
