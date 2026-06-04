# @std-toolkit/cache — Effect v4 migration notes

## Scope

Migrated `src/` and tests to Effect `4.0.0-beta.78`. Public exports unchanged
(`CacheError`, `CacheErrorType`, `CacheEntity`, `CacheSingleItem`, `CacheStore`,
`serializePartition`, `PartitionKey`, plus `./idb` and `./memory` subpath
exports). No tests removed or skipped (50 tests, 4 files, all green).

## Changes

The package already used the v4-compatible `Effect.try({ try, catch })` and
`Effect.tryPromise({ try, catch })` forms, `Data.TaggedError`, `Option`, and
`Effect.gen(function* () …)` — all unchanged in v4. The only breakages were in
`src/memory/memory-cache-entity.ts`:

- **`SortedMap` is removed from `effect` core in v4.** The file used a
  `SortedMap.SortedMap<string, string>` as a secondary index from `meta._u`
  (update id) → entity id, maintained in `put`/`delete`/`deleteAll` and read in
  `getLatest`/`getOldest`. There is no sorted-map collection in v4 core
  (`packages/effect/src/` has `HashMap`, `MutableHashMap`, `TxHashMap`,
  `RcMap`, `LayerMap`, `FiberMap` — no sorted variant).
  Replaced the index with an on-demand single-pass scan of the existing
  `Map<string, StoredItem>` (`#extremum('min' | 'max')`) comparing by
  `meta._u`. This removes the index-bookkeeping branches from `put`/`delete`/
  `deleteAll` — a net simplification, not a new primitive. Lexicographic-by-`_u`
  ordering (the only behavior the tests assert) is preserved.
- **`Order.string` → `Order.String`** (capitalized in v4). Used here via
  `Order.mapInput(Order.String, (item) => item.meta._u)`.

No other files required changes. The `idb/*` modules use only `Effect`,
`Option`, and `Effect.tryPromise`, all stable.

## Net lines

`git diff --shortstat`: see commit. The memory-cache-entity rewrite is roughly
line-neutral (dropped the SortedMap index, added a small `#extremum` helper).

## Acceptance

- build: pass (`tsc`)
- test: pass (50/50, zero removed/skipped)
- lint: pass (`vp check && tsc --noEmit`)
