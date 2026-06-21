# New-to-old sync strategy

`NewToOld` is a partitioned sync strategy that delivers the newest records first and backfills older records in the background, to escape `OldToNew`'s limitation: with a large backlog, `OldToNew` blocks the newest records behind a full replay of the backlog. `NewToOld` makes the newest records visible immediately (a live tail anchored at the current top) while a single descending frontier fills the older history behind the scenes. Config is `syncStrategy.newToOld({ fetchOlder, subscribeNewer })`, registered alongside `oldToNew`; `fetchOlder` is a cursor-based pull (engine owns the descending loop) and `subscribeNewer` is a stream (caller owns the live cadence).

## Ordering by `_u` is sound — the Upward Migration invariant

`NewToOld` paginates by `_u`, the same update key used for convergence, even though `_u` changes when a record is edited. This is sound because `_u` only ever moves a record **upward**: an update assigns a `_u` newer than every existing `_u` ("now"), so records migrate toward the top and never down into a historical interval.

Consequence: a fully-drained `_u` interval is **permanently complete** — it can only _shed_ records (an edit lifts a record to the top, where a later pass re-fetches it and convergence dedupes by id) and can **never gain** a record it did not already see. This is what lets the strategy snapshot frozen `_u` boundaries and trust that "covered" stays covered across reloads, without a separate immutable creation key. The strategy reads `_u` to sort batches and detect slice overlap; the cursor is opaque only as to _how the caller fetches older records from it_. We assume `_u` is a strict total order (unique per entity); tie-breaking to guarantee that is the caller's `fetchOlder` concern.

## State: a slice list plus a collection-level `reachedOldest`

```ts
type Slice = { low: Cursor; high: Cursor }; // contiguous loaded _u range
type NewToOldState = { slices: Slice[]; reachedOldest: boolean };
```

Covered history is a list of disjoint `_u` ranges. Reconcile runs on every batch: extend the touched slice, then merge overlapping or touching slices, keeping the list minimal. `reachedOldest` flips true only after the lowest material slice has been proven to reach the absolute floor and stays true forever — by the invariant above the oldest record never moves, so every later session is pure gap-filling above the floor and backfill never probes below it again. An empty collection leaves `reachedOldest: false` because there is no bottom slice to anchor future gaps.

## Anchor the live tail at the fresh top, not the saved high

Every session — warm or cold — runs the same sequence: `fetchOlder({ cursor: null })` (newest page) → reconcile → start the live tail anchored at the **fresh** newest record → start backfill descending from the newest page's low. The live tail anchors at the fresh top each session, never at the saved high-water. Both fibers live under the one strategy `scope` and share `slices` through a single `SynchronizedRef` whose `updateEffect` reconciles and persists atomically; a `WriteError` in either fiber restarts the whole `run`, which re-reads persisted state and resumes.

## Considered options

- **Two watermarks `{ low, high }` instead of a slice list, with the live tail anchored at the saved high.** Rejected: after a long absence the saved high sits far below the new top, so anchoring there forces the live tail to replay the entire gap before showing anything new — exactly the `OldToNew` limitation `NewToOld` exists to avoid. Anchoring at the fresh top instead opens a genuine gap between the new top slice and the old covered region, which _requires_ a slice list to track. The disjoint-slice model is the cost of immediate newest-first delivery.
- **A separate immutable creation key for pagination** (distinct from `_u`). Rejected as unnecessary: the Upward Migration invariant makes `_u` intervals durable on its own, and entities have no such key today.
- **Parallel per-gap backfill frontiers.** Deferred: a single descending frontier sequentially collapsing the slice list is correct and resumable; concurrent gap-filling is a pure throughput optimization layered on the same state, to add only if backfill latency proves too slow.
