# trace-viewer — Effect v4 migration notes

Build-only package (`build: tsc`; no lint/test). No direct workspace Effect
dependency on already-migrated packages; only consumes `effect` core directly.

## Changes

- **`core/schema.ts`**
  - Flattened `Cause`: `exit.cause._tag === 'Interrupt'` →
    `Cause.hasInterrupts(exit.cause)` (added `Cause` import).
  - `Schema.Record({ key, value })` → `Schema.Record(key, value)` (positional).
- **`ui/span/span.tsx`, `ui/span/span-info.tsx`**
  - `Cause.isInterrupted` → `Cause.hasInterrupts`.
- **`ui/controls/config.tsx`**
  - `Schema.Literal('base', 'compact')` → `Schema.Literals(['base', 'compact'])`.
  - `Schema.decodeUnknownEither` (→ `Result`) → `Schema.decodeUnknownResult`;
    `_tag === 'Left'` → `_tag === 'Failure'`.
- **`core/watcher.ts`**
  - `SubscriptionRef` is no longer method-based: `ref.modify(fn)` →
    `SubscriptionRef.modify(ref, fn)`.
  - `Layer.setTracer(t)` removed → `Layer.succeed(Tracer.Tracer, t)`
    (`Tracer.Tracer` is a `Context.Reference`).
  - `Tracer.make({ span(...) })` span callback now takes a **single options
    object** `{ name, parent, annotations, links, startTime, kind, root,
sampled }` (was positional `(name, parent, context, links, startTime,
kind)`). The v3 `context` field is now `annotations`
    (`Context.Context<never>`) on both the span options and the returned `Span`.
  - Dropped the `context: (fn) => fn()` tracer field — the v4 `context` hook has
    a different `(primitive, fiber)` signature and is optional; not needed here.
- **`ui/timeline/content.tsx`**
  - `subscriptionRef.changes` → `SubscriptionRef.changes(ref)` (standalone,
    returns a value `Stream`, not a chunk stream).
  - `Stream.runForEachChunk` removed. To keep burst-coalescing (take latest of a
    batch) used `Stream.chunks` + `Stream.runForEach`. `Stream.chunks` now emits
    `NonEmptyReadonlyArray` (not `Chunk`); replaced `Chunk.last` with
    `Array.lastNonEmpty`. Dropped `Chunk` import, added `Array as Arr`,
    `SubscriptionRef`.

## Public exports

Unchanged. No exported types renamed.
