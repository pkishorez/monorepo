# std-toolkit/tanstack-sync

Effect-based synchronization for TanStack DB. Keyed collections may run total
sync, on-demand partition sync, or both. Every path converges through one local
Source of Truth (SoT), persisted through a shared StdTable.

## Setup

```typescript
import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import { IDB } from 'std-toolkit/db/idb';
import {
  createStdSync,
  paceStrategy,
  singleItemSyncStrategy,
  syncPersistenceTable,
  syncStrategy,
} from 'std-toolkit/tanstack-sync';

const database = IDB.database({ databaseName: 'app' });
const persistence = IDB.make(syncPersistenceTable, { database });
await Effect.runPromise(persistence.setup);

const std = createStdSync({ persistenceLayer: persistence.layer });
```

Use `std.collection(config)` when you want std-sync to create the TanStack
collection. `createCollection(std.sync(config))` is also supported. Call
`await std.dispose()` when the sync instance is no longer needed.

## Total sync

Total sync eventually loads the complete entity set.

```typescript
const tasks = std.collection({
  schema: TaskSchema,
  sync: {
    total: {
      strategy: syncStrategy.oldToNew({
        fetch: ({ cursor }) => api.getTasks({ cursor }),
      }),
    },
  },
  updatePacing: paceStrategy.coalesce({ wait: 50 }),
  onInsert: (task) => api.createTask(task),
  onUpdate: ({ id, updates }) => api.updateTask(id, updates),
  onDelete: (id) => api.deleteTask(id),
});
```

## Partition sync

A partition factory is activated by a matching TanStack query. Its parameter is
inferred from the schema field, and only string, number, and boolean fields may
be partition keys.

```typescript
const comments = std.collection({
  schema: CommentSchema,
  sync: {
    partitions: {
      postId: (postId) => ({
        strategy: syncStrategy.oldToNew({
          fetch: ({ cursor }) => api.getComments({ postId, cursor }),
        }),
      }),
    },
  },
});
```

## Hybrid sync

Total and partition workers can run together. For example, all comments can load
in the background while the selected post's comments are fetched immediately.
They keep separate progress but write through the same SoT, so overlap is
deduplicated by entity id and `_u` convergence.

```typescript
const comments = std.collection({
  schema: CommentSchema,
  sync: {
    total: {
      strategy: syncStrategy.oldToNew({
        fetch: ({ cursor }) => api.getAllComments({ cursor }),
      }),
    },
    partitions: {
      postId: (postId) => ({
        strategy: syncStrategy.oldToNew({
          fetch: ({ cursor }) => api.getComments({ postId, cursor }),
        }),
      }),
    },
  },
});
```

## Cadence repair

Repair is independent from the strategy and owns its own source. Declaring
`repair` without `cadence` inherits the instance default; omitting `repair`
disables it even when a default exists.

```typescript
postId: (postId) => {
  const fetchForward = ({ cursor }) => api.getComments({ postId, cursor });

  return {
    strategy: syncStrategy.oldToNew({ fetch: fetchForward }),
    repair: {
      fetchFrom: fetchForward,
      cadence: { window: 5_000, readiness: 10_000, pollDelay: 2_000 },
    },
  };
};
```

## Effect runtime

All user callbacks and internal fallible or asynchronous operations are Effects.
Pass a `ManagedRuntime` when those Effects require services. std-sync uses its
`runSync` and `runPromise` methods at TanStack's imperative boundaries. Without a
runtime it falls back to `Effect.runSync` and `Effect.runPromise`.

```typescript
import { Effect, ManagedRuntime } from 'effect';

const runtime = ManagedRuntime.make(AppLayer);
const std = createStdSync({ runtime });

const tasks = std.collection({
  schema: TaskSchema,
  sync: {
    total: {
      strategy: syncStrategy.oldToNew({
        fetch: ({ cursor }) =>
          Effect.gen(function* () {
            const api = yield* TaskApi;
            return yield* api.getTasks({ cursor });
          }),
      }),
    },
  },
});
```

The runtime environment is inferred across strategies, fetches, and mutation
callbacks, including `onEvent`. A required service that is absent from the
supplied runtime is a type error.

`onEvent` receives structured Effects for lifecycle failures, initialization
failures, unserved queries, and registry write failures. When omitted, events use
Effect's logger.

## Flow tracing

Every Collection instance owns one Effect Tracer Flow with an id shaped as
`std-collection::<schema-name>::<ulid>`. The same Flow remains active across
Collection starts, cleanup, and later restarts; std-sync never ends it. Effect
telemetry configuration decides whether that Flow is exported.

The Flow has a `collection` lane, one global worker lane, one stable lane for each
logical Partition, a lane for each Cadence Repair worker, and one worker lane for
Single Item Sync. Repeated subscribers to the same Partition share its lane and
produce subscriber-count messages. Strategies run inside a Flow activity so API
and persistence spans are linked as nested trace work. Every non-empty strategy
or Cadence Repair delivery logs how many entities were received and how many the
SoT accepted after convergence.

Custom strategies can add high-level activities and events through `ctx.flow`:

```typescript
run: (ctx) =>
  api.fetchPage().pipe(
    ctx.flow.withSpan('Fetch page'),
    Effect.tap((page) =>
      ctx.flow.log('Page fetched', {
        attributes: { entityCount: page.length },
      }),
    ),
  );
```

## Single-item sync

Use `singleItemSync` or `singleItemCollection` for a record with no id field.

```typescript
const settings = std.singleItemCollection({
  schema: SettingsSchema,
  strategy: singleItemSyncStrategy.getOnce({
    get: () => api.getSettings(),
  }),
  onUpdate: ({ updates }) => api.saveSettings(updates),
});
```

## Persistence

Each sync instance uses an isolated Memory adapter by default. Supplying a
`persistenceLayer` replaces it globally for that instance; any adapter layer
created for `syncPersistenceTable` is accepted, including IndexedDB and SQLite.
The table stores both SoT and strategy progress. Write failures surface as
`WriteError.Storage` while adapter-specific errors remain internal.

Tombstones remain in SoT. Persisted strategy state is tagged with its strategy
name and decoded with that strategy's schema. A name mismatch or invalid state is
reset to the strategy's empty state.

## Utilities and registry

Keyed collections expose typed engine utilities:

```typescript
tasks.utils.schema();
tasks.utils.writeUpsert(entityOrEntities);
tasks.utils.pacedUpdate(taskId, { status: 'done' });
tasks.utils.pendingCount(taskId);
tasks.utils.subscribePending(listener);
```

`writeUpsert` returns an Effect and uses the same convergence path as worker and
mutation results. The registry routes broadcasts among collections owned by one
std-sync instance:

```typescript
const registry = std.registry();
registry.process({ values: serverEntities, persist: true });
```

`persist: true` writes SoT and projects accepted changes. `persist: false` only
projects to a mounted collection. Neither mode advances strategy progress.
Registry delivery is fire-and-forget: `process` returns immediately, failures
are reported through `onEvent`, and `dispose` does not wait for delivery.

Collection cleanup stops collection-owned sync work but does not close
persistence. `std.dispose()` closes the persistence runtime owned by that
std-sync instance; outstanding registry deliveries are not part of that
shutdown boundary.
