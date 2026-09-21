# std-toolkit/sync

Effect-based synchronization of TanStack DB Collections from an authoritative backend, with a persisted local replica, paced writes, an offline Outbox, and same-origin Peer Sync.

## Big picture

Each tab owns a Sync Replica and a TanStack DB Collection projection. The backend is authoritative; backend push or polling makes each replica eventually correct, and the projection makes it visible to TanStack queries. Keyed Collections run total sync, on-demand partition sync, or both; every path converges through the one replica by entity id and `_u`. The replica is persisted through a StdTable (`syncStore`), so Memory, IndexedDB, and SQLite adapters are all valid stores.

Peer Sync is a same-origin freshness shortcut: after a tab accepts a backend-confirmed Entity it sends the complete Entity to the same Collection in other live tabs. A missed message is harmless because backend sync repairs it. Leadership lets one tab do the backend reads. The Outbox makes writes survive reloads and offline periods.

Vocabulary is in [CONTEXT.md](CONTEXT.md). Rules for cursors, cadence repair, the Effect runtime, flow tracing, store durability, Peer Sync, the Outbox, and Registry Broadcasts are in [docs/sync-guide.md](../../docs/sync-guide.md). Decisions are in [docs/adr/](docs/adr/); the Outbox plan is [docs/offline-plan.md](docs/offline-plan.md).

## Install

See the [top README](../../README.md). This subpath needs the optional peers `@tanstack/react-db` and `react`.

## Exports

### `std-toolkit/sync`

| Export                       | What it does                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createStdSync`              | Creates a named sync instance exposing `collection`, `sync`, `singleItemCollection`, `singleItemSync`, `createOfflineAction`, `registry`, `outbox`, `reset`, and `dispose`. |
| `syncStrategy.oldToNew`      | Partitioned strategy that reads from the oldest change forward.                                                                                                             |
| `syncStrategy.newToOld`      | Partitioned strategy that reads from the newest change backward.                                                                                                            |
| `syncStrategy.bidirectional` | Newest-first strategy that backfills older and newer pages from both ends while a live tail stays open.                                                                     |
| `paceStrategy.coalesce`      | Pacer that folds rapid `pacedUpdate` calls on one key into a single in-flight write.                                                                                        |
| `paceStrategy.debounce`      | Pacer that re-exposes TanStack DB's debounce strategy.                                                                                                                      |
| `paceStrategy.throttle`      | Pacer that re-exposes TanStack DB's throttle strategy.                                                                                                                      |
| `paceStrategy.queue`         | Pacer that re-exposes TanStack DB's queue strategy.                                                                                                                         |
| `syncStore`                  | The StdTable definition the Sync Store persists through; realize it with any adapter's `make`.                                                                              |
| `OutboxUnreachable`          | Tagged error a mutation callback fails with to keep an Outbox entry `pending` until connectivity returns.                                                                   |

### `std-toolkit/sync/paced`

| Export             | What it does                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `paceStrategy`     | The same pacer kit as above, for callers that only need pacing.                             |
| `coalesceStrategy` | Constructs one coalesce strategy instance directly.                                         |
| `buildPacedUpdate` | Builds a paced update function from a strategy, an optimistic apply callback, and a commit. |

### `std-toolkit/sync/leadership/in-memory`

| Export               | What it does                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `inMemoryLeadership` | Leadership Layer that elects a leader among instances in one process; for tests and servers. |

### `std-toolkit/sync/platform/browser`

| Export             | What it does                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `browser`          | Platform preset: IndexedDB Sync Store, Web Locks Leadership, and BroadcastChannel Peer Sync.               |
| `broadcastChannel` | Peer Channel factory over `BroadcastChannel`, or `null` where the global is missing; for custom platforms. |

## Usage

### Load only the board you are looking at

A partition factory keyed on `boardId` starts when a TanStack query filters on that field. Lifted from story 25.

```ts
import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Schedule } from 'effect';
import { createStdSync, syncStrategy } from 'std-toolkit/sync';
import { browser } from 'std-toolkit/sync/platform/browser';

const app = createStdSync({ name: 'board', platform: browser() });

const tasks = app.collection({
  schema: Task,
  sync: {
    partitions: {
      boardId: (boardId) => ({
        strategy: syncStrategy.oldToNew({
          source: ({ poll }) =>
            poll({
              fetch: ({ cursor }) => changesOn(boardId, cursor),
              schedule: Schedule.spaced('20 millis'),
            }),
        }),
      }),
    },
  },
  onInsert: (items) => Effect.forEach(items, (item) => api.insertTask(item)),
  onUpdate: ({ current, updates }) => api.updateTask(current, updates),
  onDelete: ({ current }) => api.deleteTask(current),
});

const screen = createLiveQueryCollection({
  query: (q) =>
    q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
  startSync: true,
});
```

- Only string, number, and boolean schema fields may be partition keys; the parameter type is inferred.
- `fetch` returns entities strictly after `cursor`; `cursor` is `null` on the first call.
- Add `total: { strategy }` next to `partitions` to also load everything in the background; both write through one replica.
- `onInsert`, `onUpdate`, and `onDelete` return what the backend stored so the replica converges without waiting for the next poll.

### Keep one settings record in step

A record with no id field uses single-item sync. Lifted from story 30.

```ts
import { Schedule } from 'effect';

const settings = app.singleItemCollection({
  schema: SettingsSchema,
  source: ({ poll }) =>
    poll({
      fetch: () => api.getSettings(),
      schedule: Schedule.spaced('5 seconds'),
    }),
  onUpdate: ({ updates }) => api.saveSettings(updates),
});
```

- `once` fetches a single time, `poll` fetches on a schedule, `subscribe` opens a Stream of complete replacement values.
- The schema is an `ESchema`, not an `EntityESchema`; the Collection holds exactly one row.
