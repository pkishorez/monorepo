# A Turn's facts travel in its stream

Everything the engine records about a Turn comes from that Turn's own stream, in the order the stream gives it: the agent's records, each steer where the agent took it (`TurnSteered`, with the engine's steer id), and how the Turn ended (`TurnEnd`: status, error, and the Turn's own Fork Point), always last. The engine writes a steer's `turn.started` when it reads its `TurnSteered`, and a steer counts as delivered only if that came; one that did not starts the next Turn. `turn.ended` takes its status and `nativeTurnId` from the `TurnEnd` alone. A stream that fails ends its Turn failed; one that ends without a `TurnEnd` ends it cancelled if a cancel asked for it, failed otherwise.

The harness writes each fact into the stream at the moment it is true: Claude marks a steer in the same synchronous step that pushes it to Claude Code, and ends a turn with the result that answered its last message; Codex marks a steer when `turn/steer` is accepted, holds the turn open until then, and ends it with the main thread's `turn/completed`.

## Considered options

- **Ask the live agent afterwards** (`lastTurnNativeId`, whether `steer()` returned, which record projected a turn end). Rejected: the agent's state is shared by every Turn, so a Turn read late, an agent-started Turn queued behind a user Turn, or a steer whose call returns after its Turn ended reads another Turn's facts, or none. Each fix for one race opened the next.
- **A separate channel for steers and ends.** Rejected: two channels need ordering between them, which is the problem again.

## Consequences

- `HarnessSession` has no `lastTurnNativeId`; `steer` takes the engine's id; a turn stream is `Stream<TurnOut>`, records and facts together.
- A steered message always sits before the agent's answer to it, and is never run twice or lost.
- A harness that cannot say how a turn ended, as when Codex never confirms a cancel, ends the stream with `TurnEnd { cancelled }` itself.
