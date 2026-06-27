## Problem Statement

`totalSync` and `onDemand` in `@std-toolkit/tanstack-sync` share nearly identical internal logic — per-partition caches, semaphores, cursor tracking, cache hydration on mount — but are maintained as two separate implementations. Any change to the core sync loop must be applied twice, and the two diverge over time. Additionally, the current query function is fire-and-forget, making it impossible to express long-lived subscriptions (WebSocket, SSE, polling loops) with proper cleanup semantics.

## Solution

Unify `totalSync` and `onDemand` behind a single internal partitioned implementation. A total sync collection is a degenerate partitioned collection with exactly one partition (the empty string `""`). Both public entry points remain as thin adapters over this shared core. At the same time, promote the query function to a first-class two-function model: a mandatory `query` for explicit pagination and an optional `subscribe` for long-lived, scope-managed data channels.

## User Stories

1. As a library author, I want `totalSync` and `onDemand` to share a single internal implementation, so that bug fixes and improvements apply to both automatically.
2. As a library author, I want total sync to be modelled as a partitioned collection with one partition, so that there is no special-casing in the core loop.
3. As a consumer, I want `totalSync` and `onDemand` to remain as separate entry points, so that the semantic distinction between "all records" and "records by partition" is still expressed at the call site.
4. As a consumer, I want the `query` function to return fetched items directly, so that simple fetch-and-display use cases require no boilerplate.
5. As a consumer, I want `query` to receive a `getCursor` effect rather than a cursor value, so that long-running or reactivated queries always paginate from the true latest item rather than a stale snapshot.
6. As a consumer, I want to provide an optional `subscribe` function that runs in a managed scope, so that I can set up WebSocket listeners, SSE streams, or polling loops with automatic cleanup.
7. As a consumer, I want `subscribe` to receive a `push` callback, so that it can emit items to the collection at any time during its lifetime.
8. As a consumer, I want `subscribe` to also receive `getCursor`, so that I can open a realtime channel starting from the latest known position.
9. As a consumer, I want `subscribe` to be called automatically when a partition is activated, so that I do not need to trigger the subscription manually.
10. As a consumer, I want `query` to be called only on explicit `fetchMore`, so that pagination remains under my control and does not conflict with a running subscription.
11. As a consumer, I want `getCursor` to always reflect the live cache state at the moment it is yielded, so that pagination after subscription pushes correctly continues from the newest item.
12. As a consumer using only `query` (no `subscribe`), I want the behavior to be identical to today, so that I do not need to change my code except for the new signature.
13. As a consumer, I want `subscribe` scope to be closed when the collection unmounts, so that subscriptions do not leak after the component tree is torn down.
14. As a consumer, I want to configure whether a collection loads eagerly on mount or lazily on first access, so that I can tune startup behavior per collection.
15. As a consumer, I want `totalSync`'s `query` handler to omit the partition `value` parameter, so that I am not exposed to the internal partition abstraction.
16. As a consumer, I want `totalSync`'s `subscribe` handler to also omit the `value` parameter, so that the total sync API feels natural.
17. As a consumer, I want `onDemand`'s `queries` to accept a `{ query, subscribe? }` object per field, so that I can opt into subscriptions per partition field.
18. As a consumer, I want deleting an item to remove it from all partition caches, so that stale data does not reappear when switching partitions.
19. As a consumer, I want subscribe fibers to be tracked per partition and interrupted on collection cleanup, so that multiple active partitions each clean up independently.
20. As a consumer, I want the cache store name for a total sync collection to follow the same `schema.name:key` convention as partitioned collections, so that IDB store naming is consistent.

## Implementation Decisions

### Unified internal module

A new `src/internal/partitioned.ts` module contains the single `buildPartitioned` function. Both `buildTotalSync` and `buildOnDemand` become thin adapters that normalise their config into the shape this function expects and delegate to it.

### Singleton partition key

Total sync uses `""` (empty string) as its partition key. This is the natural output of `serializePartition({})` — no sentinel constant, no special-casing in the core loop.

### Handler split: `query` vs `subscribe`

Each partition handler is expressed as two functions:

```typescript
// Partitioned handler shape (per field key in queries)
{
  query: (value: TValue, ctx: QueryContext<TItem>) => Effect<EntityType<TItem>[]>
  subscribe?: (value: TValue, ctx: SubscribeContext<TItem>) => Effect<void, never, Scope>
}

// Total sync handler shape (value omitted)
{
  query: (ctx: QueryContext<TItem>) => Effect<EntityType<TItem>[]>
  subscribe?: (ctx: SubscribeContext<TItem>) => Effect<void, never, Scope>
}

type QueryContext<TItem> = {
  getCursor: Effect<EntityType<TItem> | null>
}

type SubscribeContext<TItem> = {
  getCursor: Effect<EntityType<TItem> | null>
  push: (items: EntityType<TItem>[]) => void
}
```

### Dispatch rules

- If `subscribe` is provided: it is called automatically on partition activation (mount for total sync, `loadSubset`/`fetchMore` first call for on-demand). `query` is called only on explicit `fetchMore`.
- If `subscribe` is absent: `query` is called on activation (mount / `loadSubset`) AND on `fetchMore`. This preserves current behavior exactly.

### `getCursor` is a live cache read

`getCursor` resolves to `cache.getLatest()` at the moment it is yielded — not a snapshot captured at activation time. This ensures pagination after subscription pushes correctly continues from the newest cached item.

### Subscribe lifecycle

One `Fiber` per partition is forked when `subscribe` is first activated. All partition fibers are interrupted in the collection-level `cleanup` callback. There is no per-partition deactivation at this stage.

### Eager vs lazy

Both `totalSync` and `onDemand` accept a `fetchOnMount` boolean (default: `true` for `totalSync`, `false` for `onDemand` to preserve current behavior). When `true` and no `subscribe` is provided, `query` is called immediately on mount after cache hydration.

### Breaking changes to config types

| Before                                                        | After                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `TotalSyncConfig.query: (cursor) => Effect<EntityType[]>`     | `query: (ctx: QueryContext) => Effect<EntityType[]>`                           |
| `OnDemandQueries[K]: (value, cursor) => Effect<EntityType[]>` | `queries[K]: { query: (value, ctx) => Effect<EntityType[]>, subscribe?: ... }` |

### Delete behavior unchanged

`onDelete` removes the item from all partition caches. For total sync this is one partition; for on-demand it is all active partitions. No change in semantics.

### Module responsibilities

- **`src/internal/partitioned.ts`** — all sync logic: partition cache map, semaphore map, fiber map, scope management, `subscribe` activation, `query` dispatch, cache hydration on mount, `loadSubset` integration, mutation handlers.
- **`src/internal/total-sync.ts`** — adapter only: maps `TotalSyncConfig` into the unified format, sets singleton partition key `""`, omits `value` from handler signatures.
- **`src/internal/on-demand.ts`** — adapter only: maps `OnDemandConfig` (with new `queries` shape) into the unified format.
- **`src/types.ts`** — updated config interfaces, new `QueryContext` and `SubscribeContext` types.

## Testing Decisions

Unit testing this module requires a real or mocked TanStack DB collection lifecycle (mount, unmount, loadSubset) and a fake cache store. The integration surface is wide and the setup is non-trivial. Given this, tests are optional and deferred. If added, they should test:

- External behavior only: items appearing in the collection after activation, items appearing after `fetchMore`, subscribe cleanup running on collection unmount.
- No assertions on internal fiber state, partition map size, or semaphore internals.
- Prior art: existing test files in `src/__tests__/` if any exist; otherwise model after `@std-toolkit/cache` tests.

## Out of Scope

- Per-partition scope deactivation (e.g. closing a subscription when no component queries that partition). Collection-level cleanup only for now.
- `singleItem` — not affected by this unification.
- Inactivity TTL for partition scopes.
- Any changes to the broadcast registry or `CollectionTracker`.

## Further Notes

- The `serializePartition({})` → `""` behavior in `@std-toolkit/cache` is relied upon. If that function changes, the singleton key assumption breaks.
- The IDB store name for a total sync collection becomes `"<schema.name>:"` (trailing colon). This is distinct from all partitioned stores and is safe.
- `subscribe` firing before `query` on activation (subscribe-then-backfill) is the intended ordering when both are provided, to avoid missing events between the two calls. This should be preserved in the implementation.
