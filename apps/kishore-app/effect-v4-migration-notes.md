# kishore-app — Effect v4 migration notes

Top-of-graph app. All Effect workspace deps were already on v4 before this
package. Migration was mechanical + idiomatic, no behavior change.

## Changes by site

### otel runtime (`src/routes/otel/internal/runtime.ts`)

- Folded `@effect/platform` imports re-sourced from core:
  - `FetchHttpClient` → `effect/unstable/http`
  - `HttpApiClient` → `effect/unstable/httpapi`
- `Context.Tag('id')<Self, Shape>()` → `Context.Service<Self, Shape>()('id')`
  (plain tag → service; same yieldable identity, requirement type preserved).
- `Effect.Effect.Success<T>` → `Effect.Success<T>` (the nested `Effect.Effect`
  namespace is gone; `Success`/`Error` live directly on the `Effect` module).

### otel collections (`src/routes/otel/internal/collections.ts`)

- HttpApiClient call payload field `urlParams` → `query`
  (`client.lotel.queryTraces({ query })`). Matches the HttpApi `query` rename.

### Rollup service (`src/services/rollup/rollup.ts`, `src/services/runtime.ts`)

- `Effect.Service<Self>()(id, { effect })` → `Context.Service<Self>()(id,
{ make })`; added `static readonly layer = Layer.effect(this, this.make)`
  (no auto `.Default`). Call site `RollupService.Default` → `RollupService.layer`.

### ManagedRuntime → `Effect.provide` (`src/components/code-block/highlight.tsx`)

- `Effect.provide(managedRuntime)` is **no longer accepted in v4** (provide takes
  Layer/Context/array only). Wrap the runtime's context as a layer:
  `Layer.effectContext(runtime.contextEffect)` and provide that. `contextEffect`
  is a `ManagedRuntime` field exposing `Effect<Context<R>, ER>` (context is
  cached by the runtime, so this is cheap).

### Fiber blog snippets (`src/routes/blog/_slug/fiber-part-*`, `effect-all`)

- `Effect.fork` → `Effect.forkChild`; `Effect.forkDaemon` → `Effect.forkDetach`
  (already documented in shared learnings under `tanstack`). These eagerly-built
  default-exported effects threw `(void 0) is not a function` at prerender until
  renamed.
- `Effect.forkAll([a, b])` is **removed**. Replace with per-effect
  `Effect.forkChild` + `Fiber.joinAll([fa, fb])`.
- `Duration.DurationInput` → `Duration.Input`.
- `Effect.all(..., { mode: 'either' | 'validate' })` → `{ mode: 'result' }`
  (v4 collapses both v3 result-collecting modes into a single `'result'`).

### Form demo schemas (`src/routes/dev/components/*.tsx`)

- `Schema.standardSchemaV1(s)` → `Schema.toStandardSchemaV1(s)`.
- String/length checks moved to the `Check` API, applied via `Schema.check`:
  - `.pipe(Schema.minLength(n, { message: () => m }))` →
    `.pipe(Schema.check(Schema.isMinLength(n, { message: m })))`
  - `Schema.maxLength` → `Schema.isMaxLength`; `Schema.pattern` →
    `Schema.isPattern` (same `.check` wrapping).
  - Filter annotation `message` is now a **plain string**, not a thunk.
- `Schema.filter(predicate)` (custom messages) →
  `Schema.check(Schema.makeFilter(predicate))`. The predicate's `FilterOutput`
  union accepts `undefined | boolean | string | ReadonlyArray<string> |
{ path, issue }`. The struct-level cross-field check `{ path, message }` →
  `{ path, issue }`.
- `Schema.DateFromSelf` → `Schema.Date` (the runtime `Date` instance schema).

## Notes / follow-ups

- `@effect/platform-browser` (surviving package) is a dep but not imported in
  `src`; already pinned at `4.0.0-beta.78`.
- No test files exist in this package (`vp test` → "No test files found",
  exit 0). Nothing removed/skipped.
- Prose in `fiber-part-2/page.mdx` still narrates the concept as "forkDaemon"
  (no paren, so untouched by the code rename). Left as-is — narrative naming is
  a content decision, not a mechanical migration concern. Worth a docs pass
  later if the blog should reflect v4 API names.
