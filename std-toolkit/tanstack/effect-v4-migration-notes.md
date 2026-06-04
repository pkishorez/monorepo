# @std-toolkit/tanstack — Effect v4 migration notes

Minimal v3→v4 migration. No public API changes; all exports compatible.

## Changes

- **`Effect.makeSemaphore(n)` → `Semaphore.make(n)`** (new top-level `Semaphore`
  module). The semaphore shape (`withPermits(n)(effect)`) is unchanged.
- **`Effect.Semaphore` type → `Semaphore.Semaphore`** (`shared.ts`
  `makeWithSyncGuard` param).
- **`Effect.fork(effect)` → `Effect.forkChild(effect)`** (collection-options
  sync fiber). Same child-fiber semantics; `Fiber.join` unchanged. This also
  resolved the downstream `Effect<…, unknown>` requirement error at the
  `Effect.runCallback` call site (the v3 `Effect.fork` no longer existed, so the
  surrounding gen's `R` widened to `unknown`).
- **`Effect.catchAll` → `Effect.catch`** (single-item-options error recovery).
- **Test:** `SubscriptionRef.SubscriptionRefTypeId in ref` →
  `SubscriptionRef.isSubscriptionRef(ref)` (the exported type-id symbol is gone;
  use the predicate).

`Effect.runCallback`, `Effect.runSync`, `Effect.runPromise`,
`SubscriptionRef.make/set/get`, `Effect.forEach`, `Effect.ensuring`,
`Effect.orDie`, `Effect.suspend`, `Schema.is`, `Effect.all`, `Effect.map`,
`Option.*`, `Fiber.join` — all unchanged.

## Acceptance

- build: pass
- test: 35 passed, 0 removed/skipped
- lint: pass
