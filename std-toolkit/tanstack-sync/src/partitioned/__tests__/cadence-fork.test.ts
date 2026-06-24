import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '@std-toolkit/core';
import type { SyncCollection } from '../../cadence-sync/cadence-sync.js';

vi.mock('../../cadence-sync/index.js', () => ({
  runCadenceSync: vi.fn(() => Effect.never),
}));

import { buildPartitioned } from '../partitioned.js';
import { runCadenceSync } from '../../cadence-sync/index.js';
import { makeTracker } from '../../registry/tracker.js';
import { makeSyncInspector } from '../../inspector/index.js';
import { memoryOfflineStorage } from '../../offline-storage/memory-offline-storage.js';

type Item = { id: string };

const makeOfflineStorage = () => memoryOfflineStorage();
const makeInspector = () => makeSyncInspector(memoryOfflineStorage());

const schema = {
  name: 'CadenceTest',
  idField: 'id' as const,
  parse: (v: unknown) => v as Item,
  Type: undefined as unknown as Item,
};

const cadence = { window: 5000, readiness: 10000, pollDelay: 2000 };

const strategy = {
  name: 'test',
  state: {
    schema: Schema.Struct({ cursor: Schema.NullOr(Schema.String) }),
    empty: { cursor: null },
  },
  run: () => Effect.never,
};

const partitionEntry = (over?: {
  cadence?: typeof cadence | false;
}): {
  strategy: typeof strategy;
  forwardFetch: () => Effect.Effect<EntityType<Item>[]>;
  cadence?: typeof cadence | false;
} => ({
  strategy,
  forwardFetch: vi.fn(() => Effect.succeed([] as EntityType<Item>[])),
  ...(over && 'cadence' in over ? { cadence: over.cadence } : {}),
});

const makeFakeNative = (): SyncCollection<Item> & {
  status: string;
  size: number;
  subscriberCount: number;
  update: (key: string, updater: (draft: Item) => void) => any;
} => ({
  status: 'idle',
  size: 0,
  subscriberCount: 1,
  on(_event: any, _cb: any) {
    return () => {};
  },
  update: () => ({ commit: () => Promise.resolve(), rollback: () => {} }),
  values: () => [].values() as any,
});

const loadSubsetOpts = (value: string) => ({
  where: {
    type: 'func' as const,
    name: 'eq' as const,
    args: [
      { type: 'ref' as const, path: ['CadenceTest', 'id'] },
      { type: 'val' as const, value },
    ],
  },
});

const mountAndLoad = (
  built: ReturnType<typeof buildPartitioned<any>>,
  value = 'p1',
) => {
  const native = makeFakeNative();
  const result = built.sync.sync({
    collection: native,
    markReady: () => {},
  } as any) as {
    cleanup: () => void;
    loadSubset: (opts: any) => true;
    unloadSubset: (opts: any) => void;
  };
  result.loadSubset(loadSubsetOpts(value));
  return { result, native };
};

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('cadence fork in buildPartitioned', () => {
  it('forks runCadenceSync per partition when the entry carries cadence', async () => {
    const runMock = vi.mocked(runCadenceSync);
    runMock.mockReturnValue(Effect.never as any);
    runMock.mockClear();

    const built = buildPartitioned(makeTracker(), makeInspector(), {
      schema: schema as any,
      offlineStorage: makeOfflineStorage(),
      partitions: { id: () => partitionEntry({ cadence }) },
    });

    mountAndLoad(built);
    await tick();

    expect(runMock).toHaveBeenCalledOnce();
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cadence,
        partition: { field: 'id', value: 'p1' },
      }),
    );
  });

  it('does NOT fork runCadenceSync when the entry has no cadence', async () => {
    const runMock = vi.mocked(runCadenceSync);
    runMock.mockClear();

    const built = buildPartitioned(makeTracker(), makeInspector(), {
      schema: schema as any,
      offlineStorage: makeOfflineStorage(),
      partitions: { id: () => partitionEntry() },
    });

    mountAndLoad(built);
    await tick();

    expect(runMock).not.toHaveBeenCalled();
  });

  it('does NOT fork when the entry sets cadence: false, even with a default', async () => {
    const runMock = vi.mocked(runCadenceSync);
    runMock.mockClear();

    const built = buildPartitioned(makeTracker(), makeInspector(), {
      schema: schema as any,
      offlineStorage: makeOfflineStorage(),
      defaultCadence: cadence,
      partitions: { id: () => partitionEntry({ cadence: false }) },
    });

    mountAndLoad(built);
    await tick();

    expect(runMock).not.toHaveBeenCalled();
  });

  it('inherits the default cadence when the entry omits it', async () => {
    const runMock = vi.mocked(runCadenceSync);
    runMock.mockReturnValue(Effect.never as any);
    runMock.mockClear();

    const built = buildPartitioned(makeTracker(), makeInspector(), {
      schema: schema as any,
      offlineStorage: makeOfflineStorage(),
      defaultCadence: cadence,
      partitions: { id: () => partitionEntry() },
    });

    mountAndLoad(built);
    await tick();

    expect(runMock).toHaveBeenCalledOnce();
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ config: cadence }),
    );
  });

  it('closes the cadence scope when the partition deactivates', async () => {
    const runMock = vi.mocked(runCadenceSync);
    let scopeFinalizerRan = false;
    runMock.mockReturnValue(
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            scopeFinalizerRan = true;
          }),
        );
        yield* Effect.never;
      }) as any,
    );
    runMock.mockClear();

    const built = buildPartitioned(makeTracker(), makeInspector(), {
      schema: schema as any,
      offlineStorage: makeOfflineStorage(),
      partitions: { id: () => partitionEntry({ cadence }) },
    });

    const { result } = mountAndLoad(built);
    await tick();
    expect(runMock).toHaveBeenCalledOnce();

    result.unloadSubset(loadSubsetOpts('p1'));
    await tick();

    expect(scopeFinalizerRan).toBe(true);
  });
});
