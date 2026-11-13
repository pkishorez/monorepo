# How the History works

Terms are in [CONTEXT.md](../CONTEXT.md): Snapshot, History, History entry, Head, Branch, Window, Compact, Step, Seek, Replay, Fork, Follow, Time Travel, Runtime. The decision is [ADR 0048](adr/0048-the-runtime-is-a-snapshot-kept-alive.md), with [ADR 0007](adr/0007-the-log-is-a-tree-the-runtime-runs-in-memory.md) for the tree of entries and [ADR 0026](adr/0026-an-instance-runs-its-own-life.md) for how an Instance runs.

## The model

A History is what happened to an app: the Snapshot it starts from, and a tree of entries after it, one per Message, each pointing to its parent, like git commits. The Head is the entry the next Message goes after. Moving the Head to an earlier entry makes the next Message grow a new Branch beside the old one, which stays.

A History is plain data, and it knows no Runtime. It is an immutable value, and every function in `History` gives a new one and leaves the one it was given as it was: `init` starts one from a Snapshot, `add` writes one entry or a list after the Head and moves the Head to the last, `move` moves the Head, `entries` reads the entries from the start to any one, `all` every entry on every Branch, `children` the entries that follow one, and `tips` the last entry of every Branch. With `entry(h, id).parent` for the one before, these are how a tool walks the History. Growing is cheap: a History shares its entries with the one it grew from.

Each entry holds what Replay needs and who Sent it: the Address it is `to`, the `message`, who it is `from`, and its Time, `at`. In a History it also has its `id` and its `parent`. Given the Actor, the start and the Messages alone tell the Snapshot right after any entry: `History.snapshot(actor, history, id)` plays them, remembering Snapshots along the way so playing again starts from the nearest one. `History.replay` is the same as an Effect that yields to the page as it plays.

The entries are a plain list, so one Instance's story is a filter: `History.entries(history).filter((entry) => entry.to === address)`.

Saved, it is plain JSON: its start, its entries and its Head. In memory every value is decoded; `History.save(actor, history)` writes the start's Instances and each Message through their Actors' Schemas, and `History.load(actor, saved)` reads them back through them. So the encoded side of every Schema must be JSON-safe: a `Date` saves as `Schema.DateFromString`, an `Option` as `Schema.OptionFromNullOr`. A saved History is checked as it is loaded: one whose Head or parents are not its own entries, or whose start no longer fits the code, fails at once. A saved one never changes: the same History saves to the same object, and the next save is a new one. The app as it is now, with nothing of how it got there, saves with `Snapshot.save` and loads with `Snapshot.load`.

## Keeping one beside a Runtime

A Runtime is a Snapshot kept alive, and it keeps no History. It tells whoever subscribes the entries it played, and they are added to a History:

```ts
const runtime = Runtime.make(Auth, { layer, running: false });
let history = History.init(runtime.snapshot);
runtime.subscribe((entries) => {
  history = History.add(history, entries);
});
await runtime.start();
```

Work can Send as it starts, so the Runtime is made stopped, subscribed to, then started: no entry is missed. An app made with `View.app` keeps its History this way, and gives it as `useRuntime().history`.

1. **Make.** From a Snapshot, or from the root's Input: carry Time on from the Snapshot's Time (0 right after init), and run. The Workers and Provides the Snapshot's data asks for start, from the Model alone, and no Command runs.
2. **Each Message.** The Mailbox stamps it with the Time, `Snapshot.next` gives the next Snapshot, and the live tree Follows it: the Workers and Provides it asks for start and the rest stop, and the Commands the Update asked for run. What the Update Emits is Sent next. Once the Mailbox is empty, subscribers are told the entries played.
3. **Stop.** `stop()` ends every Worker, Provide and Command, and Time stands still. A Send to a stopped Runtime is refused and changes nothing; `running` says which it is.
4. **Start.** `start()` runs again from the Snapshot: the Workers and Provides its data asks for start, from the Model alone, and Time carries on from where it stood. No past Command runs again.
5. **Let go.** `dispose()` stops, closes the Mailbox and the Layer. Nothing Sent after arrives.

Two rules follow:

- Work that must survive a stop, a Fork or a reload belongs in a Worker, not a Command. A first fetch is a Worker.
- The outside world is not rewound. Going back to an old entry rebuilds the app, not the server, the socket or localStorage.

## Looking back

`History.snapshot(actor, history, id)` is the app right after an entry, on any Branch, `null` for the History's start. It is plain data: nothing runs in it, nothing can be Sent to it, and reading it changes nothing. Zoom in with `Snapshot.at(snapshot, address)`. It needs no Runtime, so a devtool does the same with a saved History.

## Branching off

Going on from an earlier entry is two steps: move the History's Head, and have the Runtime follow the Snapshot there.

```ts
history = History.move(history, id);
await runtime.follow(History.snapshot(Auth, history), { restart: true });
```

`runtime.follow(snapshot)` makes the running app match a Snapshot, and sets its Time to the Snapshot's. By default it changes only what differs: a Worker both Snapshots ask for, at the same Address, is not touched, and a Command still running goes on and Sends its Message when it ends. With `restart: true` all work stops and starts again from the Snapshot: every Worker whose Condition holds starts, from the Model alone, and every Command still running is let go. Stopped, only the Snapshot changes. Either way no Command runs, and the next Message grows a new Branch; the old ones stay in the History, reached by `History.tips`.

After another path is taken, the same Address can name another life of a Child. So a Fork restarts; a step back and forth along one Branch need not.

## Keeping it small

Whoever keeps the History says its Window: how many entries it keeps on the Head's Branch. `History.compact(actor, history, window)` folds everything before the Window into the start: the start moves forward to the Snapshot right before the oldest entry kept, the entries kept keep their ids, and every entry that does not grow from there is swept. `0` keeps only the app as it is now, and `null` keeps every entry. Compacting twice is compacting once. Time Travel then reaches the start and the entries after it. An app made with `View.app` keeps 100 unless said, and `useRuntime().keep(n)` changes it.

## Showing the past

Showing a Step is the App's business, not the Runtime's. `<Kabuki of={snapshot} />` draws a Snapshot and drops any Send from it; `<Kabuki of={runtime} />` draws the Runtime as it is now, and drops a Send while it is stopped. An app made with `View.app` does the same through `useRuntime()`: `seek(id)` draws that Step while the Runtime stays where it is, `null` for the History's start, `toHead()` draws the Runtime again, `fork(id)` moves the History's Head there and has the Runtime follow, and `startOver()` gives the app a new History from init and has the Runtime follow that. Its `runtime` is the same object throughout.

## What came of an entry

An entry holds only what Replay needs and who Sent it. Whether it was handled, ignored or dropped is what `Snapshot.next` says as it plays the entry, and is worked out again by playing it on the Snapshot before it: `Snapshot.next(actor, History.snapshot(actor, history, entry.parent), entry).outcome`.

Which Workers it started or stopped is worked out the same way, since the data decides what runs: `Snapshot.workers(actor, snapshot, address)` gives the Workers the data asks for at an Instance, each by its name and, for one of `each`, its key, by the same rule a running Runtime starts and stops them by. Those asked for after the entry and not before it started; those asked for before and not after stopped.
