import { Effect, Schema } from 'effect';
import { it, describe, expect } from 'vitest';
import { vi } from 'vitest';
import type { EntityType } from '../../../../core/index.js';
import type { SyncCollection } from '../../../workers/cadence-repair/index.js';

vi.mock('../../../workers/cadence-repair/index.js', () => ({
  runCadenceSync: vi.fn(() => Effect.never),
}));

import { buildPartitioned } from '../index.js';
import { runCadenceSync } from '../../../workers/cadence-repair/index.js';
import { makeTracker } from '../../../runtime/sync-registry/index.js';
import { memoryOfflineStorage } from '../../../persistence/offline-storage/memory-offline-storage.js';

type Item = { id: string };

const makeOfflineStorage = () => memoryOfflineStorage();

const schema = {
  name: 'CadenceTest',
  idField: 'id' as const,
  schema: Schema.Struct({ id: Schema.String }),
  parse: (v: unknown) => v as Item,
  Type: undefined as unknown as Item,
};

const cadence = { window: 5000, readiness: 10000, pollDelay: 2000 };
const report = () => Effect.void;

const strategy = {
  name: 'test',
  state: {
    schema: Schema.Struct({ cursor: Schema.NullOr(Schema.String) }),
    empty: { cursor: null },
  },
  run: () => Effect.never,
};

const partitionEntry = (repair?: { cadence?: typeof cadence }) => ({
  strategy,
  ...(repair
    ? {
        repair: {
          fetchFrom: vi.fn(() => Effect.succeed([] as EntityType<Item>[])),
          ...repair,
        },
      }
    : {}),
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

describe('TanStack Sync', () => {
  describe('Partitioned', () => {
    describe('Cadence fork', () => {
      it('forks cadence repair when the repair capability carries cadence', async () => {
        const runMock = vi.mocked(runCadenceSync);
        runMock.mockReturnValue(Effect.never as any);
        runMock.mockClear();

        const built = buildPartitioned(makeTracker(), {
          schema: schema as any,
          offlineStorage: makeOfflineStorage(),
          report,
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

      it('does not fork repair when the entry has no repair capability', async () => {
        const runMock = vi.mocked(runCadenceSync);
        runMock.mockClear();

        const built = buildPartitioned(makeTracker(), {
          schema: schema as any,
          offlineStorage: makeOfflineStorage(),
          report,
          partitions: { id: () => partitionEntry() },
        });

        mountAndLoad(built);
        await tick();

        expect(runMock).not.toHaveBeenCalled();
      });

      it('does not apply the default cadence without an explicit repair capability', async () => {
        const runMock = vi.mocked(runCadenceSync);
        runMock.mockClear();

        const built = buildPartitioned(makeTracker(), {
          schema: schema as any,
          offlineStorage: makeOfflineStorage(),
          report,
          defaultCadence: cadence,
          partitions: { id: () => partitionEntry() },
        });

        mountAndLoad(built);
        await tick();

        expect(runMock).not.toHaveBeenCalled();
      });

      it('inherits the default cadence when repair omits its policy', async () => {
        const runMock = vi.mocked(runCadenceSync);
        runMock.mockReturnValue(Effect.never as any);
        runMock.mockClear();

        const built = buildPartitioned(makeTracker(), {
          schema: schema as any,
          offlineStorage: makeOfflineStorage(),
          report,
          defaultCadence: cadence,
          partitions: { id: () => partitionEntry({}) },
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

        const built = buildPartitioned(makeTracker(), {
          schema: schema as any,
          offlineStorage: makeOfflineStorage(),
          report,
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
  });
});
