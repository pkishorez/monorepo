# How the History works

Terms are in [CONTEXT.md](../CONTEXT.md): History, History entry, Head, Branch, Step, Seek, Replay, Fork, Time Travel, Runtime. The decisions are [ADR 0007](adr/0007-the-log-is-a-tree-the-runtime-runs-in-memory.md), [ADR 0025](adr/0025-the-runtime-starts-from-a-history.md) and [ADR 0026](adr/0026-an-instance-runs-its-own-life.md), each with a note on what the redesigned Runtime changed.

## The model

A History is a tree of entries, one per Message, each pointing to its parent, like git commits. The Head is the entry the next Message goes after. A Fork moves the Head to an earlier entry, and the next Message grows a new Branch beside the old one, which stays.

A History is plain data: the root's Input, its entries and its Head. It is an immutable value, and every function in `History` gives a new one and leaves the one it was given as it was: `add` writes an entry after the Head and moves the Head to it, `go` moves the Head, `line` reads the entries from the first to any one, `children` the entries that follow one, and `tips` the last entry of every Branch. With `entry(h, id).parent` for the one before, these are how a tool walks the History. Growing is cheap: a History shares its entries with the one it grew from.

Each entry holds what Replay needs and who Sent it: its `id`, its `parent`, the Address it is `to`, the `message`, who it is `from`, and its Time, `at`. Given the Actor, the Input and the Messages alone tell the Snapshot right after any entry: `Snapshot.replay(actor, history, id)` plays them, remembering Snapshots along the way so playing again starts from the nearest one.

Saved, it is plain JSON: its entries and its Head. In memory every value is decoded; `History.save(actor, history)` writes each Message, and each Instance of a Restore's Snapshot, through its Actor's Schemas, and `History.load(actor, saved)` reads them back through them. So the encoded side of every Schema must be JSON-safe: a `Date` saves as `Schema.DateFromString`, an `Option` as `Schema.OptionFromNullOr`. A saved History is checked as it is loaded; one whose Head or parents are not its own entries fails at once. A saved one never changes: the same History saves to the same object, and the next save is a new one.

## Running

A Runtime is a History, the Snapshot at its Head, and whether it runs. There is one per app. `Runtime.make(Auth, { layer })` makes one on a new History, and `Runtime.make(Auth, { layer, history })` carries one on. It runs from the moment it is made.

1. **Make.** Replay to the Head, carry Time on from the Head's Time (0 right after init), and run: the Workers and Provides the Head's data asks for start, from the Model alone. None of the Head's Commands runs: they ran, or were let go, when its Message was Sent.
2. **Each Message.** The Mailbox stamps it with the Time and adds it to the History after the Head, which moves to it, and `Snapshot.play` gives the next Snapshot. The Workers and Provides the Snapshot asks for start and the rest stop, and the Commands the Update asked for run. What the Update Emits is Sent next.
3. **Stop.** `stop()` ends every Worker, Provide and Command, and Time stands still. A Send to a stopped Runtime throws `Stopped` and adds nothing; `running` says which it is.
4. **Start.** `start()` runs again at the Head: the Workers and Provides its data asks for start, from the Model alone, and Time carries on from where it stood. No past Command runs again.
5. **Let go.** `dispose()` stops, closes the Mailbox and the Layer. Nothing Sent after arrives.

Two rules follow:

- Work that must survive a stop, a Fork or a reload belongs in a Worker, not a Command. A first fetch is a Worker.
- The outside world is not rewound. A Fork to an old entry rebuilds the app, not the server, the socket or localStorage.

## Looking back

`runtime.seek(id)` is the app right after an entry, on any Branch, `null` for init: a Step, the plain data `{ entry, at, snapshot }`. Nothing runs in it, nothing can be Sent to it, and it changes nothing: the Runtime stays where it is, running or stopped. Zoom in with `Snapshot.at(step.snapshot, address)`, and read an Instance's Trail up to the Step with `Snapshot.trail(actor, history, address, step.entry)`. With no Runtime, as a devtool does with a saved History, `Snapshot.replay(actor, history, id)` gives the same Snapshot.

## Branching off

`runtime.fork(id)` moves the same Runtime's Head to an entry, `null` for init, and its Time to that entry's. Running, its work stops and starts again from that entry's data: every Instance enters its State again and every Worker whose Condition holds starts again, from the Model alone. Stopped, only the Head moves, and it stays stopped. Either way no Command runs, and the next Message grows a new Branch; the old ones stay in the History, reached by `History.tips`. An Instance reached from outside before the Fork reads as it was, as after a Restore.

## Keeping it small

A Runtime keeps a Window of entries on the Head's Branch, 100 unless said; `0` keeps only the app as it is now, and `null` keeps every entry ([ADR 0029](adr/0029-a-window-compacts-the-history-into-a-restore.md)). After every Message and whenever the Window changes, it Compacts with `History.compact`: the oldest entry kept on the Head's Branch becomes a Restore of the Snapshot right after it, with its own id and Time, and every entry that does not grow from it is swept, with what Replay remembered of it. Compacting twice is compacting once, and it never touches the Head, so `runtime.keep(n)` works running or stopped. Time Travel then reaches init, the Restore, and the entries after it.

## Showing the past

Showing a Step is the App's business, not the Runtime's. `<Kabuki of={runtime.seek(id)} />` draws a Step and drops any Send from it; `<Kabuki of={runtime} />` draws the Runtime at its Head, and drops a Send while it is stopped. An app made with `View.app` does the same through `useRuntime()`: `seek(id)` draws that Step while the Runtime stays where it is, `null` for init as with `runtime.seek`, `toHead()` draws the Head again, and `fork(id)` moves the Runtime there. Its `runtime` is the same object throughout.

## What came of an entry

An entry holds only what Replay needs and who Sent it. Whether it was handled, ignored or dropped is what `Snapshot.play` says as it plays the entry, and is worked out again by playing it on the Snapshot before it: `Snapshot.play(actor, Snapshot.replay(actor, history, entry.parent), entry).outcome`.

Which Workers it started or stopped is worked out the same way, since the data decides what runs: `Snapshot.workers(actor, snapshot, address)` gives the Workers the data asks for at an Instance, each by its name and, for one of `each`, its key, by the same rule a running Runtime starts and stops them by. Those asked for after the entry and not before it started; those asked for before and not after stopped.
