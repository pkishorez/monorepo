# The Runtime is a Snapshot kept alive, and the History sits beside it

Supersedes [ADR 0025](0025-the-runtime-starts-from-a-history.md), and the Restore of [ADR 0021](0021-an-app-is-saved-as-its-log-and-drawn-before-it-runs.md) and [ADR 0029](0029-a-window-compacts-the-history-into-a-restore.md). Amends [ADR 0038](0038-code-outside-the-tree-reaches-live-instances.md) and [ADR 0046](0046-outside-code-tells-asks-and-waits.md): how outside code reaches an Instance and names itself.

One Consequence no longer holds: drawing a Snapshot that changes without waking every View is done. Each View, and each `useChild` and `useChildren`, is told at its own Address, only when its Instance changed, came or went. The Snapshot drawn is compared with the one before, skipping every part that is the same object in both, as the live tree does. A Seek, or a Fork to a Snapshot that shares nothing with the one before, still compares the whole tree. No ADR records that; everything else here stands.

The Runtime held a History, a Snapshot and a live tree, and moved all three together. So it Seeked, Forked, Compacted and kept a Window, and nothing could run from a Snapshot alone: a Snapshot entered as a Restore, a Message no Update sees. The Snapshot and the Runtime each seemed to define the other.

Kabuki core is now three things and one add-on, each a folder:

| Folder     | What it is                                                | Made from                  |
| ---------- | --------------------------------------------------------- | -------------------------- |
| `actor`    | The Definition: what can exist                            | your code                  |
| `snapshot` | The Snapshot: what exists now, as plain data              | the Definition and entries |
| `runtime`  | The Runtime: a Snapshot kept alive                        | a Snapshot and a Layer     |
| `history`  | The History: a starting Snapshot and the entries after it | a Snapshot and entries     |

Everything flows one way. `Snapshot.init` makes the first Snapshot from the root's Input, and `Snapshot.next` gives the next from one entry, `{ to, message, from, at }`, purely. `Runtime.make(actor, { snapshot, layer })` runs it. The only thing that comes back from the running work is a Message, which is the next entry.

**The Runtime holds a Snapshot and no other data.** A live Instance decides nothing: it is told its part of each new Snapshot and Follows it, changing only what differs. A part that is the same object as before is skipped with everything below it, which is cheap, since `Snapshot.next` makes new objects only on the path to the Instance that changed. New data reaches the Instance's code and starts and stops its Workers by their Conditions; a new State closes the old State's Scope and opens the new one; a Child that is gone stops and a new one starts. A Message and a Snapshot handed in, `runtime.follow(snapshot)`, are Followed the same way, so work both Snapshots ask for is not touched. `follow(snapshot, { restart: true })` stops all work and starts it again.

**The History is an add-on.** It is a starting Snapshot, the entries after it and a Head: plain data with pure functions, as the Snapshot is. A Runtime knows no History. It tells whoever subscribes the entries it played, which they add to one; and `History.snapshot` gives a Snapshot a Runtime can follow, which is all a Fork is. The React App keeps one beside its Runtime, with its Window. One Instance's entries are a filter of the list by the Address they were sent to, so there is no Trail.

**There is no Restore.** A History starts from a Snapshot, so a Snapshot needs no Message to enter one, and Compacting moves the start forward to the Snapshot right before the oldest entry kept. `Snapshot.save` and `Snapshot.load` save the app as it is now; `History.save` and `History.load` save how it got there.

**An Instance has one shape.** In a Snapshot it is its Address, its Actor's name, its State, Model and Props and its Children, with its State's tag repeated at the top, so a check on `_tag` narrows `state` and `children` together. A live Instance, `runtime.root` or `runtime.at(address)`, reads the same from the Runtime's Snapshot and adds what only a Runtime gives: `send`, `queries`, `workers` and `until`. Walking down from the root and going straight at an Address reach the same one.

The data stays the truth ([ADR 0009](0009-the-snapshot-is-the-truth.md)), and an entry stays what Replay needs and who Sent it ([ADR 0023](0023-a-log-entry-is-what-replay-needs-and-who-sent-it.md)). What only a running app knows, how each Worker is doing, is read from the Runtime and never kept in a Snapshot.

## Considered Options

- **The Snapshot and the History inside the Runtime**: rejected. The Runtime then moves three things together, and the app as data needs a Runtime that never runs.
- **A plan worked out from the data, and a flat diff of plans**: rejected. The live tree walking the old and the new Snapshot already is the diff, and nested Scopes give the order work stops and starts in, which a flat diff must keep itself.
- **Work out which Children exist in the live tree, not in the Snapshot**: rejected. A Child owns its Model and State once it starts, so its existence is data; and one place deciding is the point.
- **Keep the entries that started and last changed an Instance in the Snapshot**: rejected. They are the History's to tell, and they made a Snapshot depend on entry numbers.
- **Restart all work on every Snapshot handed in**: rejected as the default. Going back one entry would stop and start Workers the app is still running. It is the option to ask for, since after another path is taken the same Address can name another life of a Child.
- **A typed builder for Addresses written by hand**: rejected for now. An Address holds a count that cannot be known ahead, so it would need a second idea, whoever is at a place now. Walking from the root gives a typed Instance, and its Address is kept to come back to it.
- **Keep the root's Input in the History and run init again**: rejected. A History that starts from a Snapshot has one rule, and a loaded Snapshot can start one.

## Consequences

- A Runtime tells the entries it played only to those subscribed, and work can Send as it starts. To miss no entry, a Runtime is made stopped, `running: false`, subscribed to, then started; `start()` runs at once unless work is still stopping.
- A History kept beside a Runtime plays each entry a second time when it is asked for a Snapshot. It remembers what it played, so this costs one more Update per Message.
- A Send from outside to an Instance that is gone plays no entry, since there is no Instance to Send through. A Send from a Worker or a Command to one that is gone is still played and dropped.
- A Send from outside says it comes from outside, with no name unless it gives one: `instance.send(message, { kind: 'outside', name })`.
- A saved Snapshot or History whose start no longer fits the code is refused when loaded, where a Restore that did not fit was skipped. After a hot reload the History's start is the old start read through the new Schemas: init does not run again.
- The React App draws its first Snapshot before its Runtime is made, as before, and Forks by a restart. Drawing a Snapshot that changes without drawing every View again was a later step; it is done, as the note at the top says.
