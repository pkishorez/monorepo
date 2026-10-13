# A Log entry is what Replay needs, and who sent it

A Log entry is its place on the Branch (`id`, `parent`) and its Envelope: the `destination` Instance, the `message`, its Time `at`, and its `source`, the Instance that Sent it and what in it did (its View, a Command by name, or a Worker by name and key), or outside the tree for a test or a tool. Nothing else. What came of a Message (handled, ignored or dropped, the State before and after, every Model and Props field that changed) is worked out from the Snapshots around it, and the Runtime keeps it beside the Log while live and rebuilds it on load, never saving it. Replay reads only the destination, the Message and its Time. The Source is kept because nothing can work it out again, and it shows who talked to whom.

## Considered Options

- **Keeping the outcome and the State before and after in each entry (until now)**: rejected. Replay can work them out, and keeping them stores what came of a Message beside the Message itself.
- **Keeping the outcome to warn when Replay no longer handles what live did**: rejected. A Log is replayed against today's code by design. Replay warns only when a Message, or a Restore's Snapshot, no longer fits its Schemas.
- **Keeping each Message's Change**: rejected. The same truth twice, as [ADR 0004](0004-replay-needs-only-the-messages.md) rejected Snapshot history.
- **Dropping the Source, or keeping only its Instance**: rejected. Which View, Command or Worker sent a Message cannot be recovered later.

## Consequences

- Drawing a saved Log's Timeline needs a Replay first, to know which Messages were ignored or dropped.
- A Message for an Instance that is gone is dropped silently, live and in Replay alike.
