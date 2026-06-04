# use-effect-ts — Effect v4 migration notes

React hooks package, no internal Effect deps. Migration was purely mechanical
API renames in the `Scope`/`Fiber` modules — no logic or public-shape changes.

## Changes

- **`Scope.extend(scope)` → `Scope.provide(scope)`** (4 call sites:
  `use-component-lifecycle`, `use-run-effect`, `use-run-effect-latest`,
  `use-run-effect-queue`). Same dual signature (`(value) => (self) => …`).
  The earlier "unknown not assignable to SetStateAction" `useState` errors were
  cascades from `extend` being untyped; they cleared once `provide` was used.
- **`Scope.CloseableScope` → `Scope.Closeable`** (`use-component-scope`).
  Structurally identical, so the public hook signatures stay compatible for
  `monoverse`.
- **`Fiber.interrupt` now returns `Effect<void>`, not `Effect<Exit>`**
  (`use-component-lifecycle`). The teardown needed the exit to close the scope,
  so it now interrupts then `yield* Fiber.await(fiber)` to obtain the `Exit`
  before `Scope.close(scope, exit)`.

## Unchanged

- `Exit.void`, `FiberHandle.make/run`, `FiberSet.make/run`, `Fiber.join`,
  `Effect.runFork/runSync/runPromise/runPromiseExit`, `Effect.gen(function*)`
  (no `self`), `Effect.onInterrupt`, `Effect.logDebug` — all identical in v4.
- Public exports in `index.ts` unchanged; no new types exported.

## Build / lint

- `pnpm --filter use-effect-ts build` — passes.
- `pnpm --filter use-effect-ts lint` — passes (ran `vp fmt` after edits).
- No `test` script exists for this package; none added.
