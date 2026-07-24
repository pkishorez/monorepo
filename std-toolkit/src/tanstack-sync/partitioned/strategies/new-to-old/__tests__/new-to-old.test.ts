import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../../../../laymos/more-coverage.js';
import { Effect, Scope, Stream } from 'effect';
import type { EntityType } from '../../../../../core/index.js';
import { newToOld } from '../new-to-old.js';
import type { NewToOldState } from '../state.js';
import type { StrategyContext } from '../../interface.js';

type Item = { id: string };

const entity = (id: string, u: string): EntityType<Item> => ({
  value: { id },
  meta: { _e: 't', _v: '1', _d: false, _u: u },
});

const uOf = (e: EntityType<Item>) => e.meta._u;

const drive = async (opts: {
  dataset: EntityType<Item>[];
  pageSize: number;
  initial?: NewToOldState;
}) => {
  const sorted = [...opts.dataset].sort((a, b) =>
    uOf(a) < uOf(b) ? -1 : uOf(a) > uOf(b) ? 1 : 0,
  );
  const written: EntityType<Item>[] = [];
  const olderCursors: (string | null)[] = [];
  let state: NewToOldState = opts.initial ?? {
    slices: [],
    reachedOldest: false,
  };

  const ctx: StrategyContext<Item, NewToOldState> = {
    forwardFetch: () => Effect.sync(() => []),
    writeServerTruth: (entities) =>
      Effect.sync(() => {
        written.push(...(entities as EntityType<Item>[]));
      }),
    getState: Effect.sync(() => state),
    setState: (s) =>
      Effect.sync(() => {
        state = s;
      }),
    scope: undefined as unknown as Scope.Scope,
  };

  const strategy = newToOld<Item>({
    subscribeOlder: ({ cursor }) =>
      Effect.sync(() => {
        olderCursors.push(
          cursor === null ? null : uOf(cursor as EntityType<Item>),
        );
        const pool =
          cursor === null
            ? sorted
            : sorted.filter((e) => uOf(e) <= uOf(cursor as EntityType<Item>));
        const pages: EntityType<Item>[][] = [];
        for (let end = pool.length; end > 0; end -= opts.pageSize) {
          pages.push(pool.slice(Math.max(0, end - opts.pageSize), end));
        }
        return Stream.fromIterable(pages);
      }),
    subscribeNewer: ({ cursor }) =>
      Effect.sync(() => {
        const newer =
          cursor === null
            ? sorted
            : sorted.filter((e) => uOf(e) > uOf(cursor as EntityType<Item>));
        return Stream.fromIterable(newer.length === 0 ? [] : [newer]);
      }),
  });

  await Effect.runPromise(Effect.scoped(strategy.run(ctx)));
  return { written, olderCursors, state };
};

moreCoverageDomain('TanStack Sync', () => {
  describe('Partitioned', () => {
    describe('New to old', () => {
      describe('Behavior', () => {
        it('drains the whole dataset into one slice and reaches the floor', async () => {
          const dataset = ['u01', 'u02', 'u03', 'u04', 'u05', 'u06'].map((u) =>
            entity(u, u),
          );
          const { written, state } = await drive({ dataset, pageSize: 2 });

          expect(state.reachedOldest).toBe(true);
          expect(state.slices).toHaveLength(1);
          expect(uOf(state.slices[0]!.low as EntityType<Item>)).toBe('u01');
          expect(uOf(state.slices[0]!.high as EntityType<Item>)).toBe('u06');
          expect(new Set(written.map((e) => e.value.id))).toEqual(
            new Set(dataset.map((e) => e.value.id)),
          );
        });

        it('merges contiguous live-tail batches into one slice when the backfill is empty', async () => {
          const written: EntityType<Item>[] = [];
          let state: NewToOldState = { slices: [], reachedOldest: false };
          const ctx: StrategyContext<Item, NewToOldState> = {
            forwardFetch: () => Effect.sync(() => []),
            writeServerTruth: (entities) =>
              Effect.sync(() => {
                written.push(...(entities as EntityType<Item>[]));
              }),
            getState: Effect.sync(() => state),
            setState: (s) =>
              Effect.sync(() => {
                state = s;
              }),
            scope: undefined as unknown as Scope.Scope,
          };

          const batches = [
            ['u01', 'u02'],
            ['u03', 'u04'],
            ['u05', 'u06'],
          ].map((page) => page.map((u) => entity(u, u)));

          const strategy = newToOld<Item>({
            subscribeOlder: () => Effect.sync(() => Stream.empty),
            subscribeNewer: () =>
              Effect.sync(() => Stream.fromIterable(batches)),
          });

          await Effect.runPromise(Effect.scoped(strategy.run(ctx)));

          expect(state.slices).toHaveLength(1);
          expect(uOf(state.slices[0]!.low as EntityType<Item>)).toBe('u01');
          expect(uOf(state.slices[0]!.high as EntityType<Item>)).toBe('u06');
          expect(written).toHaveLength(6);
        });

        it('connects adjacent pages without leaving a gap', async () => {
          const dataset = ['u01', 'u02', 'u03', 'u04'].map((u) => entity(u, u));
          const { state } = await drive({ dataset, pageSize: 2 });
          expect(state.slices).toHaveLength(1);
        });

        it('leaves the floor unproven on an empty dataset', async () => {
          const { state, written } = await drive({ dataset: [], pageSize: 2 });
          expect(state.reachedOldest).toBe(false);
          expect(state.slices).toHaveLength(0);
          expect(written).toHaveLength(0);
        });

        it('backfills all pages after an empty prior sync', async () => {
          const empty = await drive({ dataset: [], pageSize: 2 });
          const dataset = ['u01', 'u02', 'u03', 'u04'].map((u) => entity(u, u));
          const next = await drive({
            dataset,
            pageSize: 2,
            initial: empty.state,
          });

          expect(next.state.reachedOldest).toBe(true);
          expect(next.state.slices).toHaveLength(1);
          expect(uOf(next.state.slices[0]!.low as EntityType<Item>)).toBe(
            'u01',
          );
          expect(uOf(next.state.slices[0]!.high as EntityType<Item>)).toBe(
            'u04',
          );
          expect(new Set(next.written.map((e) => e.value.id))).toEqual(
            new Set(dataset.map((e) => e.value.id)),
          );
          expect(next.olderCursors).toEqual([null]);
        });

        it('normalizes a legacy empty reachedOldest state before backfilling', async () => {
          const dataset = ['u01', 'u02', 'u03', 'u04'].map((u) => entity(u, u));
          const next = await drive({
            dataset,
            pageSize: 2,
            initial: { slices: [], reachedOldest: true },
          });

          expect(next.state.reachedOldest).toBe(true);
          expect(next.state.slices).toHaveLength(1);
          expect(uOf(next.state.slices[0]!.low as EntityType<Item>)).toBe(
            'u01',
          );
          expect(uOf(next.state.slices[0]!.high as EntityType<Item>)).toBe(
            'u04',
          );
          expect(new Set(next.written.map((e) => e.value.id))).toEqual(
            new Set(dataset.map((e) => e.value.id)),
          );
          expect(next.olderCursors).toEqual([null]);
        });

        it('resumes a warm session, fills the top gap, and never re-probes the floor', async () => {
          const session1 = ['u01', 'u02', 'u03', 'u04'].map((u) =>
            entity(u, u),
          );
          const first = await drive({ dataset: session1, pageSize: 2 });
          expect(first.state.reachedOldest).toBe(true);

          const session2 = [
            ...session1,
            ...['u05', 'u06', 'u07', 'u08'].map((u) => entity(u, u)),
          ];
          const second = await drive({
            dataset: session2,
            pageSize: 2,
            initial: first.state,
          });

          expect(second.state.slices).toHaveLength(1);
          expect(uOf(second.state.slices[0]!.low as EntityType<Item>)).toBe(
            'u01',
          );
          expect(uOf(second.state.slices[0]!.high as EntityType<Item>)).toBe(
            'u08',
          );
          expect(second.olderCursors).not.toContain('u01');
        });
      });
    });
  });
});
