# A Turn's facts travel in its stream

Note: the harness's live handle, called `HarnessSession` when this was written, is now `Agent`, and the engine is the `code` App Group in `@kestack/connect`.

Everything the engine records about a Turn comes from that Turn's own stream, in the order the stream gives it: the agent's records, each steer where the agent took it (`TurnSteered`, with the engine's steer id), and how the Turn ended (`TurnEnd`: status, error, and the Turn's own Fork Point), always last. The engine writes a steer's `turn.started` when it reads its `TurnSteered`, and a steer counts as delivered only if that came; one that did not starts the next Turn. `turn.ended` takes its status and `nativeTurnId` from the `TurnEnd` alone. A stream that fails ends its Turn failed; one that ends without a `TurnEnd` ends it cancelled if a cancel asked for it, failed otherwise.

Steering is bound to a Turn too: `turn(input)` returns a handle, `{ out, steer }`, and so does each Agent-started Turn. A handle's `steer` joins only its own turn, and is refused once that turn has ended or while the agent runs another, so a steer meant for one Turn can never land in the next.

The harness writes each fact into the stream at the moment it is true: Claude marks a steer in the same synchronous step that pushes it to Claude Code, and ends a turn with the result that answered its last message; Codex holds back what it says while a `turn/steer` is in flight, marks the steer once Codex accepts it and then lets the rest through, keeps the turn open until then, and ends it with the main thread's `turn/completed`. A turn ended from here with a steer still unanswered marks that steer taken: a message shown that may have gone unanswered beats one sent twice.

## Considered options

- **Ask the live agent afterwards** (`lastTurnNativeId`, whether `steer()` returned, which record projected a turn end). Rejected: the agent's state is shared by every Turn, so a Turn read late, an agent-started Turn queued behind a user Turn, or a steer whose call returns after its Turn ended reads another Turn's facts, or none. Each fix for one race opened the next.
- **A separate channel for steers and ends.** Rejected: two channels need ordering between them, which is the problem again.

## Consequences

- `Agent` has no `lastTurnNativeId` and no `steer`: `turn` and `agentTurns` give `TurnHandle`s, whose `out` is `Stream<TurnOut>`, records and facts together, and whose `steer` takes the engine's id.
- A steered message always sits before the agent's answer to it, and is never run twice or lost.
- A harness that cannot say how a turn ended, as when Codex never confirms a cancel, ends the stream with `TurnEnd { cancelled }` itself.
