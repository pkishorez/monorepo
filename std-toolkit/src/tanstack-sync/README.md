# std-toolkit/tanstack-sync

Effect-based synchronization for TanStack DB. Keyed collections may run total
sync, on-demand partition sync, or both. Every path converges through one local
Source of Truth (SoT), with optional IndexedDB persistence.

## Setup

```typescript
import { createCollection } from '@tanstack/react-db';
import {
  createStdSync,
  paceStrategy,
  singleItemSyncStrategy,
  syncStrategy,
} from 'std-toolkit/tanstack-sync';
import { idbStorage } from 'std-toolkit/tanstack-sync/offline-storage/idb';

const std = createStdSync({
  offlineStorage: idbStorage({ name: 'app-sync', version: 1 }),
});
```

Use `std.collection(config)` when you want std-sync to create the TanStack
collection. `createCollection(std.sync(config))` is also supported.

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

## Offline storage

Root storage is inherited by every collection. Set `offlineStorage: false` on a
collection to use isolated in-memory storage. Offline storage backs both SoT and
strategy progress; it is not merely a hydration cache. Write failures surface as
`WriteError.Storage`.

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
