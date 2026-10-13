# How the History works

Terms are in [CONTEXT.md](../CONTEXT.md): History, Head, Branch, Step, Replay, Runtime. The decisions are [ADR 0007](adr/0007-the-log-is-a-tree-the-runtime-runs-in-memory.md), [ADR 0025](adr/0025-the-runtime-starts-from-a-history.md) and [ADR 0026](adr/0026-an-instance-runs-its-own-life.md).

## The model

A History is a tree of entries, one per Message, each pointing to its parent, like git commits. The Head is the entry the next Message goes after. Moving the Head to an earlier entry and starting there grows a new Branch beside the old one, which stays.

A History is made for one Actor and the root's Input, so it needs nothing else to tell the Snapshot right after any entry: it replays its own Messages, remembering Snapshots along the way so playing again starts from the nearest one. Saved, it is plain JSON: its entries and its Head. In memory every value is decoded; saved, each Message, and each Instance of a Restore's Snapshot, is written through its Actor's Schemas, and read back through them on load. So the encoded side of every Schema must be JSON-safe: a `Date` saves as `Schema.DateFromString`, an `Option` as `Schema.OptionFromNullOr`. A saved History is checked as it is loaded; one whose Head or parents are not its own entries fails at once. A saved one never changes: the next save is a new object.

## Running

`Runtime.start(history, layer)` runs a History, or `Runtime.start(Auth, layer)` a new one.

1. **Start.** Replay to the Head, carry Time on from the Head's Time (0 right after init), and start the root Instance there. The History keeps its Head while any Runtime runs on it.
2. **Each Message.** The Mailbox stamps it with the Time and hands it to the root Instance, which decides the next Snapshot and makes its tree follow it. Then the Envelope is appended to the History, and the Head moves to it.
3. **Stop.** The Mailbox closes, Time stands still, and the root Instance stops: every Worker, Command and Capability ends. The Snapshot and the History stay.
4. **Branch off.** Stop, move the History's Head, start. `start(entry)` does all three; `start()` carries on from the Head. Every Instance enters its current State again and every Worker whose Condition holds starts again, from the Model alone. Commands that were running at the stop are gone.

Two rules follow:

- Work that must survive a stop belongs in a Worker, not a Command. A first fetch is a Worker.
- The outside world is not rewound. Starting from an old entry rebuilds the app, not the server, the socket or localStorage.

## Keeping it small

A History keeps every entry unless it has a Window ([ADR 0029](adr/0029-a-window-compacts-the-history-into-a-restore.md)). With one, after every append and whenever the Window changes, it Compacts: the oldest entry kept on the Head's Branch becomes a Restore of the Snapshot right after it, with its own id and Time, and every entry that does not grow from it is swept, with what Replay remembered of it. Compacting twice is compacting once, and it never touches the Head, so `history.keep(n)` works while a Runtime runs. Time Travel then reaches init, the Restore, and the entries after it.

## Showing the past

Showing a Step is the App's business, not the Runtime's. The App draws the History's Snapshot right after the Step shown, at its Time, while the live app runs on underneath, and drops any Send from the past. Showing live again draws the Runtime's Snapshot.

## What came of an entry

An entry holds only its Envelope. Whether it was handled, ignored or dropped is remembered beside the History while live, and worked out again by playing the entry on the Snapshot before it otherwise.
