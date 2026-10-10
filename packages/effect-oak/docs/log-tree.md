# Design: the Log is a tree, and the Runtime can stop and start from any entry

Status: agreed, not built. The decision is [ADR 0007](adr/0007-the-log-is-a-tree-the-runtime-runs-in-memory.md). Terms are in [CONTEXT.md](../CONTEXT.md): Log, Head, Branch, Step.

## The model

The Runtime runs in memory; the store remembers.

The Log is a tree of entries, one per Message, each pointing to its parent, like git commits. The Head is the entry the next Message goes after. Starting from an earlier entry moves the Head there, and new Messages grow a new Branch beside the old one, which stays in the Log.

There are three moments:

1. **Boot.** Read the Head from the store, walk `parent` links from the Head back to the first entry, and Replay those Messages to rebuild the tree. Then go live: every Instance enters its current State, so Lifetimes start. With the in-memory store (the default) the store is empty, so boot is just `init`.
2. **Running.** Each Message is ordered by the in-memory queue, and Update runs right away. Then one entry `{ parent: Head, ... }` is written to the store, and the Head moves to it. Writes go out in order, in the background; the app never waits for them.
3. **Showing the past.** Replay walks the current Branch's entries, which the Runtime holds in memory: it read them at boot and adds every new one. Showing an entry on another Branch reads that Branch's path from the store first.

## Stopping and starting

- **`stop()`** interrupts every Command and Lifetime at once. The tree, the Log and the Head stay as they are, and the Frame stands still. Nothing can Send.
- **`start(from?)`** Replays the path to `from` (the Head if not given), goes live from that tree, and moves the Head to `from`. Lifetimes start again. Commands that were running when the Runtime stopped are gone: their Messages never arrive. `init` runs inside the Replay, so its Commands do not run again either.
- **Starting while running** stops first, then starts.
- **`start()` with no entry** is a resume: the same Branch carries on.
- **Time** on a new Branch carries on from `from`'s Time (0 right after init). Time spent stopped is not counted. Update sees the same `at` it would have seen had the app never stopped.
- **Mounts.** The first mount of the app boots and starts the Runtime; the last unmount stops it. In between, `stop()` and `start()` are the app's to call. A Runtime stopped by hand stays stopped while mounts come and go, until the count drops to zero and rises again.

Two rules follow, and the README states them:

- Work that must survive a stop belongs in a Lifetime, not a Command. A first fetch is a Lifetime.
- The outside world is not rewound. Starting from an old entry rebuilds the app, not the server, the socket or localStorage.

## Storage

The Log lives in a std-toolkit `StdTable` that effect-oak defines and exports as `Log.table`. It is given to the Runtime in its own Layer, separate from the app's Layer of Services:

```ts
toReact(Shop, ShopView, appLayer); // in memory
toReact(Shop, ShopView, appLayer, {
  log: IDB.make(Log.table, { database: IDB.database({ databaseName: 'shop' }) })
    .layer,
}); // kept across reloads
```

Without `log`, the Runtime uses `Memory.make(Log.table).layer`.

Two entities:

| Entity  | Key                                                   | Fields                                                                                                                                                |
| ------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Entry` | `pk`: app (the root Node's name); `id`: sortable ULID | `parent`: entry id, or `null` right after init; `message`; `at`; `instance`; `path`; `outcome` (handled, ignored, dropped); `from`; `to` (State tags) |
| `Head`  | `pk`: app; one item                                   | `entry`: entry id, or `null` right after init                                                                                                         |

`Entry` has an index on `parent`, so the children of any entry can be listed to draw the tree.

Messages are stored through their Node's Message Schema. If any entry on the Head's Branch does not decode with the current code, boot starts a fresh tree from `init`, leaves the old one in the store, and warns.

## `App.useRuntime()`

| Member                    | What it is                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| `log`                     | The current Branch's entries, from the first to the Head             |
| `head`                    | The Head's entry id, or `null` right after init                      |
| `running`                 | Whether the Runtime is running                                       |
| `shown`                   | The entry shown, or `null` for live                                  |
| `show(entry \| null)`     | Show the app right after an entry, on any Branch, or go live         |
| `stop()`                  | Stop the Runtime                                                     |
| `start(entry?)`           | Start from an entry, or resume from the Head                         |
| `children(entry \| null)` | An Effect listing the entries that follow an entry, to draw the tree |
| `frame`                   | The app's Frame                                                      |

## What changes in the code

- **Tree:** planting a tree can start from a Replayed tree, keeping its Instance numbers, and enter every current State instead of running `init`.
- **Runtime:** `start` takes the path to `from` and the Time to carry on from, and Time is that Time plus time since start. Recording an entry appends to the in-memory Branch and writes to the store in order.
- **Replay:** seeks to an entry on a path of entries instead of to a step number.
- **React:** `toReact` takes the optional `log` Layer. `useRuntime` gains `head`, `running`, `stop`, `start` and `children`. Mount counting calls boot and stop.
- **Dependencies:** `@kstackz/std-toolkit` (for `/db`, `/db/memory` and `/eschema`).

## Left for later

- Waiting for each write, for apps that must never lose a Message.
- Several tabs sharing one stored Log.
- Re-running Commands that were running at the fork.
- Migrating stored Messages with std-toolkit's `evolve` instead of starting fresh.
- Snapshots, so starting from a deep entry doesn't Replay from the start.
