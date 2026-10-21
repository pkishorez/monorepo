# Fork Points are Turn ends

A Fork copies a Session's context up to the end of a finished Turn, never to a point inside one. Claude Code can resume at any message (`resumeSessionAt` takes a message uuid), but Codex forks a thread only at a turn boundary, so the common contract offers the boundary both can honour. Each Turn's stream ends with its own Fork Point (Claude: the uuid of the Turn's last transcript entry; Codex: the turn id; see ADR 0013), and the engine writes it into that Turn's `turn.ended` Raw as `nativeTurnId`. `Harness.fork({ cwd, nativeId, at })` takes that id and returns the new Session's Native Id; the new Session records `forkedFrom: { sessionId, turnId }`.

## Considered options

- **Fork at any Message.** Rejected: Codex cannot, and a Message is our flush boundary, not the harness's; a Message id means nothing to either agent.
- **Look the native id up when forking.** Rejected: Claude's transcript and Codex's thread history would each need reading and matching to our Turns after the fact. Storing the id as the Turn ends costs one field.

## Consequences

- A Turn that ended before this change, or that failed before the harness reported an id, has no `nativeTurnId` and cannot be forked after.
- A running Turn is never a Fork Point.
- Finer Fork Points can be added for Claude later without changing stored Turns.
