import { Effect, Stream, SynchronizedRef } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { PartitionedStrategy, StrategyContext } from '../interface.js';
import { NewToOldStateSchema, type NewToOldState } from './state.js';

type Cursor<TItem> = EntityType<TItem>;

type Slice<TItem> = { low: Cursor<TItem>; high: Cursor<TItem> };

type CursorCtx<TItem> = { cursor: Cursor<TItem> | null };

/**
 * Newest-first source split across two directions:
 *
 * - `fetchOlder` — cursor-based pull. `{ cursor: null }` must resolve the newest
 *   page; a non-null cursor resolves the page strictly older than it. An empty
 *   batch signals the absolute oldest record has been reached.
 * - `subscribeNewer` — a stream anchored at the session's fresh top. It must
 *   deliver every record newer than the cursor (catching up any missed) and then
 *   stay live. A `null` cursor (empty dataset) means "from the start, live".
 */
type NewToOldConfig<TItem> = {
  fetchOlder: (ctx: CursorCtx<TItem>) => Effect.Effect<EntityType<TItem>[]>;
  subscribeNewer: (
    ctx: CursorCtx<TItem>,
  ) => Effect.Effect<Stream.Stream<EntityType<TItem>[]>>;
};

const uOf = <TItem>(entity: Cursor<TItem>): string => entity.meta._u;

const oldestOf = <TItem>(batch: EntityType<TItem>[]): Cursor<TItem> =>
  batch.reduce((acc, e) => (uOf(e) < uOf(acc) ? e : acc));

const newestOf = <TItem>(batch: EntityType<TItem>[]): Cursor<TItem> =>
  batch.reduce((acc, e) => (uOf(e) > uOf(acc) ? e : acc));

/**
 * Inserts a candidate range into the slice list and merges any slices that
 * overlap or touch, keeping the list disjoint, ascending, and minimal.
 */
const reconcile = <TItem>(
  slices: readonly Slice<TItem>[],
  candidate: Slice<TItem>,
): Slice<TItem>[] => {
  const all = [...slices, candidate].sort((a, b) =>
    uOf(a.low) < uOf(b.low) ? -1 : uOf(a.low) > uOf(b.low) ? 1 : 0,
  );
  const merged: Slice<TItem>[] = [];
  for (const s of all) {
    const last = merged[merged.length - 1];
    if (last && uOf(s.low) <= uOf(last.high)) {
      if (uOf(s.high) > uOf(last.high)) last.high = s.high;
    } else {
      merged.push({ low: s.low, high: s.high });
    }
  }
  return merged;
};

/**
 * The slice holding the session's fresh top — the one with the maximum high.
 * `reconcile` keeps slices disjoint and ascending, so the top is the last one.
 */
const topSlice = <TItem>(
  slices: readonly Slice<TItem>[],
): Slice<TItem> | null => slices[slices.length - 1] ?? null;

/**
 * True once the top slice reaches the floor: nothing is loaded below it. With a
 * disjoint, ascending slice list that holds exactly when it has collapsed to one
 * material slice.
 */
const topReachesFloor = (state: NewToOldState): boolean =>
  state.slices.length === 1;

/**
 * Newest-first strategy with a live tail. Each session first pulls the newest
 * page (`fetchOlder({ cursor: null })`) to anchor at the *fresh* top, then runs
 * two activities concurrently under the engine's retry/scope:
 *
 * - the **live tail** (`subscribeNewer`) extends the top slice upward as new
 *   records arrive;
 * - the **backfill** frontier (`fetchOlder`) descends from the newest page,
 *   reconciling/merging older slices until it hits the floor.
 *
 * State is held in a `SynchronizedRef` so both fibers reconcile atomically; every
 * commit writes server-truth first, then persists the new sync-state. `WriteError`
 * is not caught — it surfaces so the engine restarts the whole run, both fibers
 * together, resuming from the persisted slices.
 */
export const newToOld = <TItem extends object>(
  config: NewToOldConfig<TItem>,
): PartitionedStrategy<TItem, NewToOldState> => ({
  name: 'new-to-old',
  state: {
    schema: NewToOldStateSchema,
    empty: { slices: [], reachedOldest: false },
  },
  run: (ctx: StrategyContext<TItem, NewToOldState>) =>
    Effect.gen(function* () {
      const initial = yield* ctx.getState;
      const stateRef = yield* SynchronizedRef.make(initial);

      // Serialized read-modify-persist: SoT is already written by the caller; this
      // advances sync-state atomically and returns the committed state.
      const commit = (f: (s: NewToOldState) => NewToOldState) =>
        SynchronizedRef.modifyEffect(stateRef, (s) => {
          const next = f(s);
          return Effect.as(ctx.setState(next), [next, next] as const);
        });

      const addRange =
        (low: Cursor<TItem>, high: Cursor<TItem>) =>
        (s: NewToOldState): NewToOldState => ({
          ...s,
          reachedOldest: s.slices.length === 0 ? false : s.reachedOldest,
          slices: reconcile(s.slices as readonly Slice<TItem>[], { low, high }),
        });

      const markReachedOldest = (s: NewToOldState): NewToOldState => ({
        ...s,
        reachedOldest: true,
      });

      // 1. Latest page — anchors the fresh top and seeds the backfill cursor.
      const latest = yield* config.fetchOlder({ cursor: null });
      let freshTop: Cursor<TItem> | null = null;
      let backfillCursor: Cursor<TItem> | null = null;
      if (latest.length > 0) {
        yield* ctx.writeServerTruth(latest);
        freshTop = newestOf(latest);
        backfillCursor = oldestOf(latest);
        yield* commit(addRange(backfillCursor, freshTop));
      }

      // 2. Live tail — extends the top slice upward, anchored at the fresh top.
      const liveTail = Effect.gen(function* () {
        const stream = yield* config.subscribeNewer({ cursor: freshTop });
        yield* Stream.runForEach(stream, (batch) =>
          Effect.gen(function* () {
            if (batch.length === 0) return;
            yield* ctx.writeServerTruth(batch);
            const low = freshTop ?? oldestOf(batch);
            yield* commit(addRange(low, newestOf(batch)));
          }),
        );
      });

      // 3. Backfill — descends from the newest page, merging older slices.
      const backfill = Effect.gen(function* () {
        let cursor = backfillCursor;
        while (cursor !== null) {
          const state = yield* SynchronizedRef.get(stateRef);
          if (state.reachedOldest && topReachesFloor(state)) return;

          const batch = yield* config.fetchOlder({ cursor });
          if (batch.length === 0) {
            yield* commit(markReachedOldest);
            return;
          }
          yield* ctx.writeServerTruth(batch);
          const next = yield* commit(addRange(oldestOf(batch), cursor));
          const top = topSlice(next.slices as readonly Slice<TItem>[]);
          cursor = top === null ? null : top.low;
        }
      });

      yield* Effect.all([backfill, liveTail], { concurrency: 'unbounded' });
    }),
});
