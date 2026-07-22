# Issues: idb-adapter

Source: `this conversation`
Repo root: `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/std-toolkit`
Project commands: `pnpm test` (vitest run) · `pnpm lint` (vp check + tsc --noEmit) · `pnpm lint:depcruise` · `pnpm build` (tsc)

## North Star

std-toolkit gains a third database adapter: an in-browser IndexedDB adapter at `src/db/idb` — the browser sibling of the SQLite adapter, not a DynamoDB emulator. It implements the shared single-table topology (partition key / sort key item collections, `IndexDefinition`, Entity services, `EntityRegistry`) over one IndexedDB object store per logical table, so browser apps get a sync-compatible local store that preserves the `_u` convergence ordering and `_d` soft-delete tombstones the tanstack-sync engine depends on. The constraint we slip scope before violating: behavioral parity with the SQLite adapter's shared-kernel semantics (the 7 SortKeyCondition operators, sort-direction inference, soft delete, `_u` stamping). Good looks like: `pnpm test` green including the repo's first shared conformance suite running identical assertions against both better-sqlite3 and fake-indexeddb, with the adapter exported at `std-toolkit/idb`.

## Glossary

- **Item collection** — the set of records sharing one partition key (`pk`) value; the unit a query returns, sorted by sort key (`sk`).
- **`_u`** — a monotonic ULID stamped on every write (via core's `nextUlid`); the sync engine's convergence key (higher wins). Never reuse an old `_u`.
- **`_d`** — soft-delete tombstone flag (`0 | 1` in adapters). Deletes are soft by default so sync can propagate them.
- **Record** — the stored IDB row: a native structured-clone object `{ pk, sk, _data: <plain object>, _e, _v, _u, _d, ...gsiKeyFields }`. Unlike SQLite, `_data` is a real object, NOT a JSON string.
- **Auto-versioned setup** — the adapter owns the IndexedDB database's version number: `setup()` diffs declared stores/indexes against what exists and bumps the version only when something is missing. A database name given to `idbLayer` belongs exclusively to this adapter.
- **Buffered transaction** — `transact()` takes pre-validated plain op descriptors and applies them all in ONE native IndexedDB read-write transaction with no foreign awaits inside. There is no interactive begin/commit (IDB transactions auto-commit when control returns to the event loop).
- **Optimistic update** — read-modify-write re-checks the record's `_u` inside the write transaction and fails with `conditionFailed` if another writer (e.g. a second browser tab) got there first.
- **eschema** — the toolkit's versioned self-migrating schema system (`src/eschema`); entity values are validated/migrated by it on read and write.

Required background reading for every task: `src/db/CONTEXT.md` (shared kernel vocabulary), `src/db/idb/CONTEXT.md` (this adapter's divergences), `src/db/idb/docs/adr/0001-buffered-transactions-and-auto-versioning.md` (why transactions and versioning work this way).

## Conventions

- See `CLAUDE.md` at the monorepo root: kebab-case filenames only; comments only when necessary, except JSDoc on public functions/classes/complex types (the sqlite sources model the expected JSDoc density — match it).
- Effect v4 beta (`effect: 4.0.0-beta.78`). Services via `Context.Service` class pattern; layers via `Layer.succeed(Tag, impl)` factory functions; async work via `Effect.tryPromise` with a `catch` mapping to a tagged error factory; optional services via `Effect.serviceOption(Broadcaster).pipe(Effect.map(Option.getOrNull))`.
- Errors extend core's `StdToolkitError` (`src/core/error.ts`) with static factory methods per failure kind — copy the shape of `src/db/sqlite/errors.ts`.
- Tests: vitest, colocated in `__tests__/` folders, files `*.test.ts` (config: `vite.config.ts`, include `src/**/__tests__/**/*.test.ts`). Effect tests use the local helper `const itEffect = (name, fn) => it(name, () => Effect.runPromise(fn()))` — see `src/db/sqlite/services/__tests__/entity.test.ts:4-5`.
- IndexedDB in tests: `import 'fake-indexeddb/auto';` at the top of each test file (`fake-indexeddb` v6.2.5 is a devDependency). fake-indexeddb state persists for the process — every test must use a unique database name (e.g. a per-test counter or suffix) to stay isolated.
- The `idb` npm package (v8.0.3, already a dependency) is the IndexedDB wrapper — use `openDB` from it, never raw `indexedDB` request callbacks.
- Do not run `pnpm sqlite:play` or any `play` script — those are for the human to run.

---

## Task: IdbDB service, idbLayer, and auto-versioned setup [AFK]

**Why.** Everything above it — table, entities, registry, conformance — stands on this seam. It delivers the adapter's two hardest invariants (auto-versioned schema setup and the buffered conditional-write transaction primitive) so every later task composes plain Effect code without touching IndexedDB lifecycle quirks.

**What.** A new module `src/db/idb/` containing the low-level IndexedDB database service and its browser layer: `errors.ts` (`IdbDBError`), `db.ts` (the `IdbDB` `Context.Service` plus record/op types), `layer.ts` (`idbLayer(dbName, tableName)`), and `__tests__/db.test.ts` proving roundtrip, setup idempotency, auto version-bump, and transaction atomicity against fake-indexeddb.

**Read first.**

- `src/db/idb/CONTEXT.md` and `src/db/idb/docs/adr/0001-buffered-transactions-and-auto-versioning.md` — the design contract this task implements.
- `src/db/sqlite/sql/db.ts` — the `SqliteDB` `Context.Service` shape to mirror structurally (service class + method signatures returning `Effect.Effect<A, Error>`).
- `src/db/sqlite/errors.ts` — the error-class pattern (`StdToolkitError` subclass with static factories) to copy for `IdbDBError`.
- `src/db/sqlite/sql/adapters/node.ts` — the async `Layer.succeed` adapter pattern (`Effect.tryPromise` + error factory in `catch`).
- `src/tanstack-sync/offline-storage/adapters/idb/internals.ts` — existing `openDB` usage, module-level connection cache (`Map<string, IDBPDatabase>`), upgrade callback creating stores/indexes.
- `src/tanstack-sync/offline-storage/adapters/idb/idb-storage.ts` — SSR-safe pattern (defer `globalThis.indexedDB` access until the first async op) and `Effect.tryPromise` error wrapping around idb calls.

**Interface produced.** (successors quote these verbatim)

In `src/db/idb/db.ts`:

```ts
export interface IdbRecord {
  pk: string;
  sk: string;
  _data: Record<string, unknown>;
  _e: string;
  _v: string;
  _u: string;
  _d: 0 | 1;
  [gsiKeyField: string]: unknown;
}

export interface IdbKey {
  pk: string;
  sk: string;
}

/**
 * expectedU semantics (checked inside the transaction, per key):
 *   undefined -> unconditional write
 *   null      -> record must NOT exist (insert)
 *   string    -> stored record's _u must equal it (optimistic update)
 * Any violation aborts the whole transaction with IdbDBError.conditionFailed
 * and NO ops are applied.
 */
export type IdbWriteOp =
  | { type: 'put'; record: IdbRecord; expectedU?: string | null }
  | {
      type: 'patch';
      key: IdbKey;
      values: Record<string, unknown>;
      expectedU?: string;
    }
  | { type: 'delete'; key: IdbKey };

export class IdbDB extends Context.Service<
  IdbDB,
  {
    readonly tableName: string;
    setup(
      secondaryIndexes: Record<string, { pk: string; sk: string }>,
    ): Effect.Effect<void, IdbDBError>;
    get(key: IdbKey): Effect.Effect<IdbRecord | null, IdbDBError>;
    put(record: IdbRecord): Effect.Effect<void, IdbDBError>;
    delete(key: IdbKey): Effect.Effect<void, IdbDBError>;
    clear(): Effect.Effect<{ rowsDeleted: number }, IdbDBError>;
    transact(ops: ReadonlyArray<IdbWriteOp>): Effect.Effect<void, IdbDBError>;
  }
>()('IdbDB') {}
```

In `src/db/idb/layer.ts`:

```ts
export const idbLayer = (dbName: string, tableName: string): Layer.Layer<IdbDB>
```

In `src/db/idb/errors.ts`: `IdbDBError` extending `StdToolkitError`, with at minimum the static factories `openFailed`, `setupFailed`, `getFailed`, `putFailed`, `deleteFailed`, `clearFailed`, `transactFailed`, and `conditionFailed` (mirror `src/db/sqlite/errors.ts` style; `conditionFailed` must be distinguishable by callers, e.g. via a tag/code field, because Task 3 maps it to a retryable error).

**Implementation notes (binding decisions, not suggestions).**

- Object store name = `tableName`, `keyPath: ['pk', 'sk']`. Secondary indexes: `store.createIndex(indexName, [def.pk, def.sk])` using the logical index name directly (IDB index names are store-scoped; no `idx_` prefixing needed).
- `setup(secondaryIndexes)` implements auto-versioning: open the database at its current version (`openDB(dbName)` with no version); if `db.objectStoreNames` lacks the store or the store's `indexNames` lacks any declared index, close and reopen at `db.version + 1` with an `upgrade` callback that creates only what is missing. Calling `setup` twice, or on an already-complete database, must not bump the version.
- Connection caching: module-level `Map<string, IDBPDatabase>` keyed by dbName, as in `internals.ts:18`; invalidate the cache entry when `setup` closes for a version bump, and close the connection on the `versionchange` event so another tab's upgrade isn't blocked.
- SSR-safe: `idbLayer` must be callable during module evaluation with no `indexedDB` global; only the first executed Effect may touch `globalThis.indexedDB` (fail with `IdbDBError.openFailed` if absent).
- `transact` body: open ONE `readwrite` transaction on the store; inside it, for each op, `get` current record where a condition or patch requires it, evaluate `expectedU`, then `put`/`delete`. Only IDB promises may be awaited inside — no Effect code, no schema calls. On condition violation call `tx.abort()` (or throw before `tx.done`) so nothing commits. Wrap the whole body in a single `Effect.tryPromise`.
- `patch` op applies as read → shallow-merge `values` over the stored record → put, all inside the transaction. Patching a missing record is a `conditionFailed`.

**Inputs from predecessors.** None — can start immediately. (`src/db/idb/CONTEXT.md` and the ADR already exist in the repo.)

**Out of scope.**

- No `getRange`/query support — Task 2 adds it to this same service.
- No table/entity/registry layers, no barrel `index.ts`, no package.json changes (Tasks 2–5 own those).
- Do not modify anything under `src/db/sqlite/`, `src/db/dynamodb/`, or `src/tanstack-sync/` — read-only references.

**Acceptance criteria.**

- [ ] `src/db/idb/__tests__/db.test.ts` (with `import 'fake-indexeddb/auto'`) covers: put→get roundtrip returns a structurally-equal `IdbRecord` with `_data` as a real object; `get` of a missing key returns `null`; `setup` twice with the same indexes leaves `db.version` unchanged; `setup` with an added index bumps the version by exactly 1 and the new index exists; `transact` with `[putA, putB-with-failing-expectedU]` applies NEITHER put and fails with `conditionFailed`; `expectedU: null` put on an existing key fails with `conditionFailed`; `patch` merges values without clobbering unlisted fields.
- [ ] `pnpm lint` and `pnpm build` pass.

**Done when.** `pnpm test src/db/idb` runs the new `db.test.ts` green and `pnpm lint` succeeds.

---

## Task: IdbTable — single-table topology and query semantics [AFK]

**Why.** This is the slice that makes the adapter _queryable_ — item collections with the exact 7 range operators the sync engine and app code rely on, behavior-identical to `SQLiteTable` so the two adapters stay interchangeable.

**What.** `src/db/idb/idb-table.ts`: the type-safe table builder (`IdbTable.make().primary(pk, sk).index(name, pk, sk).build()`) with `setup`, `getItem`, `putItem`, `updateItem`, `deleteItem` (soft), `hardDeleteItem`, `query`, `index(name).query`, and `dangerouslyRemoveAllRows` — plus a `getRange` method added to the `IdbDB` service from Task 1. Mirror `src/db/sqlite/services/sqlite-table.ts` as literally as the storage difference allows.

**Read first.**

- `src/db/sqlite/services/sqlite-table.ts` — the verbatim template: same builder, same type parameters (`TPrimaryIndex`, `TSecondaryIndexMap`), same method set, same JSDoc style. Copy `getSortDirection` (lines 155–159) and the `buildWhere` operator dispatch (lines 97–153) logic, translated to key ranges.
- `src/db/idb/db.ts` and `src/db/idb/layer.ts` — Task 1's service you are extending.
- `src/db/idb/CONTEXT.md` — Store/Record/Sparse-index vocabulary.

**Interface produced.**

Added to the `IdbDB` service in `src/db/idb/db.ts` (and implemented in `layer.ts`):

```ts
export interface IdbRangeSpec {
  pk: string;
  lower?: string;        // sk lower bound
  upper?: string;        // sk upper bound
  lowerOpen?: boolean;
  upperOpen?: boolean;
}

getRange(
  index: string | null,  // null = primary store order, else a secondary index name
  range: IdbRangeSpec,
  options?: { direction?: 'next' | 'prev'; limit?: number },
): Effect.Effect<IdbRecord[], IdbDBError>;
```

In `src/db/idb/idb-table.ts` (shapes identical to sqlite-table.ts, retyped over `IdbRecord`):

```ts
export interface IndexDefinition { pk: string; sk: string }
export interface QueryResult { Items: IdbRecord[] }
export interface KeyConditionParameters { pk: string; sk?: SortKeyCondition }
export type SortKeyCondition =
  | { '<': string } | { '<=': string } | { '>': string } | { '>=': string }
  | { '=': string } | { between: [string, string] } | { beginsWith: string };

export const IdbTable = {
  make(): { primary<Pk extends string, Sk extends string>(pk: Pk, sk: Sk): IdbTableBuilder },
};
export type IdbTableInstance<TPrimaryIndex, TSecondaryIndexMap> = ...;
```

Instance methods (all `Effect.Effect<_, IdbDBError, IdbDB>`): `setup()`, `getItem(key: IdbKey): Effect<{ Item: IdbRecord | null }>`, `putItem(record: IdbRecord): Effect<void>`, `updateItem(key: IdbKey, values: Record<string, unknown>): Effect<void>`, `deleteItem(key: IdbKey): Effect<void>` (soft: patch `{ _d: 1 }`), `hardDeleteItem(key: IdbKey): Effect<void>`, `query(cond: KeyConditionParameters, options?: { Limit?: number; ScanIndexForward?: boolean }): Effect<QueryResult>`, `index(name).query(...)` (same options), `dangerouslyRemoveAllRows('i know what i am doing')`.

**Implementation notes (binding decisions).**

- Operator → range translation: `<` → `{upper, upperOpen: true}`; `<=` → `{upper}`; `>` → `{lower, lowerOpen: true}`; `>=` → `{lower}`; `=` → `{lower: v, upper: v}`; `between: [a, b]` → `{lower: a, upper: b}` (inclusive both ends, matching SQL `BETWEEN`); `beginsWith: p` → `{lower: p, upper: p + '￿'}`.
- In `getRange`'s implementation, build `IDBKeyRange.bound([pk, lower ?? ''], [pk, upper ?? []], lowerOpen ?? false, upperOpen ?? false)`. The `[]` upper sentinel works because arrays sort after all strings in IndexedDB key ordering — it means "every possible sk under this pk".
- Sort-direction inference (copy sqlite exactly): no sk condition or `>`, `>=`, `=`, `between`, `beginsWith` → `'next'` (ascending); `<`, `<=` → `'prev'` (descending). Explicit `ScanIndexForward: true/false` overrides to `'next'`/`'prev'`.
- Default `Limit` is 100 (sqlite-table.ts:182). Implement limit via cursor iteration or `getAll(range, limit)` — but descending order requires a cursor (`'prev'`), so a cursor loop is the uniform choice.
- `setup()` delegates to `IdbDB.setup(secondaryIndexMap)`.
- Table-level `query` does NOT filter `_d` tombstones — parity with `SQLiteTable.rawQuery`, which returns them; filtering is the entity layer's job (Task 3).
- Sparse index behavior needs no code: IDB indexes skip records missing the keyPath fields. Just don't "fix" it.

**Inputs from predecessors.** Task `IdbDB service, idbLayer, and auto-versioned setup` produced `src/db/idb/db.ts` (`IdbDB`, `IdbRecord`, `IdbKey`, `IdbWriteOp`), `src/db/idb/layer.ts` (`idbLayer(dbName, tableName)`), and `src/db/idb/errors.ts` (`IdbDBError`). Call writes via `IdbDB.put` / `IdbDB.transact([{ type: 'patch', key, values }])`; this task adds `getRange` to that service and its layer.

**Out of scope.**

- No eschema validation, `_u` stamping, or broadcasts — Task 3's job.
- No registry, no barrel, no package.json.
- Do not modify `src/db/sqlite/` or `src/db/dynamodb/`.

**Acceptance criteria.**

- [ ] `src/db/idb/__tests__/table.test.ts` covers, against a seeded item collection: each of the 7 operators returns exactly the expected keys in the expected order; `<`/`<=` return descending by default; `ScanIndexForward: false` reverses an ascending query and `true` forces ascending on a `<` query; `Limit` truncates; default limit is 100 (seed 105 rows, expect 100 back); a GSI query via `index('gsi1').query(...)` returns only records that have the GSI key fields (sparse behavior asserted with one record lacking them); `deleteItem` leaves the record readable via `getItem` with `_d: 1`; `hardDeleteItem` makes `getItem` return `{ Item: null }`.
- [ ] `pnpm lint` and `pnpm build` pass.

**Done when.** `pnpm test src/db/idb` runs `table.test.ts` green alongside Task 1's tests.

---

## Task: IdbEntity and IdbSingleEntity [AFK]

**Why.** The entity layer is what applications actually call: schema-validated CRUD with automatic key derivation, `_u` stamping, soft-delete tombstones, and eschema auto-migration — the invariants that make records from this adapter syncable. Without it the adapter is a raw key-value surface.

**What.** `src/db/idb/idb-entity.ts` and `src/db/idb/idb-single-entity.ts`: the IndexedDB Entity services, mirroring the full public surface of `SQLiteEntity`/`SQLiteSingleEntity` method-for-method, plus Dynamo-style `insertOp`/`updateOp` descriptor producers (which SQLite lacks — they exist for Task 4's buffered `transact`). Updates are optimistic: the write re-checks `_u` inside the transaction.

**Read first.**

- `src/db/sqlite/services/sqlite-entity.ts` — the primary template. Mirror the builder (`make(table).eschema(...).primary(...).index(...).build()`), the type parameters, and every public member: `name`, `idField`, `get`, `insert`, `update`, `delete`, `hardDelete`, `query`, `queryStream`, `subscribe`, `dangerouslyRemoveAllRows`. Mirror its private helpers' responsibilities too (`#prepareInsert`, `#encode`, `#parseRow`, `#decodeItems`, `#derivePrimaryIndex`, `#deriveSecondaryIndexes`, `#broadcast`) — same behavior, IDB storage.
- `src/db/sqlite/services/sqlite-single-entity.ts` — template for the singleton variant.
- `src/db/sqlite/services/__tests__/entity.test.ts` and `single-entity.test.ts` — the builder usage, fixtures, and `itEffect` helper; your tests mirror these against `idbLayer` + fake-indexeddb.
- `src/db/dynamodb/services/dynamo-entity.ts` — ONLY for the `insertOp`/`updateOp` naming and validation-before-descriptor pattern, and the `delete` docstring (lines ~526–558) explaining why deletes are soft.
- `src/core/schema.ts` and `src/core/index.ts` — `EntityType`, `MetaSchema`, `nextUlid`, `Broadcaster`.
- `src/db/idb/idb-table.ts` and `src/db/idb/db.ts` — the layers you build on.

**Interface produced.**

```ts
// src/db/idb/idb-entity.ts
export class IdbEntity<TTable, TSchema, TSecondaryDerivationMap> {
  static make<TTable extends IdbTableInstance>(table: TTable): /* builder: .eschema(...).primary(...).index(...).build() — same chain as SQLiteEntity.make */;
  get name(): TSchema['name'];
  get idField(): TSchema['idField'];
  get(...), insert(...), update(...), delete(...), hardDelete(...),
  query(...), queryStream(...), subscribe(...), dangerouslyRemoveAllRows(...);
  // signatures identical to SQLiteEntity's, with SqliteDB/SqliteDBError replaced by IdbDB/IdbDBError

  /** Validates + encodes NOW, returns a descriptor for EntityRegistry.transact. */
  insertOp(value: ...): Effect.Effect<IdbEntityOp, IdbDBError | eschema errors, IdbDB>;
  updateOp(id: ..., patch: ...): Effect.Effect<IdbEntityOp, IdbDBError | eschema errors, IdbDB>;
}

export interface IdbEntityOp {
  readonly write: IdbWriteOp;                 // from src/db/idb/db.ts
  readonly entity: EntityType<unknown>;       // broadcast payload, flushed by registry AFTER commit
}

// src/db/idb/idb-single-entity.ts
export class IdbSingleEntity<TTable, TSchema> { /* mirror SQLiteSingleEntity surface */ }
```

**Implementation notes (binding decisions).**

- `insert` → `IdbDB.transact([{ type: 'put', record, expectedU: null }])` so duplicate inserts fail like SQLite's PK-conflict `insertFailed`.
- `update` → read + auto-migrate + merge OUTSIDE any transaction, then `IdbDB.transact([{ type: 'put', record, expectedU: <the _u read> }])`. A `conditionFailed` from a concurrent writer surfaces to the caller unchanged (retryable).
- Every write stamps a fresh `_u = nextUlid()`; `_data` is stored as a plain object (no `JSON.stringify` — the one deliberate divergence from `#encode`/`#parseRow` in the SQLite template).
- `delete`/`hardDelete`/`subscribe`/broadcast semantics: mirror `sqlite-entity.ts` exactly (including whether `delete` stamps a fresh `_u` — do what the SQLite entity does, verified by reading its `delete` body, not assumed).
- `insertOp`/`updateOp` run all validation, migration, key derivation, and `_u` stamping eagerly and return the pure `IdbEntityOp` descriptor; they must NOT write. `updateOp` embeds the optimistic `expectedU` from its read.

**Inputs from predecessors.** Task `IdbTable — single-table topology and query semantics` produced `src/db/idb/idb-table.ts` (`IdbTable`, `IdbTableInstance`, `KeyConditionParameters`, `QueryResult`) and `IdbDB.getRange`. Task `IdbDB service...` produced `IdbDB.transact(ops: ReadonlyArray<IdbWriteOp>)`, `IdbWriteOp` (put/patch/delete with `expectedU`), and `IdbDBError.conditionFailed`. Query through the table instance; write through `IdbDB.transact`.

**Out of scope.**

- No `EntityRegistry` and no barrel `index.ts` — Task 4 owns both (it consumes `IdbEntityOp`).
- Do not modify `src/db/idb/db.ts` / `layer.ts` / `idb-table.ts` except if a genuine bug blocks you — no interface changes.
- Do not modify `src/db/sqlite/` or `src/db/dynamodb/`.

**Acceptance criteria.**

- [ ] `src/db/idb/__tests__/entity.test.ts` (mirroring the scenarios of the sqlite `entity.test.ts` fixtures) covers: insert→get roundtrip with value equality and stamped meta (`_e`, `_v`, `_u`, `_d: 0`); duplicate insert fails; update changes the value and strictly increases `_u` lexicographically; update with a stale on-disk `_u` (simulate a concurrent write between read and commit by writing directly via `IdbDB.put`) fails with `conditionFailed`; `delete` tombstones (`get` behavior matches SQLiteEntity's post-delete behavior exactly); `hardDelete` removes the record; `query` over a derived index returns decoded values, excluding tombstones iff SQLiteEntity excludes them; an entity value stored at an old eschema version is auto-migrated on `get`; `insertOp`/`updateOp` return descriptors without writing.
- [ ] `src/db/idb/__tests__/single-entity.test.ts` mirrors the sqlite single-entity scenarios.
- [ ] `pnpm lint` and `pnpm build` pass.

**Done when.** `pnpm test src/db/idb` runs `entity.test.ts` and `single-entity.test.ts` green.

---

## Task: EntityRegistry with buffered transact [AFK]

**Why.** The registry is the app-facing composition point: many entity types on one table, one `setup()`, and — the piece this adapter exists to get right — atomic multi-entity writes despite IndexedDB's auto-committing transactions (ADR 0001).

**What.** `src/db/idb/entity-registry.ts`: the registry builder mirroring SQLite's (`EntityRegistry.make(table).register(entity).registerSingle(single).build()` with `entity()`, `singleEntity()`, `entityNames`, `table`, `setup()`), except the transaction surface: instead of SQLite's `transaction(effect)` wrapper, expose `transact(ops)` which applies pre-built `IdbEntityOp` descriptors in one native IDB transaction and flushes broadcasts only after commit. Also the module barrel `src/db/idb/index.ts`.

**Read first.**

- `src/db/sqlite/services/entity-registry.ts` — the builder/accessor template (copy everything except `transaction()` and `TransactionPendingBroadcasts` — those two do not exist here).
- `src/db/dynamodb/services/entity-registry.ts` — the descriptor-based `transact` precedent to align naming with.
- `src/db/idb/docs/adr/0001-buffered-transactions-and-auto-versioning.md` — why there is no `transaction(effect)`.
- `src/db/idb/idb-entity.ts` — `IdbEntityOp` (Task 3's output you consume).
- `src/db/sqlite/index.ts` — the barrel style to mirror (export functionality; types only where callers can't compile without them).

**Interface produced.**

```ts
// src/db/idb/entity-registry.ts
export class EntityRegistry<TTable, TEntities, TSingleEntities> {
  static make<TTable extends IdbTableInstance>(table: TTable): /* builder with .register / .registerSingle / .build */;
  entity<K extends keyof TEntities>(name: K): TEntities[K];
  singleEntity<K extends keyof TSingleEntities>(name: K): TSingleEntities[K];
  get entityNames(): (keyof TEntities | keyof TSingleEntities)[];
  get table(): TTable;
  setup(): Effect.Effect<void, IdbDBError, IdbDB>;
  /** All ops commit atomically in ONE native IndexedDB transaction, or none do. */
  transact(ops: ReadonlyArray<IdbEntityOp>): Effect.Effect<void, IdbDBError, IdbDB>;
}
```

`src/db/idb/index.ts` barrel exports: `IdbTable`, `IdbEntity`, `IdbSingleEntity`, `EntityRegistry`, `IdbDB`, `IdbDBError`, `idbLayer`, and the types `EntityType` re-export / `IdbEntityOp` / `IdbTableInstance` (match `src/db/sqlite/index.ts`'s selection style).

**Implementation notes (binding decisions).**

- `transact(ops)`: `IdbDB.transact(ops.map(o => o.write))`, then on success only, broadcast each `o.entity` via `Effect.serviceOption(Broadcaster)` (queue-then-flush; a failed transaction broadcasts nothing). No `TransactionPendingBroadcasts` `Context.Reference` — that mechanism exists solely for SQLite's interactive transactions.
- Nested/interactive transactions are not offered at all — do not add a `transaction(effect)` method, even a throwing stub.

**Inputs from predecessors.** Task `IdbEntity and IdbSingleEntity` produced `src/db/idb/idb-entity.ts` with `IdbEntityOp = { write: IdbWriteOp; entity: EntityType<unknown> }` and the `insertOp`/`updateOp` producers. Task 1 produced `IdbDB.transact` with all-or-nothing `expectedU` semantics. Task 2 produced `IdbTableInstance` and `setup()` delegation.

**Out of scope.**

- No package.json / README changes — Task 5 owns those.
- No conformance suite — Task 6 owns `src/db/__tests__/`.
- Do not change `IdbEntityOp`'s shape; if it doesn't fit, that's a Task 3 bug to fix minimally, noting it.

**Acceptance criteria.**

- [ ] `src/db/idb/__tests__/entity-registry.test.ts` covers: registering two entity types + one single entity and routing via `entity('name')` with correct types; `setup()` creates the store and all derived indexes once; `transact([insertOp(a), updateOp(b-with-stale-_u)])` applies NEITHER write (a is absent afterward) and fails with `conditionFailed`; a successful `transact` of ops on two different entity types persists both and broadcasts both entities (assert via a stub `Broadcaster` layer) in op order; a failed `transact` broadcasts nothing.
- [ ] Barrel compiles: `import { IdbTable, IdbEntity, EntityRegistry, idbLayer } from '.../db/idb/index.js'` works in the tests.
- [ ] `pnpm lint` and `pnpm build` pass.

**Done when.** `pnpm test src/db/idb` runs all four idb test files green.

---

## Task: Package wiring — ./idb export, README, depcruise [AFK]

**Why.** Until `std-toolkit/idb` resolves, the adapter exists only for this repo's tests — this slice makes it a consumable deliverable, matching how `./sqlite` and `./dynamodb` ship.

**What.** Add the `"./idb"` subpath export to `package.json`, add an `indexeddb` keyword, write `src/db/idb/README.md`, and prove the module respects the repo's dependency-boundary rules.

**Read first.**

- `package.json` lines 18–73 — the exports map; copy the `"./sqlite"` entry shape exactly (`types` + `default` pointing into `dist/`).
- `src/db/sqlite/README.md` — the README structure and depth to mirror (quickstart with layer + table + entity + registry, then API notes).
- `src/db/idb/CONTEXT.md` and the ADR — the README should link to both, not restate them.
- `depcruise.config.ts` — the boundary rules the new module must satisfy.

**Interface produced.**

```jsonc
// package.json additions
"./idb": {
  "types": "./dist/db/idb/index.d.ts",
  "default": "./dist/db/idb/index.js"
},
"./idb/*": {
  "types": "./dist/db/idb/*",
  "import": "./dist/db/idb/*"
}
```

Consumers import as `import { IdbTable, IdbEntity, EntityRegistry, idbLayer } from 'std-toolkit/idb'`. (Internal-only otherwise.)

**Inputs from predecessors.** Task `EntityRegistry with buffered transact` produced the barrel `src/db/idb/index.ts` whose exports the README documents: `IdbTable`, `IdbEntity`, `IdbSingleEntity`, `EntityRegistry`, `IdbDB`, `IdbDBError`, `idbLayer`.

**Out of scope.**

- No source changes under `src/db/idb/*.ts` — this task owns only `package.json` and `src/db/idb/README.md`.
- Do not touch `src/db/__tests__/` (a parallel task owns it).
- Do not restructure existing exports entries.

**Acceptance criteria.**

- [ ] README shows a runnable quickstart: `idbLayer('my-app-db', 'std_data')` → table → entity → registry → `setup()` → insert/query, and one sentence each on auto-versioned setup ("the db name belongs to the adapter") and buffered `transact` (linking the ADR).
- [ ] `pnpm build` emits `dist/db/idb/index.js` + `.d.ts` and the exports paths resolve.
- [ ] `pnpm lint` and `pnpm lint:depcruise` pass.

**Done when.** `pnpm build && pnpm lint && pnpm lint:depcruise` all succeed with the new export in place.

---

## Task: Shared conformance suite over sqlite and idb [AFK]

**Why.** The North Star's non-negotiable is behavioral parity between the two sync-local adapters. Today parity is enforced by nothing — assertions are hand-duplicated per adapter and can silently drift. This suite is the repo's first single source of truth for shared-kernel behavior: one assertion set, two layers.

**What.** `src/db/__tests__/conformance.test.ts`: a vitest suite parameterized over both adapters (`describe.each`), running identical table-level and entity-level assertions against SQLite (in-memory better-sqlite3) and IDB (fake-indexeddb). DynamoDB is deliberately excluded (requires a live endpoint, not an in-process fake).

**Read first.**

- `src/db/sqlite/services/__tests__/entity.test.ts` — fixtures, `itEffect` helper, `betterSqlite3Layer(new Database(':memory:'), 'std_data')` layer construction (lines 4–5, 48–58, 66–69).
- `src/db/idb/__tests__/table.test.ts` and `entity.test.ts` — the idb-side fixtures to reuse/harmonize.
- `src/db/sqlite/services/sqlite-table.ts` (operator semantics, `getSortDirection`) and `src/db/idb/idb-table.ts` — the two surfaces under test; the suite may only use methods that exist on BOTH (`getItem`, `putItem`, `deleteItem`, `query`, `index().query`, plus entity `get/insert/update/delete/query`).
- `vite.config.ts` — test include pattern (`src/**/__tests__/**/*.test.ts` — the new location is already matched).
- `depcruise.config.ts` — in case cross-adapter test imports trip a boundary rule.

**Interface produced.** Internal-only — a test file. Its adapter-fixture list is the extension point future adapters add themselves to:

```ts
const adapters = [
  { name: 'sqlite', makeLayer: () => betterSqlite3Layer(new Database(':memory:'), 'std_data'), makeTable: ..., makeEntity: ... },
  { name: 'idb',    makeLayer: () => idbLayer(`conformance-${n++}`, 'std_data'),               makeTable: ..., makeEntity: ... },
];
describe.each(adapters)('conformance: $name', ({ makeLayer, makeTable, makeEntity }) => { ... });
```

**Implementation notes (binding decisions).**

- `import 'fake-indexeddb/auto'` at the top (harmless for the sqlite rows). Unique IDB database name per test via a counter, and a fresh `:memory:` sqlite database per test — no state may leak between the two adapters or between tests.
- Where SQLite and IDB genuinely differ by design (raw row `_data` string vs object), assert through DECODED entity values or key sets, never raw storage rows.
- Adapter-specific behavior (IDB `transact` atomicity, auto-versioning, optimistic `conditionFailed`) stays in `src/db/idb/__tests__/` — do not add it here, since sqlite has no equivalent surface.
- If `pnpm lint:depcruise` flags the cross-adapter imports from `src/db/__tests__/`, add an exemption for `src/**/__tests__/**` in `depcruise.config.ts` rather than relocating the suite.

**Behaviors the suite must cover (identical assertions per adapter).**

1. Each of the 7 `SortKeyCondition` operators returns exactly the expected key set, in order, from a seeded item collection (including `between` inclusivity on both ends and `beginsWith` prefix boundaries — a key equal to the prefix itself, and a neighboring prefix excluded).
2. `<` / `<=` queries return descending by default; `ScanIndexForward` overrides in both directions.
3. `Limit` truncates; default limit is 100.
4. Secondary-index query returns only records carrying the index keys (sparse) and orders by the index sk.
5. Entity insert→get roundtrip: decoded value equality, meta stamped (`_e`, `_v`, fresh `_u`, not tombstoned).
6. Entity update: value changes and `_u` strictly increases lexicographically.
7. Entity soft delete: identical post-delete visibility on both adapters for `get` and `query`.
8. Duplicate entity insert fails on both.

**Inputs from predecessors.** Task `EntityRegistry with buffered transact` produced the barrel `src/db/idb/index.ts` (import `idbLayer`, `IdbTable`, `IdbEntity` from it). The sqlite side imports from `src/db/sqlite/index.js` (already exists). Tasks 2–3 produced the idb test files whose fixtures you may reuse.

**Out of scope.**

- Do not modify any adapter source to make a test pass without flagging it — a conformance failure is a real finding; fix the DIVERGING adapter to match the SQLite behavior (SQLite is the reference), or surface the discrepancy in your final report if the right behavior is ambiguous.
- Do not touch `package.json` or `src/db/idb/README.md` (a parallel task owns them).
- Do not add DynamoDB to the matrix.

**Acceptance criteria.**

- [ ] All 8 behavior groups above implemented as `describe.each` tests, green for BOTH adapters.
- [ ] Existing test files remain untouched and green (`pnpm test` full run).
- [ ] `pnpm lint` and `pnpm lint:depcruise` pass.

**Done when.** `pnpm test` (full suite) is green, with `conformance.test.ts` reporting both `conformance: sqlite` and `conformance: idb` blocks passing.
