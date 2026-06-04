# Effect v4 migration notes — @std-toolkit/tanstack-sync

Minimal, idiomatic v3→v4 changes. Public exports unchanged
(`createStdSync`, `CollectionRef`, `CollectionRegistry`).

## Changes

`src/internal/partitioned.ts` and `src/internal/single-item.ts`:

- **Semaphore**: `Effect.makeSemaphore(1)` (via `Effect.runSync`/`Effect.runSync`)
  → `Semaphore.makeUnsafe(1)` (new top-level `Semaphore` module). The
  `Effect.Semaphore` type → `Semaphore.Semaphore`. Instance API
  (`withPermits(n)(effect)`) unchanged.
- **Fork**: `Effect.forkDaemon(...)` → `Effect.forkDetach(...)` (detached daemon
  fiber, not tied to the parent scope).
- **Fiber type**: `Fiber.RuntimeFiber<void, unknown>` → `Fiber.Fiber<void,
unknown>` (the `RuntimeFiber` alias is gone; `Fiber.Fiber<A, E>` is the type).
- **Catch**: `Effect.catchAll(...)` → `Effect.catch(...)` (same callback shape).
- `Fiber.interrupt(fiber)` left as-is — still valid, returns `Effect<void>`,
  used inside `Effect.runFork` for cleanup.

No public API changes, no test changes. Tests pass unmodified (4/4).
