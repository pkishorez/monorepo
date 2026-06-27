# tanstack-sync — Ubiquitous Language

> Shared toolkit-wide terms (**Entity**, **Entity Meta**, **SingleEntity**, **Broadcaster**, **StdToolkitError**) are defined by [[core]]. This glossary defines only tanstack-sync's own vocabulary and how it interprets the shared spine. See the root `CONTEXT-MAP.md`.

## Core concepts

### Entity

The server/wire form of a record — `{ value, meta }`, defined by [[core]]. tanstack-sync consumes entities; it does not redefine their shape.

What this context adds on top of the core definition:

- `_e` — within a `createStdSync()` instance, must equal the owning collection's `schema.name` (see **Entity Ownership**).
- `_v` — schema version, passed through by the sync engine.
- `_u` — interpreted as the **convergence** key: higher lexicographic value wins (see **Convergence Rule**).
- `_d` — deletion flag; a `true` value is a tombstone.
- `_s` / `_c` — read by **Cadence Sync**: `_s` detects freshly-delivered rows, and the `_c − _s` gap is the clock skew it corrects for when judging readiness.

Users do not author Entity Meta during normal collection mutations. Server APIs return entities; the sync engine consumes them.

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

A tracker registration for an already-owned `schema.name` is a configuration error. Incoming entities with `meta._e` that does not match the target collection's `schema.name` are wrong-entity inputs.

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

- **sync** — a keyed collection. Declares an optional **global** strategy (mirrors the whole set, runs the **global partition**) and/or an optional **`partitions`** map (per field-value slice, activated on demand). Global and partitions coexist in one engine over one shared SoT.
- **singleItemSync** — holds exactly one record with no id field. Separate strategy family.

### Partition

A sync lifecycle boundary for a partitioned `sync` collection, scoped to one `partitionField = value`.

Partitions are activated by TanStack DB `loadSubset(options)` and deactivated by `unloadSubset(options)`. The engine refcounts matching subsets. Refcount `0 -> 1` starts the partition strategy runtime; refcount `1 -> 0` stops it.

A partition is not a collection-retention boundary. Rows loaded by inactive partitions can remain projected in the collection.

### Source of Truth (SoT)

The per-collection server-confirmed state owned by the engine.

For keyed collections, it is one entity namespace per collection (not per partition). For single-item collections, it is the singleton equivalent.

SoT is **fully detached from Sync State**. There is no derivation between them — the engine never reads SoT to compute a cursor or high-water mark. A strategy that needs a cursor stores it in its own Sync State.

SoT can use the default memory backend or a configured Offline Storage backend. When Offline Storage is durable, SoT remains available across reloads.

**What writes to SoT:**

- Strategy results through the internal server-truth writer.
- Mutation results after the server returns a confirmed entity.
- Manual writes with `persist: true`.
- Broadcasts with `persist: true`.

**What does not write to SoT:**

- Optimistic mutation state before server confirmation.
- Manual writes with `persist: false`.
- Broadcasts with `persist: false`.

SoT can be written while the TanStack collection is unmounted. If callbacks are absent, projection is deferred. On mount, the engine projects current SoT into the collection.

Server-truth writes are atomic. A batch either succeeds as a whole or fails through `WriteError`. Stale valid entities are no-ops, not failures.

### Collection Projection

The TanStack DB write side of the engine. It translates SoT state into insert/update/delete messages for the collection callbacks.

Projection is ephemeral. On reload it clears. When durable Offline Storage is configured, the collection is rebuilt from persisted SoT.

### Sync State

Serializable per-strategy, per-partition data stored by the engine and interpreted by the strategy. Persisted Sync State is wrapped as a **Stored Sync State** and decoded through that strategy's state schema before a strategy sees it.

A **Stored Sync State** is the on-disk wrapper the engine writes to Offline Storage for one strategy partition:

```
{ strategy: string, value: unknown, meta?: PartitionMeta }
```

- `strategy` — the owning strategy name. On read, a mismatch resets the slot to the strategy's empty state.
- `value` — the opaque strategy-owned Sync State.
- `meta` — optional partition identity for inspection.

It shares no vocabulary with **Entity**: it carries strategy bookkeeping, never server truth. (The internal identifier `StoredStrategyState` refers to this wrapper; "envelope" is retired as a glossary term.)

Examples:

- `OldToNew` may track a high-water mark.
- `NewToOld` tracks a list of covered `_u` slices plus a `reachedOldest` flag.
- A polling single-item strategy may not need any state.

Sync State is one serializable slot per strategy partition. It is fully detached from SoT — no value in Sync State is derived from SoT and vice versa. The strategy is responsible for ordering: it first ensures items are written to SoT via `writeServerTruth`, then advances its own Sync State.

The engine owns storage mechanics; the strategy owns meaning. If the stored strategy name does not match the current strategy, or the stored state fails the current strategy schema, the engine logs a warning, resets that slot to the strategy's empty state, and continues. Sync State is affected only by strategy-owned sync operations. Registry writes, mutation results, and manual persisted writes never advance it.

Runtime resources such as fibers, subscriptions, abort controllers, semaphores, and callbacks are not Sync State.

### Offline Storage

Optional durable local storage for engine-owned Source of Truth and Sync State.

Offline Storage is not Collection Projection. It may support offline-capable behavior, but it does not by itself define mutation queuing, conflict policy, or network behavior.

An Offline Storage Group is a named key-value space inside Offline Storage. Source of Truth uses one group per collection, keyed by entity id or singleton key. Sync State uses one group per collection, keyed by partition identity such as the global partition (internal key `GLOBAL_PARTITION_KEY = '__total__'`) or a serialized partition field/value pair.

_Avoid_: Cache.

### Sync Lifecycle

The active runtime window in which a strategy may perform work.

For a global keyed strategy, the global partition starts when collection sync starts and stops when collection cleanup runs.

For a partitioned `sync` collection, each partition starts and stops through TanStack DB's `loadSubset` / `unloadSubset` lifecycle.

For `singleItemSync`, lifecycle is collection-level: start on sync start, stop on cleanup.

### Cursor

An opaque boundary marker handed to the user's `fetch` closure. Concretely it is the boundary **entity** (`Cursor<TItem> = EntityType<TItem>`), not a bare `_u` string.

The strategy never interprets a cursor except to read `_u` for ordering and boundary comparison. "How to fetch older/newer than this cursor" — and any tie-breaking to keep `_u` a strict total order — is the closure's concern. `{ cursor: null }` means the natural extreme page (newest for `fetchOlder`, oldest for `fetchNewer`).

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
- Partitioned `sync` — each entry in the `partitions` map is a factory `(partitionValue) => Strategy`. The engine calls it on partition refcount `0→1`; the strategy captures the value by closure and stays partition-blind.

**Partitioned strategy family**:

- **OldToNew** — fetches from older records toward newer records.
- **NewToOld** _(future)_ — newest-first delivery with a live tail. Exists to escape `OldToNew`'s limitation: with a large backlog, `OldToNew` blocks the newest records behind a full replay of the backlog. `NewToOld` makes the newest records visible **immediately** and pushes the bulk fill into the background. It runs two activities under the strategy scope:
  - **Live tail** (`subscribeNewer`, a stream): each session anchors at the **fresh current top** (the newest record of the latest slice it just fetched), then streams forward live. It anchors at the fresh top, **not** the saved high-water — anchoring at the saved high would re-impose the `OldToNew` replay problem.
  - **Backfill** (`fetchOlder`, a cursor-based pull): a single descending frontier from the latest slice's low end, skipping/merging older covered ranges as it meets them, draining toward the absolute bottom in the background.

  Covered state is a **persisted list of disjoint `_u` ranges (slices)** plus a single collection-level `reachedOldest` flag:

  ```ts
  type Slice = { low: Cursor; high: Cursor }; // boundary entities at the lowest & highest _u of a contiguous loaded range
  type NewToOldState = { slices: Slice[]; reachedOldest: boolean };
  ```

  - A **slice** is a contiguous loaded range whose `low`/`high` are the boundary **entities** at the oldest and newest `_u` of the range. Slice ordering and overlap are computed by comparing those entities' `_u`.
  - **Reconcile** runs on every batch (live-tail push and backfill pull alike): extend the touched slice, then merge any slices that overlap or touch, keeping the list disjoint and minimal. Overlap is detected by `_u` comparison — the strategy reads `_u` to sort batches and compare boundaries; the cursor is opaque only as to _how to fetch older from it_. Exact no-overlap adjacency is undetectable but harmless: backfill overlaps into the next slice on its next page and merges then.
  - **`reachedOldest`** is a property of the whole sync, not of a slice. It becomes true only after the lowest material slice has been proven to reach the absolute floor. An empty collection leaves `reachedOldest: false` because there is no bottom slice to anchor future gaps. The Upward Migration invariant guarantees the oldest record never moves, so once a material floor is proven, the flag is true forever. Every later session is then **pure gap-filling above the floor** — backfill stops as soon as its frontier merges into the bottom-most slice and never probes below the floor again.
  - The **latest slice** is just the session's first `fetchOlder({ cursor: null })` (null ⇒ newest page); no separate "get latest" endpoint.

  **Run shape.** Every session (warm or cold) runs the same sequence: (1) `fetchOlder({ cursor: null })` → reconcile → `freshTop`; (2) start the live tail anchored at `freshTop`; (3) start backfill descending from the latest page's low. The live tail anchors at the **fresh** top every time, never the saved high. Both fibers live under the one strategy `scope` and share the `slices` state through a single `SynchronizedRef` whose `updateEffect` reconciles and persists atomically. A `WriteError` in either fiber surfaces and restarts the whole `run` (per the standard strategy contract); the restart re-reads persisted `slices`/`reachedOldest` and resumes.

  A large reload gap produces genuinely disjoint slices (old region + fresh top slice) with a real gap that backfill grinds through later; if the data did not grow, the fresh latest slice overlaps the saved top slice and reconcile collapses them, so no spurious gap. Relies on the **Upward Migration invariant** below to keep covered ranges trustworthy across reloads.

- **Bidirectional** _(future)_ — newest-first delivery (like `NewToOld`) plus a second backfill frontier ascending from the absolute oldest record. Exists to make the **oldest** records visible immediately too, instead of only after the downward backfill grinds through the whole backlog. Coverage converges on a single gap closed from **both ends**. Both backfill directions are **cursor pulls** (loops), so each re-reads the shared slice list every iteration and stops cleanly at collapse; only the live tail is a stream. It runs three activities under the strategy scope:
  - **Live tail** (`subscribeNewer`, a stream): anchors at the session's fresh top, streams forward live, stays open.
  - **Downward frontier** (`fetchOlder`, a cursor pull): `{ cursor: null }` resolves the **newest page**; a non-null cursor resolves the page strictly **older** than it. Descends from the top slice's low.
  - **Upward frontier** (`fetchNewer`, a cursor pull): `{ cursor: null }` resolves the **oldest page**; a non-null cursor resolves the page strictly **newer** than it; an empty batch means the frontier has caught up. Ascends from the bottom slice's high.

  Every session seeds the newest page (`fetchOlder({ cursor: null })`) and the oldest page (`fetchNewer({ cursor: null })`) — both complete before the fibers start, giving a deterministic two-slice (or already-collapsed) starting state. The live tail anchors at the `freshTop` from the newest-page seed.

  Covered state is the same disjoint `_u` slice list as `NewToOld`, **minus** `reachedOldest`:

  ```ts
  type BidirectionalState = { slices: Slice[] };
  ```

  `reachedOldest` is dropped because the upward frontier anchors the true floor on page one of every session, so "have we reached the oldest" is always yes — a constant flag carries no information. The inspector's slice-count derivation keys off `slices` alone, so parity holds.
  - **Termination** is **single-slice collapse**: when the slice list reduces to one contiguous range, both anchors are covered and the gap is closed. The downward frontier marches from the top slice's `low` (swallowing middle gaps as it descends); the upward frontier marches from the bottom slice's `high` (swallowing middle gaps as it rises). Whichever reconciles the closing batch produces `slices.length === 1`; the other observes it on its next loop and exits. A warm resume whose gap is already closed starts, both pulls see one slice, exit immediately, and only the live tail keeps running.
  - **Empty collection**: a frontier whose **seed page is empty** exits immediately. With a genuinely empty dataset neither pull has anything to do, `slices` stays empty (never reaches one slice — harmless), and the live tail parks waiting for the first arrival. So a frontier stops when `slices` collapses to one **or** its seed page is empty.

#### Upward Migration invariant (`_u` ordering)

`_u` is a global monotonic update key: an update moves a record strictly above every existing `_u` (toward "now"). Records therefore migrate **only upward**, never downward into a historical interval.

Consequence: a `_u` interval, once fully drained, is **permanently complete** — it can only _shed_ records (they get edited and jump to the top, where a later pass re-fetches them and convergence dedupes by id) and can **never gain** a record it did not already see. This is what lets `NewToOld` snapshot frozen `_u` boundary values and trust that "covered" stays covered across sessions, without needing a separate creation key.

The cursor handed to the user's fetch closure is **opaque** (the boundary entity, as in `OldToNew`); the strategy never interprets it. "Fetch older records than this cursor" and any tie-breaking to keep `_u` a strict total order are the closure's concern. The strategy assumes `_u` is strictly unique per entity and only records the `[oldest, newest]` `_u` range of each returned batch.

**Single-item strategy family**:

- **GetOnce** — fetches once on lifecycle start.
- **Poll** — fetches on start and repeats while active.
- **Subscribe** — receives a stream while active.

### Cadence Sync

A drift-repair loop that runs **in parallel** with a partition's Sync Strategy, forked under the same partition scope. It does not pull new history; it re-confirms recently-delivered rows so the strategy's covered ranges do not silently drift.

Each pass scans the partition's projected rows (narrowed to `field = value`) for **suspects** — rows delivered so close to their own `_u` that sibling records at the same `_u` may still have been in flight (`_s − Date.parse(_u) < window`). Once the oldest suspect has aged past `readiness` (adjusting for the `_c − _s` clock skew), it re-fetches from the suspect's predecessor anchor and writes the result through `writeServerTruth`.

Cadence Sync **only writes Source of Truth**; it never reads or advances Sync State — it owns no cursor and claims no forward progress. It is optional per partition (`cadence?: CadenceConfig | false`) and inherits a `defaultCadence` from `createStdSync`. Config is `{ window, readiness, pollDelay, debug? }`.

_Avoid_: Cadence Sync Strategy (it is not a Sync Strategy), polling.

### Mutations (`onInsert` / `onUpdate` / `onDelete`)

Thin API call wrappers configured per collection.

Flow:

1. TanStack DB handles optimistic mutation state and rollback.
2. The engine extracts the mutation payload.
3. The user-supplied Effect calls the server.
4. The server returns a confirmed entity.
5. The engine writes that entity through `writeServerTruth`.

`onDelete` returns a tombstone entity with `_d: true`, not `void`.

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

The router for broadcast messages. `registry()` returns `process(message)`, which routes each entity by `_e` to the collection that owns that entity type in the same `createStdSync()` instance.

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

`sync` is the unified keyed-collection method. One collection declares an optional **global** `strategy` (an instance, runs the **global partition** at sync start) and an optional **`partitions`** map (`field → (partitionValue) => Strategy`, each activated on a matching `loadSubset`). Both coexist in one engine sharing one SoT; convergence dedupes overlap. The runtime routes each live query: matching partition field → that partition's strategy; no match → covered by the global (or `console.error` if no global configured).

The public surface of the main barrel, no exported types: `createStdSync`, `syncStrategy` (`syncStrategy.oldToNew`), `singleItemSyncStrategy` (`singleItemSyncStrategy.getOnce`), and `paceStrategy` (`paceStrategy.coalesce`, `paceStrategy.debounce`, ...). The `@std-toolkit/tanstack-sync/paced` subpath additionally exports the raw `coalesceStrategy` primitive. All config/result/interface types flow through inference.

### StdSync

The object returned by `createStdSync`.

### Pace Strategy

A distinct axis from a **sync strategy**. A _pace strategy_ controls **when** `pacedUpdate`'s optimistic mutations are committed to the server, not how data is pulled into the SoT. It plugs into TanStack DB's `createPacedMutations`. Built-in pacers are `debounce`, `throttle`, and `queue`; std-sync adds `coalesce`. Exposed two ways: the raw reusable primitive `coalesceStrategy()` (drop into any `createPacedMutations`), exported from the **`@std-toolkit/tanstack-sync/paced` subpath** (not the main barrel), and the collection-level namespace `paceStrategy` (`paceStrategy.coalesce()`, `paceStrategy.debounce(...)`, ...) selected via the `updatePacing?` field on `sync`.

### Coalesce (pace strategy)

Single-flight with trailing coalescence. The first `pacedUpdate` for a key fires its request immediately (leading edge). While that request is in flight, every further `pacedUpdate` for the same key is merged (coalesced) into one pending mutation. The moment the in-flight request resolves, that merged mutation fires as a single request — repeating until quiet. Paced by request completion, **not** by a timer (unlike `debounce`/`throttle`). `coalesceStrategy({ wait? })` takes an optional `wait` (default `0`): a cooldown gap measured **from request completion**, not from user input. The leading-edge first call always fires immediately regardless of `wait`. On **success**, if a coalesced backlog exists, the merged trailing mutation fires after the `wait` gap (immediately when `wait` is `0`); an empty backlog fires nothing; on **failure** the in-flight gate clears but the coalesced backlog is retained, so the next `pacedUpdate` fires it leading-edge. The pacer never retries or backs off — that stays in the user's Effect.
