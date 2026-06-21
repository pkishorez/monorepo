# tanstack-sync — Ubiquitous Language

## Core concepts

### Entity

The server/wire form of a record:

```
{ value: T, meta: { _e, _v, _u, _d } }
```

**value** — the domain data fields.

**Entity Meta** — the internal block attached to every entity.

- `_e` — **type tag**. Must equal the owning collection's `schema.name`.
- `_v` — **schema version**. Passed through by the sync engine.
- `_u` — **update key**. Server-assigned ISO timestamp string. Higher lexicographic value wins.
- `_d` — **deletion flag**. `true` means the entity is a tombstone.

Users do not author Entity Meta during normal collection mutations. Server APIs return envelopes; the sync engine consumes them.

### Item

The TanStack DB form of an entity. All `value` fields are hoisted to the top level, and Entity Meta is nested under `_meta`.

```
Entity  ->  Item
{ value: { id, name }, meta: { _e, _v, _u, _d } }
-> { id, name, _meta?: { _e, _v, _u, _d }, $synced, $origin }
```

TanStack DB adds computed sync annotations such as `$synced` and `$origin` on reads. They are not persisted and are not part of the domain model.

### Entity Ownership

Within one `createStdSync()` instance, an entity type may belong to exactly one collection. Entity identity is `schema.name`.

A tracker registration for an already-owned `schema.name` is a configuration error. Incoming envelopes with `meta._e` that does not match the target collection's `schema.name` are wrong-entity inputs.

### Convergence Rule

The rule for server-truth writes:

- Newer `_u` overwrites older `_u`.
- Older `_u` is a successful no-op.
- A newer `_d: true` tombstone wins and removes the visible collection row.
- Tombstones remain in the Source of Truth.

The rule applies to strategy results, mutation results, persisted manual writes, and persisted broadcasts.

### Collection

A TanStack DB in-memory projection of one entity type. It holds Items visible to the UI. It is not the source of truth.

The collection may contain rows from partitions that are no longer active. Partition unload stops sync work; it does not remove projected rows.

### Sync Shape

Two public methods:

- **sync** — a keyed collection. Declares an optional **global** strategy (mirrors the whole set, runs the `__total__` partition) and/or an optional **`partitions`** map (per field-value slice, activated on demand). Global and partitions coexist in one engine over one shared SoT.
- **singleItemSync** — holds exactly one record with no id field. Separate strategy family.

### Partition

A sync lifecycle boundary for `partitionSync`, scoped to one `partitionField = value`.

Partitions are activated by TanStack DB `loadSubset(options)` and deactivated by `unloadSubset(options)`. The engine refcounts matching subsets. Refcount `0 -> 1` starts the partition strategy runtime; refcount `1 -> 0` stops it.

A partition is not a collection-retention boundary. Rows loaded by inactive partitions can remain projected in the collection.

### Source of Truth (SoT)

The per-collection server-confirmed state owned by the engine.

For keyed collections, it is one entity namespace per collection (not per partition). For single-item collections, it is the singleton equivalent.

SoT is **fully detached from Sync State**. There is no derivation between them — the engine never reads SoT to compute a cursor or high-water mark. A strategy that needs a cursor stores it in its own Sync State.

SoT can use the default memory backend or a configured Offline Storage backend. When Offline Storage is durable, SoT remains available across reloads.

**What writes to SoT:**

- Strategy results through the internal server-truth writer.
- Mutation results after the server returns an envelope.
- Manual writes with `persist: true`.
- Broadcasts with `persist: true`.

**What does not write to SoT:**

- Optimistic mutation state before server confirmation.
- Manual writes with `persist: false`.
- Broadcasts with `persist: false`.

SoT can be written while the TanStack collection is unmounted. If callbacks are absent, projection is deferred. On mount, the engine projects current SoT into the collection.

Server-truth writes are atomic. A batch either succeeds as a whole or fails through `WriteError`. Stale valid envelopes are no-ops, not failures.

### Collection Projection

The TanStack DB write side of the engine. It translates SoT state into insert/update/delete messages for the collection callbacks.

Projection is ephemeral. On reload it clears. When durable Offline Storage is configured, the collection is rebuilt from persisted SoT.

### Sync State

Serializable per-strategy, per-partition data stored by the engine and interpreted by the strategy. Persisted Sync State is wrapped with the owning strategy name and decoded through that strategy's state schema before a strategy sees it.

Examples:

- `OldToNew` may track a high-water mark.
- A future `NewToOld` may track page tokens or gap windows.
- A polling single-item strategy may not need any state.

Sync State is one serializable slot per strategy partition. It is fully detached from SoT — no value in Sync State is derived from SoT and vice versa. The strategy is responsible for ordering: it first ensures items are written to SoT via `writeServerTruth`, then advances its own Sync State.

The engine owns storage mechanics; the strategy owns meaning. If the stored strategy name does not match the current strategy, or the stored state fails the current strategy schema, the engine logs a warning, resets that slot to the strategy's empty state, and continues. Sync State is affected only by strategy-owned sync operations. Registry writes, mutation results, and manual persisted writes never advance it.

Runtime resources such as fibers, subscriptions, abort controllers, semaphores, and callbacks are not Sync State.

### Offline Storage

Optional durable local storage for engine-owned Source of Truth and Sync State.

Offline Storage is not Collection Projection. It may support offline-capable behavior, but it does not by itself define mutation queuing, conflict policy, or network behavior.

An Offline Storage Group is a named key-value space inside Offline Storage. Source of Truth uses one group per collection, keyed by entity id or singleton key. Sync State uses one group per collection, keyed by partition identity such as the global partition or a serialized partition field/value pair.

_Avoid_: Cache.

### Sync Lifecycle

The active runtime window in which a strategy may perform work.

For a global keyed strategy, the global partition starts when collection sync starts and stops when collection cleanup runs.

For `partitionSync`, each partition starts and stops through TanStack DB's `loadSubset` / `unloadSubset` lifecycle.

For `singleItemSync`, lifecycle is collection-level: start on sync start, stop on cleanup.

### Sync Strategy

The pluggable unit that decides how data flows from the server into the engine.

A strategy is **partition-blind**. Its entire contract is "given my current cursor, fetch the next batch" — it has no concept of partitions, partition values, or lifecycle mechanics.

A strategy does not own SoT. At lifecycle start the engine calls `run(ctx)` with a `StrategyContext`:

```ts
type StrategyContext<TItem, TState> = {
  writeServerTruth: (entities) => Effect.Effect<void, WriteError>;
  getState: Effect.Effect<TState>; // decoded state for this strategy partition
  setState: (state: TState) => Effect.Effect<void>; // routed to this partition's slot
  scope: Scope.Scope; // for subscriptions/fibers
};
```

`StrategyContext` carries **no partition value**. The partition value lives only in the user's `fetch` closure and the engine's per-partition runtime map.

The strategy contract is a single method `run(ctx): Effect<void, WriteError, Scope>`. A strategy does **not** catch failures from `writeServerTruth` — it lets `WriteError` surface. The engine owns the recovery policy: on any `run` failure it logs the error, tears down the current run, and restarts `run` from the top on a fixed 2-second spaced schedule. Because a restart re-reads Sync State, a drain resumes from its last cursor. `run` may complete early (a pull that drains) or stay alive (a subscription); completion is **not** teardown. Teardown happens only when the engine closes the partition scope, which also interrupts the retry loop. Cleanup is the strategy's own `Effect.addFinalizer` registered on that scope; the engine never knows what is being torn down. Strategies expose **no public utils** — there is no `utils.sync`. A partitioned collection can hold heterogeneous per-partition strategies, so no single strategy-specific util surface can be type-safe. `collection.utils` is engine-owned and generic only (`schema`, `write`, `mutation`).

**Strategy binding per shape:**

- Global keyed strategy — `strategy` is a single strategy instance (collection-scoped, one global partition).
- `partitionSync` — `strategy` is a factory `(partitionValue) => Strategy`. The engine calls it on partition refcount `0→1`; the strategy captures the value by closure and stays partition-blind.

**Partitioned strategy family**:

- **OldToNew** — fetches from older records toward newer records.
- **NewToOld** _(future)_ — fetches from newer records backward.

**Single-item strategy family**:

- **GetOnce** — fetches once on lifecycle start.
- **Poll** — fetches on start and repeats while active.
- **Subscribe** — receives a stream while active.

### Mutations (`onInsert` / `onUpdate` / `onDelete`)

Thin API call wrappers configured per collection.

Flow:

1. TanStack DB handles optimistic mutation state and rollback.
2. The engine extracts the mutation payload.
3. The user-supplied Effect calls the server.
4. The server returns a confirmed envelope.
5. The engine writes that envelope through `writeServerTruth`.

`onDelete` returns a tombstone envelope with `_d: true`, not `void`.

Mutation results do not touch Sync State.

### Utils

The public utility surface is a flat set of engine-owned functions.

```ts
utils.schema();
utils.writeUpsert(entityOrEntities);
utils.pacedUpdate(key, changes);
utils.pendingCount(key);
utils.subscribePending(listener);
```

`utils.writeUpsert(entityOrEntities)` returns `Effect.Effect<void, WriteError>` and writes server truth through SoT convergence.

### Registry

The router for broadcast messages. `registry()` returns `process(message)`, which routes each envelope by `_e` to the collection that owns that entity type in the same `createStdSync()` instance.

Because entity ownership is disjoint, each `_e` has at most one target collection.

### Broadcast

A message containing one or more entities:

```
{ values: Entity[], persist: boolean }
```

The transport is the caller's concern. The message shape is the sync engine's concern.

`persist: true` treats the broadcast as server truth and writes SoT + collection.  
`persist: false` projects only to the mounted collection.  
Neither mode touches Sync State.

### Tracker

Internal structure that remembers which collections a `createStdSync()` instance created. It enforces unique ownership by `schema.name` and is used by the registry for routing.

### createStdSync

The factory. One call per app or feature scope. Returns `sync`, `singleItemSync`, and `registry`.

`sync` is the unified keyed-collection method. One collection declares an optional **global** `strategy` (an instance, runs the `__total__` partition at sync start) and an optional **`partitions`** map (`field → (partitionValue) => Strategy`, each activated on a matching `loadSubset`). Both coexist in one engine sharing one SoT; convergence dedupes overlap. The runtime routes each live query: matching partition field → that partition's strategy; no match → covered by the global (or `console.error` if no global configured).

The public surface of the main barrel, no exported types: `createStdSync`, `syncStrategy` (`syncStrategy.oldToNew`), `singleItemSyncStrategy` (`singleItemSyncStrategy.getOnce`), and `paceStrategy` (`paceStrategy.coalesce`, `paceStrategy.debounce`, ...). The `@std-toolkit/tanstack-sync/paced` subpath additionally exports the raw `coalesceStrategy` primitive. All config/result/interface types flow through inference.

### StdSync

The object returned by `createStdSync`.

### Pace Strategy

A distinct axis from a **sync strategy**. A _pace strategy_ controls **when** `pacedUpdate`'s optimistic mutations are committed to the server, not how data is pulled into the SoT. It plugs into TanStack DB's `createPacedMutations`. Built-in pacers are `debounce`, `throttle`, and `queue`; std-sync adds `coalesce`. Exposed two ways: the raw reusable primitive `coalesceStrategy()` (drop into any `createPacedMutations`), exported from the **`@std-toolkit/tanstack-sync/paced` subpath** (not the main barrel), and the collection-level namespace `paceStrategy` (`paceStrategy.coalesce()`, `paceStrategy.debounce(...)`, ...) selected via the `updatePacing?` field on `sync`.

### Coalesce (pace strategy)

Single-flight with trailing coalescence. The first `pacedUpdate` for a key fires its request immediately (leading edge). While that request is in flight, every further `pacedUpdate` for the same key is merged (coalesced) into one pending mutation. The moment the in-flight request resolves, that merged mutation fires as a single request — repeating until quiet. Paced by request completion, **not** by a timer (unlike `debounce`/`throttle`). `coalesceStrategy({ wait? })` takes an optional `wait` (default `0`): a cooldown gap measured **from request completion**, not from user input. The leading-edge first call always fires immediately regardless of `wait`. On **success**, if a coalesced backlog exists, the merged trailing mutation fires after the `wait` gap (immediately when `wait` is `0`); an empty backlog fires nothing; on **failure** the in-flight gate clears but the coalesced backlog is retained, so the next `pacedUpdate` fires it leading-edge. The pacer never retries or backs off — that stays in the user's Effect.
