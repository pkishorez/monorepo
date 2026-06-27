# std-toolkit/tanstack-sync

TanStack DB sync helpers for Effect-based server APIs. Keyed collections use
`sync`; singleton collections use `singleItemSync`; optional Offline Storage can
persist engine-owned Source of Truth and Sync State.

## Setup

<!-- prettier-ignore -->
```typescript
import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import { createStdSync, syncStrategy, singleItemSyncStrategy, paceStrategy } from 'std-toolkit/tanstack-sync';
import { idbStorage } from 'std-toolkit/tanstack-sync/offline-storage/idb';

const std = createStdSync({ offlineStorage: idbStorage({ name: 'app-sync', version: 1 }) });
```

`idbStorage` is the public IndexedDB adapter. The only public storage subpath is
`std-toolkit/tanstack-sync/offline-storage/idb`; storage groups and memory storage are
engine internals.

## Keyed Sync

Mirror a whole entity set with a global strategy:

```typescript
const tasksCollection = createCollection(
  std.sync({
    schema: TaskSchema,
    strategy: syncStrategy.oldToNew({
      fetch: ({ cursor }) => api.getTasks({ cursor }),
    }),
    updatePacing: paceStrategy.coalesce({ wait: 50 }),
    onInsert: (task) => api.createTask(task),
    onUpdate: ({ id, updates }) => api.updateTask(id, updates),
    onDelete: (id) => api.deleteTask(id),
  }),
);
```

Load keyed partitions on demand by declaring a `partitions` map. Each partition factory
captures its value and returns a strategy.

```typescript
const messagesCollection = createCollection(
  std.sync({
    schema: MessageSchema,
    partitions: {
      channelId: (channelId) =>
        syncStrategy.oldToNew({
          fetch: ({ cursor }) => api.getMessages(channelId, { cursor }),
        }),
    },
    onInsert: (message) => api.createMessage(message),
    onUpdate: ({ id, updates }) => api.updateMessage(id, updates),
    onDelete: (id) => api.deleteMessage(id),
  }),
);
```

## Single Item Sync

Use `singleItemSync` for exactly one record, such as app settings or a profile.

```typescript
const settingsCollection = createCollection(
  std.singleItemSync({
    schema: SettingsSchema,
    strategy: singleItemSyncStrategy.getOnce({
      get: () => api.getSettings(),
    }),
    onUpdate: ({ updates }) => api.saveSettings(updates),
  }),
);
```

## Offline Storage

Root storage is inherited by collections when they omit `offlineStorage`.

```typescript
const std = createStdSync({
  offlineStorage: idbStorage({ name: 'app-sync', version: 1 }),
});

const inheritedStorageCollection = createCollection(
  std.sync({
    schema: TaskSchema,
    strategy: syncStrategy.oldToNew({
      fetch: ({ cursor }) => api.getTasks({ cursor }),
    }),
  }),
);
```

A collection can opt out of the root adapter and use collection-local memory by setting
`offlineStorage: false`.

```typescript
const memoryOnlyCollection = createCollection(
  std.sync({
    schema: DraftSchema,
    offlineStorage: false,
    strategy: syncStrategy.oldToNew({
      fetch: ({ cursor }) => api.getDrafts({ cursor }),
    }),
  }),
);
```

Offline Storage backs the engine-owned Source of Truth and Sync State. It is the live
backend for convergence, tombstone retention, and strategy state; it is not a
hydration-only layer. Storage write failures surface through `WriteError.Storage` and are
not silently replaced with memory storage.

Strategy state is stored with the owning strategy name and validated against that
strategy's state schema on read. If a stored slot belongs to a different strategy or fails
schema validation, the engine logs a warning and resets that slot to the strategy's empty
state.

## Utils

Collection utilities are flat engine-owned functions:

```typescript
tasksCollection.utils.schema();
tasksCollection.utils.writeUpsert(entityOrEntities);
tasksCollection.utils.pacedUpdate(taskId, { status: 'done' });
tasksCollection.utils.pendingCount(taskId);
tasksCollection.utils.subscribePending(listener);
```

`utils.writeUpsert(entityOrEntities)` returns `Effect.Effect<void, WriteError>`, so run or
compose it like any other Effect:

```typescript
await Effect.runPromise(tasksCollection.utils.writeUpsert(entityOrEntities));
```

`writeUpsert` writes server-confirmed entities through Source of Truth convergence and
projects accepted changes when the TanStack collection is mounted. `pacedUpdate` is for
optimistic updates that call the configured `onUpdate` handler.

## Registry

The registry routes broadcast envelopes to collections created by the same `createStdSync`
instance.

```typescript
const registry = std.registry();

socket.onmessage = (event) => {
  registry.process({ values: JSON.parse(event.data), persist: true });
};
```

`persist: true` writes server truth through Source of Truth. `persist: false` only
projects to currently mounted collections.
