# Code outside the tree reaches live Instances, typed, and Sends with a name

On a server an app is not drawn: a long-running process starts its Runtime and must still look inside it and act on it. `running.instance({ from })` gives the root Instance, typed by its Actor, and from it every Instance below, narrowed by State as a View's Children are: always there, `undefined` unless `while` holds, or a list by key for `each`. Every read is live, worked out from the Runtime's current Snapshot, and an Instance also reads its Workers; nothing can be written. It can Send to any Instance, and `send` answers only whether the Message arrived. Every such Send comes from outside, with the name `from` gives it. The past stays where it was: `running.snapshot()` and `history.snapshotAt()`, untyped, and the Inspector.

This sits beside [ADR 0027](0027-a-parent-controls-its-children-only-through-data.md), not against it. A parent still controls its Children only through data. Code outside the tree is a source of facts, as a View is: a Message is something that happened, and the Instance's own Update decides what comes of it, so a reader of the Instance still learns what it does from its Model, State, Props and Messages.

## Considered Options

- **A typed tree for past Steps too**: rejected. The Inspector already reads the past, and a past tree that cannot Send or show Workers is a second shape to learn for little use.
- **A Snapshot frozen at the call**: rejected. What a server reads must be the app now; reads in one synchronous block already agree, since handling a Message is synchronous ([ADR 0010](0010-handling-a-message-is-synchronous.md)).
- **A separate `Introspection` object**: rejected. On a server this is the first-class way to use the app, so it lives on the Runtime that runs it, the same in a browser.
- **Sending only to the root, or only Messages an Actor marks as open to outside**: rejected. A Message is a fact either way, and marking would be schema work before any need.
- **A detailed outcome per Send** (handled, ignored, dropped, waiting, refused): rejected. A caller asks one thing, whether it arrived; the History has the rest.

## Consequences

- A server's History keeps no Messages by default (a Window of 0: only the app as it is now, as a Restore), and a browser's keeps the last 100. So who Sent from outside is known in the moment, and kept only where a Window keeps it.
- An Instance that has stopped reads as it was when last read, and a Send to it does not arrive: keeping its very last data would mean watching every Instance ever reached, which a server running for weeks cannot afford. A key that comes back is a new Instance with a new ID, so an old one never points at it.
- TypeScript keeps a narrowing across a `send` or an `await`, though the State may have moved on: read it again.
