# A Fork reads its history from the original

A Fork no longer copies the original Session's Raw. It stores only `forkedFrom: { sessionId, turnId }`, and its transcript is the original's Messages up to that Turn's end followed by its own; a Fork of a Fork reads up the chain. The harness still makes its own native copy of the agent's context (ADR 0011), so the copy we dropped was ours alone and only duplicated what the original already holds. A Fork is listed as a Session of its own, not nested under the original.

## Considered options

- **Copy the original's Raw into the Fork (the previous design).** Rejected: every Fork duplicates its whole history, and the two copies exist only so the transcript can be drawn.
- **Nest Forks under the original in the sidebar.** Rejected: once the original is Settled, or forked more than once, the tree has to reshape itself; a flat list with a "forked from" link stays simple.

## Consequences

- An original can never be removed on its own while a Fork reads from it; Settling hides it and keeps its history.
- Drawing a Fork reads more than one Session's Messages.
- Forks made under the old design held copies; the database is started fresh rather than migrated.
