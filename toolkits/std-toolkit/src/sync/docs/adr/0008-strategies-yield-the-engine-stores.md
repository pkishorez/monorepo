---
status: accepted
---

# Sync Strategies yield; the engine stores and restarts

A Sync Strategy used to own everything: its loop, a source mini-language
(`paginated`, `poll`, `live`), and separate `applyToSyncReplica` and `setState`
calls. A Sync Strategy is now `{ name, state, initial, run }`, where `run`
returns a Stream of `{ entities, state }`. The engine stores each yield in one
write, holds Leadership, and reruns the strategy from saved Sync State after a
growing delay when it fails; when the Stream ends the Session is done.

Pull and push are options of the same strategy, not separate concepts. Two
built-ins cover the common cases: `oldToNew({ fetch?, subscribe?, pollEvery? })`
and `newToOld({ fetch, fetchOlder, subscribe?, pollEvery? })`. `fetch` catches
up; `subscribe({ after })` is pushed everything after the cursor and then live
changes; with both, `fetch` catches up and `subscribe` goes live; with neither
`pollEvery` nor `subscribe` the strategy catches up once and ends. Because the
cursor is saved as Entities arrive, a reconnect replays from it with no extra
coordination. `newToOld` also fills the gap a reload leaves, which replaces the
former `bidirectional`. Each scope runs exactly one strategy.

## Considered Options

- **A Step shape** (`step → { entities, state, next }`, engine-owned delays) —
  simple for polling, but it cannot express push.
- **Step for pull plus Stream for push** — two shapes to learn for one idea.
- **A Collection-level Subscription beside the strategies** — needs catch-up
  and live feed coordinated on every reconnect; a `subscribe` that starts from
  the strategy's cursor needs none.

Supersedes ADR-0003.
