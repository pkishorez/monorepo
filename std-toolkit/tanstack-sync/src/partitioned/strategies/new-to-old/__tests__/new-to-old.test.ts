import { describe, expect, it } from 'vitest';
import { Effect, Scope, Stream } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { newToOld } from '../new-to-old.js';
import type { NewToOldState } from '../state.js';
import type { StrategyContext } from '../../interface.js';

type Item = { id: string };

const entity = (id: string, u: string): EntityType<Item> => ({
  value: { id },
  meta: { _e: 't', _v: '1', _d: false, _u: u },
});

const uOf = (e: EntityType<Item>) => e.meta._u;

/**
 * Drives `newToOld.run` against an in-memory dataset sorted ascending by `_u`,
 * recording every server-truth write and every `fetchOlder` cursor. `subscribeNewer`
 * returns a finite stream so `run` completes for assertions.
 */
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
    fetchOlder: ({ cursor }) =>
      Effect.sync(() => {
        olderCursors.push(
          cursor === null ? null : uOf(cursor as EntityType<Item>),
        );
        const pool =
          cursor === null
            ? sorted
            : sorted.filter((e) => uOf(e) < uOf(cursor as EntityType<Item>));
        return pool.slice(-opts.pageSize);
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

describe('newToOld', () => {
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

  it('connects adjacent pages without leaving a gap', async () => {
    const dataset = ['u01', 'u02', 'u03', 'u04'].map((u) => entity(u, u));
    const { state } = await drive({ dataset, pageSize: 2 });
    // pages [u03,u04] and [u01,u02] are adjacent, not overlapping — the cursor
    // boundary must still merge them into a single slice.
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
    expect(uOf(next.state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(next.state.slices[0]!.high as EntityType<Item>)).toBe('u04');
    expect(new Set(next.written.map((e) => e.value.id))).toEqual(
      new Set(dataset.map((e) => e.value.id)),
    );
    expect(next.olderCursors).toEqual([null, 'u03', 'u01']);
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
    expect(uOf(next.state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(next.state.slices[0]!.high as EntityType<Item>)).toBe('u04');
    expect(new Set(next.written.map((e) => e.value.id))).toEqual(
      new Set(dataset.map((e) => e.value.id)),
    );
    expect(next.olderCursors).toEqual([null, 'u03', 'u01']);
  });

  it('resumes a warm session, fills the top gap, and never re-probes the floor', async () => {
    const session1 = ['u01', 'u02', 'u03', 'u04'].map((u) => entity(u, u));
    const first = await drive({ dataset: session1, pageSize: 2 });
    expect(first.state.reachedOldest).toBe(true);

    // 30-day gap: four newer records appear at the top.
    const session2 = [
      ...session1,
      ...['u05', 'u06', 'u07', 'u08'].map((u) => entity(u, u)),
    ];
    const second = await drive({
      dataset: session2,
      pageSize: 2,
      initial: first.state,
    });

    // Everything collapses to one slice covering the full range.
    expect(second.state.slices).toHaveLength(1);
    expect(uOf(second.state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(second.state.slices[0]!.high as EntityType<Item>)).toBe('u08');
    // Because reachedOldest was already true, backfill stops once the top slice
    // reaches the floor — it must never fetch older than the oldest record.
    expect(second.olderCursors).not.toContain('u01');
  });
});
