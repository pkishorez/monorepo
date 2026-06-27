## Task: Update sync config type definitions [AFK]

Rewrite the public type definitions in `src/types.ts` to reflect the new `query`/`subscribe` handler model and the new `OnDemandQueries` shape. This is a breaking change to the config interfaces — no runtime behavior changes in this task.

Module boundaries: `src/types.ts` is the only file touched. All other modules import from here, so getting this right first unblocks everything downstream.

Changes required:

- Add `QueryContext<TItem>` type: `{ getCursor: Effect<EntityType<TItem> | null> }`
- Add `SubscribeContext<TItem>` type: `{ getCursor: Effect<EntityType<TItem> | null>, push: (items: EntityType<TItem>[]) => void }`
- Update `TotalSyncConfig.query` from `(cursor: EntityType<TItem> | null) => Effect<EntityType<TItem>[]>` to `(ctx: QueryContext<TItem>) => Effect<EntityType<TItem>[]>`
- Add optional `TotalSyncConfig.subscribe`: `(ctx: SubscribeContext<TItem>) => Effect<void, never, Scope>`
- Add `TotalSyncConfig.fetchOnMount?: boolean`
- Replace `OnDemandQueries[K]` from a bare function `(value, cursor) => Effect<EntityType[]>` to an object `{ query: (value: TItem[K], ctx: QueryContext<TItem>) => Effect<EntityType<TItem>[]>, subscribe?: (value: TItem[K], ctx: SubscribeContext<TItem>) => Effect<void, never, Scope> }`
- Add `OnDemandConfig.fetchOnMount?: boolean`
- Import `Scope` from `effect` where needed

Test surface: Types are compile-time only — no runtime tests. Acceptance is that the TypeScript compiler accepts valid usages of the new shapes and rejects old ones.

Acceptance criteria:

- [ ] `QueryContext` and `SubscribeContext` are exported from `src/types.ts`
- [ ] `TotalSyncConfig.query` signature updated — cursor value replaced with `ctx: QueryContext`
- [ ] `TotalSyncConfig.subscribe` optional field added with correct signature
- [ ] `TotalSyncConfig.fetchOnMount` optional boolean added
- [ ] `OnDemandQueries[K]` is now `{ query: fn, subscribe?: fn }` not a bare function
- [ ] `OnDemandConfig.fetchOnMount` optional boolean added
- [ ] TypeScript compiles with no errors (existing files that reference old types will error — that is expected and resolved in the adapter task)

Blocked by: None — can start immediately
Done when: `src/types.ts` compiles cleanly with the new shapes, and the type signatures match the design exactly.

---

## Task: Build unified `partitioned.ts` internal module [AFK]

Create `src/internal/partitioned.ts` — the single implementation that both `totalSync` and `onDemand` will delegate to. This module contains all sync logic: partition lifecycle, cache management, subscribe fiber management, query dispatch, cursor resolution, loadSubset integration, and mutation handlers.

Inputs: `src/types.ts` with updated `QueryContext` and `SubscribeContext` types (produced by the types task).

Module boundaries: Export one function `buildPartitioned<TSchema>(tracker, options)` returning a `CollectionConfig`. The options type is an internal normalised form (not the public config types) that both adapters will construct.

The internal options shape should include:

- `schema`, `cache` — same as today
- `fetchOnMount: boolean` — whether to call `query` on the singleton/first partition at mount
- `partitions`: a map from field name to `{ query: fn, subscribe?: fn }` — for on-demand; empty for total sync
- `defaultPartitionKey: string` — `""` for total sync, not used for on-demand
- `singletonQuery?: { query: fn, subscribe?: fn }` — for total sync, the global handler (no `value` param); normalised internally to accept `(null, ctx)` before dispatch
- `onInsert`, `onUpdate`, `onDelete` — same as today

Core behaviors to implement:

- **Partition cache map**: `Map<string, Promise<CacheEntity<TItem>>>` keyed by serialized partition string
- **Semaphore map**: `Map<string, Semaphore>` one per partition
- **Subscribe fiber map**: `Map<string, Fiber<void>>` one per partition
- **`getCursor` factory**: returns `Effect<EntityType<TItem> | null>` that reads `cache.getLatest()` live at yield time
- **Activation**: when a partition is first accessed (mount for total sync, `loadSubset`/`fetchMore` for on-demand):
  1. Hydrate from cache → write to collection
  2. If `subscribe` provided: fork subscribe fiber (subscribe runs first, then query is skipped on activation)
  3. If no `subscribe` and `fetchOnMount` true: call `query`, cache results, write to collection
- **`fetchMore` dispatch**: always calls `query` (never `subscribe`), serialized by per-partition semaphore
- **`loadSubset`**: same filter-field lookup as today; triggers activation for the matched partition
- **Collection cleanup**: interrupt all fibers in the subscribe fiber map; nullify callbacks
- **Delete**: remove item from all partition caches (iterate all cache map values)
- **Mutation handlers** (`onInsert`, `onUpdate`, `onDelete`): identical logic to today

Test surface: No automated tests required given the wide integration surface. Manually verify by wiring up the adapters and confirming: items appear in collection after mount, subscribe cleanup fires on unmount, `fetchMore` paginates correctly using live cursor.

Acceptance criteria:

- [ ] `buildPartitioned` exported from `src/internal/partitioned.ts`
- [ ] Per-partition cache, semaphore, and fiber maps all keyed by `serializePartition(...)` string
- [ ] `getCursor` reads live from cache (not a snapshot)
- [ ] Subscribe fires before query on activation when both are provided
- [ ] If only `query` provided and `fetchOnMount: true`, query fires on mount
- [ ] `fetchMore` calls `query` only, regardless of whether subscribe is active
- [ ] All subscribe fibers interrupted in `cleanup`
- [ ] Delete removes item from every partition cache
- [ ] TypeScript compiles with no errors

Blocked by: "Update sync config type definitions"
Done when: `buildPartitioned` compiles cleanly and manual smoke test (via the adapter wiring task) confirms end-to-end data flow.

---

## Task: Wire up `total-sync.ts` and `on-demand.ts` as thin adapters [AFK]

Replace the full implementations in `src/internal/total-sync.ts` and `src/internal/on-demand.ts` with thin adapters over `buildPartitioned`. Each file's only job is to translate its public config type into the normalised internal options and delegate to `buildPartitioned`.

Inputs: `buildPartitioned` from `src/internal/partitioned.ts` (produced by the previous task) and the updated types from `src/types.ts`.

**`total-sync.ts` adapter responsibilities:**

- Map `TotalSyncConfig` → internal options
- Set `defaultPartitionKey: ""`
- Set `fetchOnMount: config.fetchOnMount ?? true`
- Wrap `config.query` (which takes `ctx: QueryContext`, no `value`) into the internal form that receives `(null, ctx)` — discard the null internally
- Wrap `config.subscribe` (if present) the same way
- Pass `onInsert`, `onUpdate`, `onDelete` unchanged

**`on-demand.ts` adapter responsibilities:**

- Map `OnDemandConfig` → internal options
- Set `fetchOnMount: config.fetchOnMount ?? false`
- Map `config.queries` (new shape: `{ fieldName: { query, subscribe? } }`) into the internal partitions map
- Pass `onInsert`, `onUpdate`, `onDelete` unchanged

Both adapters delete all logic that duplicates what `buildPartitioned` now owns (cache init, semaphore creation, fiber management, loadSubset, mutation handler wiring).

Test surface: No new tests. Existing behavior is preserved — the adapter is correct when the collection hydrates from cache on mount, `fetchMore` returns items, and mutations update the collection.

Acceptance criteria:

- [ ] `src/internal/total-sync.ts` contains only adapter logic — no cache maps, semaphores, or sync loop
- [ ] `src/internal/on-demand.ts` contains only adapter logic — no cache maps, semaphores, or sync loop
- [ ] `fetchOnMount` defaults to `true` for `totalSync`, `false` for `onDemand`
- [ ] Total sync's `value`-less handler signatures are correctly normalised before delegation
- [ ] On-demand's new `{ query, subscribe? }` per-field shape is correctly mapped
- [ ] Full TypeScript compilation with no errors across the package
- [ ] `createStdSync` in `src/create-std-sync.ts` requires no changes (adapters preserve the same return types)

Blocked by: "Build unified `partitioned.ts` internal module"
Done when: `tsc` passes across the package and both `totalSync` and `onDemand` collections mount, hydrate from cache, and respond to `fetchMore` correctly.
