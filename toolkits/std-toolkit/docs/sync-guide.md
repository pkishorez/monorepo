# Sync guide

Detailed behaviour of `@kstackz/std-toolkit/sync`. The README covers setup and the
common shapes; this page covers the rules you need once a Collection is live.
Vocabulary is in [src/sync/CONTEXT.md](../src/sync/CONTEXT.md). Decisions are
in [src/sync/docs/adr/](../src/sync/docs/adr/).

## Instance options

`createStdSync({ name, platform, runtime, onEvent, options })`.

- `name` is normalized and names the stored data. Every tab reading the same
  backend dataset uses the same name. A renamed Std Sync starts from empty
  storage; the old data stays until you delete it.
- `platform` is where the store lives and whether tabs share it. Absent, it is
  `memory()`.
- `runtime` is a `ManagedRuntime` (or any object with `runSync`, `runPromise`,
  and `contextEffect`). Sync runs your fetches, subscriptions, and Mutation
  Callbacks through it, and a service missing from it is a type error.
- `onEvent` receives Sync Events. Without it they are logged.
- `options` are TanStack DB options every Collection starts from.

`app.collection(schema, config)` creates the TanStack Collection. The schema
comes first so TypeScript knows the row type before it reads the strategies.
`await app.dispose()` stops everything and keeps the stored data.

## Global, partitions, and the three modes

`sync: { global, partitions }`. Global runs while the Collection is mounted.
A partition factory runs while a TanStack query has an `eq` filter on its key
path (such as `task.board.id`); its parameter is inferred from the value at
that path. A key path must read a string, number, or boolean in every value.

| Configured | Mode        | Behaviour                                        |
| ---------- | ----------- | ------------------------------------------------ |
| global     | Eager       | Everything loads once the Collection mounts.     |
| partitions | On-demand   | Only what a query looks at loads.                |
| both       | Progressive | What a query looks at loads first, the rest too. |

When the last query on a Partition leaves, its strategy stops; its rows stay
in the Sync Replica, so a board you opened before still works offline.

## The cursor rule

`after` and `before` are exclusive. Return entities strictly beyond them,
never the cursor entity itself, and filter with `<` / `>`, not `<=` / `>=`.
An inclusive backend would re-serve the boundary entity forever; Sync stops
paging when the cursor stops moving, but the last page is then fetched twice.
The cursor is `null` on the first call.

## Built-in strategies

`strategy.oldToNew({ fetch, subscribe, pollEvery })` reads from the oldest
change forward:

- `fetch` only: catch up page by page, then poll every `pollEvery`. Without
  `pollEvery` it catches up once and stops until the scope mounts again.
- `subscribe` only: the backend replays everything after the cursor, then
  stays live.
- both: `fetch` catches up, then `subscribe` goes live.

A feed that ends or fails reopens from the saved cursor, so a reconnect
replays what was missed.

`strategy.newToOld({ fetch, fetchOlder, subscribe, pollEvery })` shows the
newest page first, then pages older ones in the background with
`fetchOlder({ before })` until it reaches the oldest, while `fetch` or
`subscribe` keeps the top fresh. After a reload it reads forward from the last
saved top, so nothing between then and now is skipped.

## The Settle Window

Some backends make a write readable a little after its `_u`: replica lag,
parallel writers, or clock skew. A forward cursor that has already moved past
that `_u` skips it forever. Set `settleWindow: '5 seconds'` on the Collection
and the built-in strategies never save their cursor past the newest `_u` read
minus five seconds, so every poll re-reads the last five seconds. Duplicates
are ignored, so the cost is a small overlap per poll. The window is measured
from `_u`, not the device clock. It is off by default: a backend that pushes
in order through `subscribe` does not need it.

## Custom strategies

```ts
strategy.make({
  name: 'my-strategy',
  state: (entity) => Schema.Struct({ cursor: Schema.NullOr(entity) }),
  initial: { cursor: null },
  run: ({ state, settledCursor }) => /* Stream<{ entities, state }> */,
});
```

`state` receives the Collection's Entity codec, so an Entity held in state is
stored in encoded form and migrated when read. `run` resumes from `state` and
yields Entities with the next state; each yield is stored in one write. When
the Stream fails, Sync reports `SessionFailed`, waits a growing delay (1 s up
to 30 s, starting over once a run stores something), and runs it again from
saved state. When it ends, the strategy is done. `settledCursor(batch)` is the
furthest Entity of a forward batch that is safe to save under the Settle
Window. State saved by a strategy with a different `name`, or that no longer
decodes, starts over from `initial`.

## Tabs

Each Session (the global strategy, or one Partition's) holds its own lock,
named after its Collection and scope. One tab runs it; the others wait and
take over from saved state when it goes away. Different tabs may lead
different Partitions. The leader stores what it reads in the shared store and
rings the Doorbell; every tab listens and re-reads what changed. Confirmed
writes ring it too. With `memory()` nothing is shared, so every tab reads on
its own.

## Platforms

A Platform is three pieces: `store(syncName)` returns the Sync Store layer,
`leadership.run(key, effect)` runs an effect while holding a lock, and
`doorbell` rings and listens on topics.

- `memory()`: a fresh in-memory store, no locks, no Doorbell.
- `browser({ databaseName, leadership, doorbell })`: an IndexedDB database
  named `std-sync:<name>` (override with `databaseName`), Web Locks, and
  BroadcastChannel. Each piece is on by default and falls back to none where
  the browser lacks it; pass `leadership: false` to let every tab read.
- `expo({ database, tableName })`: a table named `std-sync:<name>` (override
  with `tableName`) in an expo-sqlite database the app opened, no locks, no
  Doorbell: a native app is one process. `listStdSyncs(database)` and
  `deleteStdSync(database, name)` find and drop those tables; dispose a live
  Std Sync before deleting it, since nothing rings it closed.

The type is public, so a custom Platform (a test harness, Node)
is a plain object; build its store with any adapter over `syncStore`.

## Offline and reloads

- The Collection opens from its local copy before any network call, and each
  strategy resumes from its saved state.
- A failing fetch retries with a growing delay; the local data stays visible.
- A Mutation Callback calls the backend directly. When it fails, TanStack DB
  rolls the optimistic change back. Writes that survive going offline (the
  Outbox) are not in this version.
- Stored Entities migrate on read. An Entity from a newer version than this
  code knows is ignored and reported once per Collection as
  `OutdatedApplication`; its Session stops until reload.

## Stored data and logout

Nothing is deleted automatically. In the browser, `listStdSyncs()` lists every
Std Sync stored under the default name, and `deleteStdSync(name)` deletes one.
A live Std Sync of that name, in this tab or another, reports `PlatformClosed`
and stops first.

| Use case                                   | What to do                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Public data                                | One long-lived Std Sync.                                                       |
| Per-user data                              | Put the user id in the name; on logout `dispose()` then `deleteStdSync(name)`. |
| Switching accounts, each available offline | One Std Sync per user; `dispose()` on switch, delete on sign-out.              |
| Shared or sensitive device                 | `memory()`, so nothing touches disk.                                           |

The user id belongs in the name even when logout deletes the data: if logout
never runs, the next user still cannot see the previous user's rows.

## Sync Events

- `SessionFailed`: a strategy run failed and will run again.
- `OutdatedApplication`: an Entity came from newer code; reload to read it.
- `PlatformClosed`: this Std Sync's stored data was deleted; it stopped.
