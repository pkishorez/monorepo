# Design: the Log is a tree, and the Runtime can stop and start from any entry

Status: agreed. The decision is [ADR 0007](adr/0007-the-log-is-a-tree-the-runtime-runs-in-memory.md). Terms are in [CONTEXT.md](../CONTEXT.md): Log, Head, Branch, Step.

## The model

The Log is a tree of entries, one per Message, each pointing to its parent, like git commits. The Head is the entry the next Message goes after. Starting from an earlier entry moves the Head there, and new Messages grow a new Branch beside the old one, which stays in the Log.

The Log is one value in memory, owned by the Runtime. It is the only source of truth for the Runtime, Replay, `useRuntime()` and any timeline:

1. **Running.** Each Message is ordered by the in-memory queue, and Update runs right away. Then one entry `{ parent: Head, ... }` is pushed onto the Log, and the Head moves to it.
2. **Showing the past.** Replay walks the Branch to the entry shown, from the same value, on any Branch.

## Stopping and starting

- **`stop()`** interrupts every Command and Lifetime at once. The tree, the Log and the Head stay as they are, and the Frame stands still. Nothing can Send.
- **`start(from?)`** Replays the path to `from` (the Head if not given), goes live from that tree with its Instance numbers kept, and moves the Head to `from`. Every Instance enters its current State, so Lifetimes start again. Commands that were running when the Runtime stopped are gone: their Messages never arrive. `init` runs inside the Replay, so its Commands do not run again either. `start(null)` starts from right after init.
- **Starting while running** stops first, then starts.
- **`start()` with no entry** is a resume: the same Branch carries on.
- **Time** on a new Branch carries on from `from`'s Time (0 right after init). A resume carries on from the Time it stopped at. Time spent stopped is not counted.
- **Mounts.** The first mount of the app starts the Runtime; the last unmount stops it. In between, `stop()` and `start()` are the app's to call. A Runtime stopped by hand stays stopped while mounts come and go, until the count drops to zero and rises again; then it starts from the Head.

Two rules follow, and the README states them:

- Work that must survive a stop belongs in a Lifetime, not a Command. A first fetch is a Lifetime.
- The outside world is not rewound. Starting from an old entry rebuilds the app, not the server, the socket or localStorage.

## Storage

The Log is a plain value, held in a plain store `{ get(): RuntimeState, subscribe(listener): () => void }`. React reads it with `useSyncExternalStore`.

```ts
interface RuntimeState {
  readonly entries: ReadonlyArray<Entry>; // append-only; an entry's id is its position
  readonly head: number | null; // null = right after init
  readonly running: boolean;
  readonly shown: number | null; // null = live
}

interface Entry {
  readonly parent: number | null;
  readonly message: Tagged;
  readonly at: number;
  readonly instance: number;
  readonly path: string;
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  readonly from: string;
  readonly to: string;
}
```

- Adding a Message is a push: `entries` is one append-only array the states share, never copied per Message.
- Every change makes a new `RuntimeState` object, so `useSyncExternalStore` sees it, and no reader sees a torn state.
- A Branch is the path from an entry back to init through `parent`, computed at most once per change.
- The children of each entry are indexed as entries are pushed, to draw the tree.

Persistence comes later, as saving and loading this value.

## `App.useRuntime()`

| Member                    | What it is                                                          |
| ------------------------- | ------------------------------------------------------------------- |
| `log`                     | The current Branch's entries, from the first to the Head, with ids  |
| `head`                    | The Head's entry id, or `null` right after init                     |
| `running`                 | Whether the Runtime is running                                      |
| `shown`                   | The entry shown, or `null` for live                                 |
| `show(entry \| null)`     | Show the app right after an entry, on any Branch, or go live        |
| `stop()`                  | Stop the Runtime                                                    |
| `start(entry?)`           | Start from an entry (`null`: right after init), or resume the Head  |
| `children(entry \| null)` | The entries that follow an entry (`null`: init), to draw the tree   |
| `frame`                   | The app's Frame: still while stopped, moving while live and running |

## What changes in the code

- **Log:** a new module owning `Entry`, `RuntimeState` and the store: push an entry (moving the Head), move the Head, set running and shown, the Branch to an entry, and an entry's children.
- **Tree:** a Replayed tree can go live: every current State is entered with the live Hooks, `init` does not run, and Instance numbers carry on from the Replayed tree.
- **Runtime:** writes entries to the Log, and implements `stop` and `start(from)`, using Replay to rebuild the tree. Time is `from`'s Time plus time since start.
- **Replay:** seeks to the last entry of a Branch instead of to a step number.
- **React:** `useRuntime` gains `head`, `running`, `stop`, `start` and `children`. Mount counting starts and stops.

## Considered Options

- **The store as the queue (write first, then Update from its subscription)**: rejected. Every Message would wait for a write (keystrokes would lag), the outcome would need a second write, and order would follow write completion.
- **The Log in a std-toolkit table, given to the Runtime in its own Layer, with decode checks at boot**: rejected for now. Persistence is not needed yet, and it brought a dependency, async writes, and a second copy of the truth to keep in step with memory. It comes later as saving and loading the one value.
- **A `SubscriptionRef` for the state**: rejected. React needs `{ get, subscribe }` for `useSyncExternalStore`, and the Runtime changes it synchronously.

## Left for later

- Persistence: saving and loading the `RuntimeState` value, across reloads.
- Several tabs sharing one Log.
- Re-running Commands that were running at the fork.
- Snapshots, so starting from a deep entry doesn't Replay from the start.
