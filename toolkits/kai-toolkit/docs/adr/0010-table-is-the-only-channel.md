# The AI Table is the only channel to the client

Every Coding Harness writes into a Transcript, the Transcript persists each batch as one immutable Message row, and clients learn everything by syncing Thread, Run, and Message rows. There is no delta stream, no replay log, and no `watchRun`; TanStack AI's `chat()`, `BaseTextAdapter`, and `StreamProcessor` are gone from the backend, and `@tanstack/ai` remains only as a devDependency so a type test can hold `AiMessagePart` to TanStack's `UIMessage` part shape. Claude Code streams partial messages so the Transcript has deltas to batch; Codex already did.

This supersedes ADR 0002, ADR 0005, ADR 0008, and the output clause of ADR 0001, and amends ADR 0003 (five GSI slots: GSI1 per-Thread feeds, GSI2 global feeds, GSI3 to GSI5 reserved) and ADR 0009 (rows are never updated; consumers fold consecutive rows of one Run and role into a turn).

## Considered options

- **Keep AG-UI and TanStack `chat()`.** Rejected: TanStack's loop-owned features (tools, Code Mode, skills, interrupts) cannot apply when Claude Code or Codex owns the agent loop, and its AG-UI spine forced a delta protocol, a durability log, and a fold step whose only reader was the persistence path. TanStack's own adapter contract still lists harness adapters as future work.
- **Update one Message row in place while it streams.** Rejected in favour of immutable rows: inserts are cheaper than upserts, sync stays append-only, and the fold is one pure browser-safe function.
- **Keep a delta stream beside the table for live typing.** Rejected: batching text by interval and size, then inserting a row, gives live output through the same channel the UI already reads. Reconnect is the sync cursor on `_u`.

## Consequences

- Live and Thread state live on the Thread row (`status`, `activeRunId`); the browser never asks the host anything.
- The Bootstrap Sweep reads every Run through the GSI2 feed and cancels the ones still running or waiting. A status-partitioned index is a later addition if that read grows.
- An AG-UI or ACP endpoint can be added later as a projection of Message rows (for example `MESSAGES_SNAPSHOT`) without changing storage.
