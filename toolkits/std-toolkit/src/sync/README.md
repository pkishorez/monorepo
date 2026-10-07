# @kstackz/std-toolkit/sync

Effect-based synchronization of TanStack DB Collections from an authoritative backend, with a local copy that survives reloads and one tab reading for all.

## Big picture

A Std Sync is a named group of Collections on one Platform. Each Collection reads the backend through Sync Strategies: a global one that runs while the Collection is mounted, one per Partition that runs while a query filters on its key path, or both. Only global is eager, only partitions is on-demand, and both is progressive; there is no mode setting. Every path converges through one Sync Replica by entity id and `_u`, and the TanStack DB Collection shows it. Collection rows and Mutation Callbacks hold values (a `Date`); the store holds the encoded form (its ISO string).

A strategy yields Entities with its next Sync State, and a Session stores each yield in one write, so a reload resumes where it stopped. Each Session holds its own lock, so one tab reads each scope while others wait to take over; the reader rings a Doorbell and the other tabs re-read the shared store. The Platform decides where the store lives and whether locks and the Doorbell exist: `memory()` by default, `browser()` for IndexedDB, Web Locks, and BroadcastChannel, `expo({ database })` for an expo-sqlite database in a native app, where one process reads for all. The main entry touches no browser global, so it also runs in Node and React Native.

Vocabulary is in [CONTEXT.md](CONTEXT.md). Rules for cursors, the Settle Window, Partitions, tabs, and logout are in [docs/sync-guide.md](../../docs/sync-guide.md). Decisions are in [docs/adr/](docs/adr/).

## Install

See the [top README](../../README.md). This subpath needs the optional peers `@tanstack/react-db` and `react`.

## Exports

### `@kstackz/std-toolkit/sync`

| Export              | What it does                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `createStdSync`     | Creates a named Std Sync exposing `name`, `collection`, and `dispose`; `drain` bounds how long `dispose` waits for writes in flight. |
| `inOrder`           | Runs each key's writes to the Backend one after another, in the order they were made; different keys' writes run side by side.       |
| `strategy.oldToNew` | Strategy that reads from the oldest change forward, by pulling, by subscription, or both.                                            |
| `strategy.newToOld` | Strategy that reads the newest page first, fills in older pages, and keeps the top fresh.                                            |
| `strategy.make`     | Builds a custom strategy from a state schema, an initial state, and a `run` Stream.                                                  |
| `memory`            | The default Platform: ephemeral storage, no Leadership, no Doorbell.                                                                 |
| `syncStore`         | The StdTable definition the Sync Store persists through, for building a custom Platform.                                             |

### `@kstackz/std-toolkit/sync/paced`

| Export             | What it does                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `paceStrategy`     | Pacers that decide when rapid updates reach the server: `coalesce`, `debounce`, `throttle`, `queue`. |
| `coalesceStrategy` | Constructs one coalesce pacer directly.                                                              |
| `buildPacedUpdate` | Builds a paced update function from a pacer, an optimistic apply callback, and a commit.             |

### `@kstackz/std-toolkit/sync/platform/browser`

| Export          | What it does                                                                             |
| --------------- | ---------------------------------------------------------------------------------------- |
| `browser`       | Platform with an IndexedDB store, Web Locks Leadership, and a BroadcastChannel Doorbell. |
| `listStdSyncs`  | Lists every Std Sync stored in this browser.                                             |
| `deleteStdSync` | Deletes a Std Sync's stored data, stopping a live instance of it first.                  |

### `@kstackz/std-toolkit/sync/platform/expo`

| Export          | What it does                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `expo`          | Platform with a table per Std Sync in an open expo-sqlite database, no Leadership or Doorbell. |
| `listStdSyncs`  | Lists every Std Sync stored in that database.                                                  |
| `deleteStdSync` | Drops a Std Sync's table; dispose a live instance of it first, since nothing tells it to stop. |

## Usage

### Load only the board you are looking at

A partition keyed on `boardId` starts when a TanStack query filters on that field. The schema comes first so the strategies' callbacks are typed. Lifted from story 27.

```ts
import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { createStdSync, strategy } from '@kstackz/std-toolkit/sync';
import { browser } from '@kstackz/std-toolkit/sync/platform/browser';

const app = createStdSync({ name: 'board', platform: browser() });

const tasks = app.collection(Task, {
  sync: {
    partitions: {
      boardId: (boardId) =>
        strategy.oldToNew({
          fetch: ({ after }) => api.changesOn(boardId, after),
          pollEvery: '5 seconds',
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

- A partition key path, such as `boardId` or `board.id`, reads a string, number, or boolean in every value; the parameter type is inferred.
- `fetch` returns entities strictly after `after`, which is `null` on the first call. Without `pollEvery` the strategy catches up once and stops.
- Add `global: strategy.oldToNew({ ... })` next to `partitions` to also load everything in the background.
- The Mutation Callbacks return what the backend stored, so the replica converges without waiting for the next poll. A failure rolls the optimistic change back.

### Stay live over a subscription

A backend that can push replays everything after the cursor, then streams new changes. Lifted from the kai playground.

```ts
const threads = app.collection(ThreadSchema, {
  sync: {
    global: strategy.oldToNew({
      subscribe: ({ after }) => api.subscribeThreads({ '>': after }),
    }),
  },
});
```

- The cursor is saved as entities arrive; when the feed drops, it reopens from the saved cursor, so nothing is missed.
- Give `fetch` too and the strategy catches up by pulling, then goes live with `subscribe`.

### Keep a native app's local copies in expo-sqlite

One database file holds every Std Sync of the app, a table each, and signing a User out deletes their copy. Shaped after the Expo Platform's test.

```ts
import { openDatabaseAsync } from 'expo-sqlite';
import { createStdSync } from '@kstackz/std-toolkit/sync';
import {
  deleteStdSync,
  expo,
  listStdSyncs,
} from '@kstackz/std-toolkit/sync/platform/expo';

const database = await openDatabaseAsync('std-sync.db');

const app = createStdSync({ name: 'alice', platform: expo({ database }) });
const todos = app.collection(Todo, {
  sync: { global: strategy.oldToNew({ fetch }) },
});

// On Sign Out:
await app.dispose();
await deleteStdSync(database, 'alice');
await listStdSyncs(database); // no longer lists alice
```

- Each Std Sync gets a table named `std-sync:<name>`, created when the Std Sync first opens its store.
- A phone runs one process, so every Session reads on its own: no Leadership and no Doorbell.
- Dispose a Std Sync before deleting it. Without a Doorbell, a live instance is not told its table is gone.
- `dispose` first waits for writes still on their way to the Backend, up to `drain` (default 5 seconds), then stops everything; a write that has not landed by then is stopped with the rest. Pass `createStdSync({ name, platform, drain: '1 second' })` to change it.
