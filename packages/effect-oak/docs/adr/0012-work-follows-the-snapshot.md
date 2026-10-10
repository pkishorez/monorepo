# Work follows the Snapshot, one Message at a time

Each Message goes through every step before the next one: `handle` makes the new Snapshot, then `reconcile`, starting at the Instance that got the Message, closes the Scopes of what stopped (children first, because Scopes nest) and forks the work of what started (parents first; a Child's work waits for its parent's Capabilities), then the Update's Command is forked and the entry appended to the Log. Subscribers are told once the queue is empty, before `send` returns, so many Messages make one render and a controlled input still renders inside its keypress. Replay runs no reconcile; going live is a reconcile from nothing. `start`, `stop` and `show` are Effects, and a new `start` or `show` interrupts the one still running.

## Considered Options

- **Handle a batch of Messages, then reconcile once**: rejected. A State entered and left inside one batch would never run its Lifetime, and Commands would not know which Snapshot they belong to.
- **Reconcile the whole tree after every Message**: rejected. Only the Instance that got the Message and what is below it can change.
- **Tell subscribers at the next animation frame**: rejected for the reason in [ADR 0010](0010-handling-a-message-is-synchronous.md).
