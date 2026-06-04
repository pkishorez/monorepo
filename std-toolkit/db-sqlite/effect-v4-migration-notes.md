# @std-toolkit/sqlite — Effect v4 migration notes

Migrated `std-toolkit/db-sqlite` (package `@std-toolkit/sqlite`) from Effect v3
to `4.0.0-beta.78`. Minimal, idiomatic changes — no rewrites. Public exports
unchanged.

## Changes

- **`Context.Tag` → `Context.Service`.** `SqliteDB` was a v3
  `Context.Tag('SqliteDB')<SqliteDB, Shape>`; became
  `Context.Service<SqliteDB, Shape>()('SqliteDB')`. This also fixed cascading
  `yield* SqliteDB` "[Symbol.iterator]" errors and the adapter
  `Layer.succeed(SqliteDB, {...})` shape-inference (`implicit any` on handler
  params) — both were symptoms of the v3 Tag not being a v4 service key.

- **`FiberRef` → `Context.Reference`.** `effect` no longer exports `FiberRef`.
  `TransactionPendingBroadcasts` (a custom `FiberRef.unsafeMake<Option<Array>>`)
  became `Context.Reference('TransactionPendingBroadcasts', { defaultValue: () =>
Option.none() })`. Because a `Reference` value is fixed for the scope it is
  provided to (you cannot `FiberRef.set` it mid-fiber), the read/replace pattern
  was reworked: `transaction` allocates a local `pending: Array<…>` and provides
  `Option.some(pending)` to the transactional effect via
  `Effect.provideService(TransactionPendingBroadcasts, …)`; the two `#broadcast`
  methods now **push into the array in place** (`pending.value.push(entity)`)
  instead of building `Option.some([...pending.value, entity])` and re-setting.
  The post-commit broadcast loop and nested-transaction guard read the same
  array/reference. Net behavior identical; the explicit
  `FiberRef.set(…, Option.none())` reset is gone (scope handles it).

- **`Effect.gen(this, fn)` → `Effect.gen({ self: this }, fn)`** across all
  service classes (self wrapped in options object).

- **`Effect.andThen(Option.getOrNull)` → `Effect.map(Option.getOrNull)`.** In v4
  `Effect.andThen` only accepts an Effect (or `() => Effect`); a plain
  value-returning function (`Option.getOrNull` returns `A | null`) must go
  through `Effect.map`.

- **`Stream.paginateChunkEffect` removed → `Stream.paginate`.** The page fn now
  returns `[ReadonlyArray<A>, Option<S>]` (emits flattened, not `Chunk`). The
  stream element type here is the whole batch (`EntityType[]`), so the per-page
  emit became `[[items], nextState]` (wrap the batch in a single-element array)
  instead of `Chunk.of(items)`. `Chunk` import dropped.

- **`Schema.transform(from, to, { decode, encode })` →
  `from.pipe(Schema.decodeTo(to, { decode: SchemaGetter.transform(fn), encode:
SchemaGetter.transform(fn) }))`.** The `decodeTo` transformation arg wants a
  `{ decode: Getter, encode: Getter }` object built from `SchemaGetter.transform`
  — **not** the result of `SchemaTransformation.transform(...)` (that's a
  `Transformation`, the wrong shape for this overload). Used for `SqliteBool`
  (number↔boolean).

- **`Struct.omit` / `Schema.extend` gone → spread `.fields`.**
  `MetaSchema.omit('_d').pipe(Schema.extend(Schema.Struct({ _d: SqliteBool })))`
  became `Schema.Struct({ ...MetaSchema.fields, _d: SqliteBool })` (a v4
  `Schema.Struct` exposes `.fields`).

- **Tests:** `Effect.either` → `Effect.result` (tags `'Failure'` not `'Left'`);
  `Schema.Literal('active', 'closed')` → `Schema.Literals(['active', 'closed'])`.
  Zero tests removed or skipped (111 pass).

## RPC

The `@effect/rpc` reference in `sqlite-command.ts` was only a JSDoc mention plus
plain handler-object construction; no `@effect/rpc` import existed in this
package (the rpc surface lives in already-migrated `@std-toolkit/core/rpc`,
imported as-is). No import rewrites were needed here.
