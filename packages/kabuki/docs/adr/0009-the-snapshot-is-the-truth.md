# The Snapshot is the truth, and Instance IDs are deterministic

Supersedes the mutable Instance tree and the creation-order numbering of [ADR 0004](0004-replay-needs-only-the-messages.md); Replay still needs only the Messages.

The whole app is one immutable Snapshot: every Instance with its ID, its Actor's name, its State, its Model and its Children. Handling a Message is a pure function from a Snapshot and a Message to the next Snapshot plus the Commands Update asked for. Replay is a fold of that function over a Branch, and nothing else changes the app's data. Effect work (Capabilities, Lifetimes, Commands) is driven from the Snapshot, never stored in it.

An Instance ID is built from its parent's ID, the Child's name, its key, and how many times the parent has Invoked that Child. The same Messages always give the same IDs, and an Instance Invoked again gets a new ID, so a Message meant for one that is gone is dropped, as ADR 0004 required. Replay never creates an Instance the Messages did not: a missing one means the Replay diverged, which must show, not be repaired.

## Considered Options

- **A mutable Instance tree changed through Hooks (until now)**: rejected. Replay, saving and seeking back had to rebuild objects, and the data was spread over Instances instead of being one value.
- **Numbering Instances in creation order (ADR 0004)**: rejected. IDs carried no meaning and broke as soon as creation order changed.
- **Recreating a missing Instance from its parent's definition during Replay**: rejected. It hides divergence.

## Consequences

- Seeking back can start from a saved Snapshot instead of from init.
- Saving the app is encoding the Snapshot and the Log with the Actors' Schemas; Messages are checked against their Schemas in development.
