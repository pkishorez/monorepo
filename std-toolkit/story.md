# tanstack-sync — The Story

The target developer experience for the rewrite. The ubiquitous language lives in
`CONTEXT.md`; the concrete build plan (folders, signatures, invariants) lives in
`implementation.md`. This file is the narrative that ties them together.

---

## The story

### Step 1 — Create the instance

Everything starts with one call. `createStdSync` accepts shared defaults that every
collection built from this instance inherits.

```ts
const std = createStdSync({
  options: { gcTime: 5000 },
  offlineStorage: idbStorage({ name: 'app-sync', version: 1 }),
});
```

Behind the instance is a single **tracker** that remembers every collection created from
it. Each entity type may be owned by exactly one collection in that instance. Entity
identity is `schema.name`; a second collection with the same `schema.name` is a
configuration error.

`createStdSync` returns exactly three things: `sync`, `singleItemSync`, and `registry`.

---

### Step 2 — Create collections

There is **one** keyed-collection method, `sync`. A collection declares an optional
**global** `strategy` (mirrors the whole set, runs the `__total__` partition at sync
start) and/or an optional **`partitions`** map (`field → (partitionValue) => Strategy`,
each activated on a matching `loadSubset`). Both coexist in one engine over one shared
Source of Truth; convergence dedupes any overlap.

Every server envelope accepted by a collection must carry `meta._e === schema.name`. The
engine rejects mismatched envelopes instead of routing or storing them.

#### Mirror an entire entity set (global strategy)

```ts
const tasks = createCollection(
  std.sync({
    schema: TaskSchema,
    strategy: syncStrategy.oldToNew({
      fetch: ({ cursor }) => client.queryTasks({ cursor }),
    }),
    onInsert: (item) => client.createTask(item),
    onUpdate: ({ id, updates }) => client.updateTask(id, updates),
    onDelete: (id) => client.deleteTask(id),
  }),
);
```

`onDelete` returns the server-confirmed tombstone envelope (`_d: true`). The collection
projection removes the visible row, but the Source of Truth retains the tombstone so older
envelopes cannot resurrect deleted data.

#### Mirror one slice at a time (partitions map)

A partition is activated the first time a matching `loadSubset` filter appears on the
collection. The partition value is captured by the factory closure — the strategy itself
stays partition-blind and only ever sees `{ cursor }`.

```ts
const tasks = createCollection(
  std.sync({
    schema: TaskSchema,
    partitions: {
      orgId: (orgId) =>
        syncStrategy.oldToNew({
          fetch: ({ cursor }) => client.queryTasksByOrg(orgId, { cursor }),
        }),
    },
    onUpdate: ({ id, updates }) => client.updateTask(id, updates),
  }),
);
```

A partition is a sync lifecycle boundary, not a collection-retention boundary. When a
partition unloads, its strategy runtime stops, but rows already projected into the TanStack
collection are not removed. The collection may be a superset of currently active
partitions. A collection may declare `strategy`, `partitions`, or both.

#### singleItemSync — exactly one record

No id field, no cursor, no paging.

```ts
const settings = createCollection(
  std.singleItemSync({
    schema: SettingsSchema,
    strategy: singleItemSyncStrategy.getOnce({
      get: () => client.getSettings(),
    }),
    onUpdate: ({ updates }) => client.saveSettings(updates),
  }),
);

// The config carries `singleResult: true` (typed `& SingleResult`), so `useLiveQuery`
// surfaces `data` as the single row — `Settings | undefined`, not `Settings[]`.
const { data: theSettings } = useLiveQuery(settings);
```

---

### Step 3 — Wire the registry

The same instance that created the collections routes inbound broadcasts to them.

```ts
const registry = std.registry();
socket.onMessage((msg) =>
  registry.process({ values: msg.values, persist: true }),
);
```

`process` requires an explicit `persist` flag, reads the `_e` type tag on each entity, and
routes into the matching collection. Unknown `_e` is silently ignored (the bus may carry
types this instance does not own). Collections from a different `createStdSync()` instance
are invisible to this registry.

`persist: true` writes server truth to the Source of Truth and projects it to the
collection. `persist: false` projects only to the mounted collection. Neither path advances
Sync State.

---

### Step 4 — Use in a component

```ts
const { data } = useLiveQuery(() => tasks);

// Manual write as server truth (SoT + projection)
tasks.utils.writeUpsert(updatedEntity);

// Optimistic update with server round-trip
tasks.utils.pacedUpdate(id, { status: 'done' });
```

`utils` is engine-owned and generic only — a **flat map of functions**, with **no `sync`
key**. The flat shape is required: TanStack's `CollectionImpl.utils` field is typed
`Record<string, Fn>`, so a nested-object util collapses the collection's row type to
`never`. Strategies are self-driving (a pull strategy loops until it drains); manual
paging is not part of the public utility surface. Heterogeneous per-partition strategies
cannot share a typed util surface, so the public utils are uniform across every
collection:

```ts
utils.schema();
utils.writeUpsert(entityOrEntities);
utils.pacedUpdate(key, changes);
utils.pendingCount(key);
utils.subscribePending(listener);
```

`utils.writeUpsert(entityOrEntities)` returns `Effect.Effect<void, WriteError>`.

---

## The storage story

Three storage layers exist per collection. They are distinct and must not be conflated.

```
Server entities
  │
  ▼
Source of Truth (per collection)
  - server-confirmed entities only, one entity namespace per collection
  - atomic batch writes; convergence and tombstones applied here
  - optionally backed by Offline Storage group `sot/{schema.name}`
  - live even when the TanStack collection is unmounted
  │
  ▼
Collection projection (ephemeral)
  - TanStack DB rows visible to the UI; rebuilt from SoT on mount
  - may contain rows from inactive partitions

Sync State (per collection + partition)
  - serializable strategy-owned data (e.g. a cursor)
  - stored by the engine with the owning strategy name
  - decoded through the strategy state schema before the strategy sees it
  - optionally backed by Offline Storage group `state/{schema.name}`
  - never advanced by registry, mutation results, or manual persisted writes
```

Offline Storage is the live backend for SoT and Sync State when configured, not a
hydration-only copy. Convergence reads from and writes to the configured storage groups
directly, so persisted writes made while a TanStack collection is unmounted remain the
state that later mounts and strategies observe.

**Data flow on strategy sync:**

1. Strategy reads its own decoded Sync State (`ctx.getState`).
2. Strategy fetches or subscribes.
3. Strategy calls `ctx.writeServerTruth(entities)`.
4. Engine atomically writes the batch to SoT and projects accepted state if mounted.
5. Strategy advances its own Sync State (`ctx.setState`) — SoT first, then state.

`writeServerTruth` returns `Effect<void, WriteError>`. Stale-but-valid entities are
successful no-ops. The strategy does not catch `WriteError`; it lets it surface. The engine
logs the failure and restarts `run` from the top on a 2-second spaced schedule.

If persisted Sync State belongs to a different strategy name or fails the current strategy's
state schema, the engine logs a warning, resets that partition to the strategy's empty state,
and continues from that empty state.

**On mount:** the engine projects current SoT into the TanStack collection before strategy
lifecycle start. **On page reload:** collection projection clears; SoT and Sync State
survive only when the configured Offline Storage adapter is durable.

---

## Partition lifecycle

`sync` uses TanStack DB's on-demand subset lifecycle for its `partitions` map.

```
loadSubset(options)
  -> parse options; find a partitions-map field eq partitionValue; derive partitionKey
  -> increment that partition's refcount
  -> 0 -> 1: start the partition's strategy runtime
  -> no match: covered by the global strategy if present, else console.error

unloadSubset(options)
  -> derive the same partitionKey; decrement refcount
  -> 1 -> 0: stop that partition's strategy runtime (keep its Sync State for resume)

collection cleanup
  -> stop the global runtime and every active partition runtime
  -> clear TanStack callbacks (projector = null)
  -> keep SoT and Sync State in the engine closure
```

The global `strategy` runs under the reserved `__total__` partition key, started
unconditionally at sync start. `singleItemSync` uses collection-level lifecycle only (start
on sync, stop on cleanup; no `loadSubset`).

---

## Mutation placement

`onInsert`, `onUpdate`, and `onDelete` are thin config options on the collection wired to
TanStack DB mutation hooks. Per handler: extract the payload from the transaction, call the
user-supplied Effect, write the returned server envelope through `writeServerTruth`.
`onDelete` returns a tombstone envelope, not `void`. Mutation results never touch Sync
State. `singleItemSync` supports `onUpdate` only.

---

## Key invariants

1. **One instance, one tracker, one registry.** Collections from different instances are
   invisible to each other's registries.
2. **Entity ownership is disjoint.** A `createStdSync()` instance may register `schema.name`
   only once.
3. **Entity identity is `schema.name`.** Every accepted envelope must have
   `meta._e === schema.name`.
4. **Global and per-partition strategies coexist in one collection, one engine, one SoT.**
5. **The engine owns SoT storage; strategies own Sync State meaning.**
6. **Strategy State is advanced only by strategy sync.** Registry writes, mutation results,
   and manual persisted writes never advance it.
7. **Server-truth writes are atomic.** A batch succeeds whole or fails through `WriteError`.
8. **Stale valid envelopes are successful no-ops.**
9. **Tombstones stay in SoT.** Projection removes the row; SoT keeps the winning `_d: true`.
10. **SoT can be written while unmounted.** Projection is deferred until callbacks exist.
11. **`persist` is always explicit** on public writes and registry messages.
12. **Two strategy families, no crossover** — partitioned vs. single-item.
13. **Users do not author Entity Meta for normal mutations.** Handlers return server
    envelopes.
14. **The public surface is three values, zero exported types** — `createStdSync`,
    `syncStrategy`, `singleItemSyncStrategy`, `paceStrategy`. The `@std-toolkit/tanstack-sync/paced` subpath additionally exports `coalesceStrategy`. All config/result types flow through inference.
15. **On `writeServerTruth` failure, the engine restarts `run`** on a 2-second spaced
    schedule; the strategy does not handle the error itself.
