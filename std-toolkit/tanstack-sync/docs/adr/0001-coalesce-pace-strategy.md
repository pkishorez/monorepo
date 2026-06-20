# Coalesce pace strategy: single-flight, completion-paced, no retry

## Status

accepted

## Context

`pacedUpdate` (formerly `queueUpdate`) controls when optimistic updates are
committed to the server. TanStack DB ships `debounce`, `throttle`, and `queue`
pacers, all **time-based** — they delay every fire by a clock. For paste-style
rapid edits we want a different shape: act on the first edit _immediately_, and
while that request is in flight, merge all subsequent edits into a single
follow-up request that fires the moment the in-flight one resolves. This is paced
by request _completion_, not by a timer.

## Decision

Add a custom **coalesce** pace strategy (single-flight with trailing
coalescence):

- First call for a key fires leading-edge immediately.
- While a request is in flight, all further calls for that key coalesce into one
  pending backlog (last-write-wins per field, via the accumulated transaction).
- On the in-flight request's **success**, the merged backlog fires as one
  request after an optional `wait` cooldown gap (default `0`, measured from
  completion — not a debounce on user input).
- On **failure**, the in-flight gate clears and the backlog is **retained**; the
  next user `pacedUpdate` fires it leading-edge. The pacer itself never retries
  or backs off.

It is exposed two ways: the raw `coalesceStrategy()` primitive from the
`@std-toolkit/tanstack-sync/paced` subpath (usable in any
`createPacedMutations`), and `paceStrategy.coalesce()` for the collection-level
`updatePacing?` config on both `sync` and `singleItemSync`. Coalesce is the
default pacer.

## Considered options

- **Fire-on-any-settle** (retry the merged backlog on failure too) — rejected:
  with a dead server this becomes a tight retry loop with no backoff.
- **Drop the backlog on failure** — rejected: silently loses the user's merged
  edits.
- **Success-only trigger, retain backlog on failure** — chosen: no
  hammer-the-dead-server loop, and no silent data loss. Retry/backoff stays the
  responsibility of the user's mutation Effect, which can already express it.

## Consequences

Retry and backoff are deliberately _not_ the pacer's job — a failed request
strands the merged edits until the next user action. This keeps the pacer small
and predictable.

### Potential future improvements

- Optional pacer-level retry/backoff policy (would supersede the no-retry stance
  above).
- A `maxWait` safety ceiling if a `wait` gap is ever combined with very long
  requests.
- Re-fire the retained backlog automatically on reconnect / online events,
  rather than waiting for the next user action.
- Coalesce for inserts/deletes if a merge semantics for them ever emerges
  (currently updates-only).
