import { describe, expect, it } from 'vitest';
import { Effect, Scope, Stream } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { bidirectional } from '../bidirectional.js';
import type { BidirectionalState } from '../state.js';
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
  initial?: BidirectionalState;
}) => {
  const sorted = [...opts.dataset].sort((a, b) =>
    uOf(a) < uOf(b) ? -1 : uOf(a) > uOf(b) ? 1 : 0,
  );
  const written: EntityType<Item>[] = [];
  let state: BidirectionalState = opts.initial ?? { slices: [] };

  const ctx: StrategyContext<Item, BidirectionalState> = {
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

  const olderPage = (cursor: EntityType<Item> | null) => {
    const pool =
      cursor === null ? sorted : sorted.filter((e) => uOf(e) < uOf(cursor));
    return pool.slice(Math.max(0, pool.length - opts.pageSize));
  };

  const newerPage = (cursor: EntityType<Item> | null) => {
    const pool =
      cursor === null ? sorted : sorted.filter((e) => uOf(e) > uOf(cursor));
    return pool.slice(0, opts.pageSize);
  };

  const strategy = bidirectional<Item>({
    fetchOlder: ({ cursor }) =>
      Effect.sync(() => olderPage(cursor as EntityType<Item> | null)),
    fetchNewer: ({ cursor }) =>
      Effect.sync(() => newerPage(cursor as EntityType<Item> | null)),
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
  return { written, state };
};

describe('bidirectional', () => {
  it('closes the gap from both ends into a single slice', async () => {
    const dataset = ['u01', 'u02', 'u03', 'u04', 'u05', 'u06', 'u07'].map((u) =>
      entity(u, u),
    );
    const { written, state } = await drive({ dataset, pageSize: 2 });

    expect(state.slices).toHaveLength(1);
    expect(uOf(state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(state.slices[0]!.high as EntityType<Item>)).toBe('u07');
    expect(new Set(written.map((e) => e.value.id))).toEqual(
      new Set(dataset.map((e) => e.value.id)),
    );
  });

  it('collapses immediately when newest and oldest pages overlap', async () => {
    const dataset = ['u01', 'u02', 'u03'].map((u) => entity(u, u));
    const { state } = await drive({ dataset, pageSize: 3 });
    expect(state.slices).toHaveLength(1);
    expect(uOf(state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(state.slices[0]!.high as EntityType<Item>)).toBe('u03');
  });

  it('leaves an empty dataset with no slices', async () => {
    const { state, written } = await drive({ dataset: [], pageSize: 2 });
    expect(state.slices).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it('merges contiguous live-tail batches into one slice when the initial fetch is empty', async () => {
    const written: EntityType<Item>[] = [];
    let state: BidirectionalState = { slices: [] };
    const ctx: StrategyContext<Item, BidirectionalState> = {
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

    // Empty campaign at subscription time, then four disjoint live batches —
    // exactly what generating vouchers in pages produces.
    const batches = [
      ['u01', 'u02'],
      ['u03', 'u04'],
      ['u05', 'u06'],
      ['u07', 'u08'],
    ].map((page) => page.map((u) => entity(u, u)));

    const strategy = bidirectional<Item>({
      fetchOlder: () => Effect.sync(() => []),
      fetchNewer: () => Effect.sync(() => []),
      subscribeNewer: () => Effect.sync(() => Stream.fromIterable(batches)),
    });

    await Effect.runPromise(Effect.scoped(strategy.run(ctx)));

    expect(state.slices).toHaveLength(1);
    expect(uOf(state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(state.slices[0]!.high as EntityType<Item>)).toBe('u08');
    expect(written).toHaveLength(8);
  });

  it('does not re-fetch the already-loaded window on resume', async () => {
    const dataset = ['u01', 'u02', 'u03', 'u04', 'u05', 'u06'].map((u) =>
      entity(u, u),
    );
    const first = await drive({ dataset, pageSize: 2 });
    expect(first.state.slices).toHaveLength(1);
    expect(uOf(first.state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(first.state.slices[0]!.high as EntityType<Item>)).toBe('u06');

    // Re-open with no new server data: a complete slice must reconcile to a
    // no-op and write nothing — no re-download of the loaded range.
    const second = await drive({ dataset, pageSize: 2, initial: first.state });
    expect(second.state.slices).toHaveLength(1);
    expect(second.written).toHaveLength(0);
  });

  it('resumes a warm session and refills the top gap', async () => {
    const session1 = ['u01', 'u02', 'u03', 'u04'].map((u) => entity(u, u));
    const first = await drive({ dataset: session1, pageSize: 2 });
    expect(first.state.slices).toHaveLength(1);

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
    expect(uOf(second.state.slices[0]!.low as EntityType<Item>)).toBe('u01');
    expect(uOf(second.state.slices[0]!.high as EntityType<Item>)).toBe('u08');
  });
});
