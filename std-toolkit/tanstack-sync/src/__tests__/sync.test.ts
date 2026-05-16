import { describe, expect, it } from 'vitest';
import { Effect, Schema } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { EntityESchema } from '@std-toolkit/eschema';
import { createStdSync } from '../index.js';
import type { CollectionItem } from '../types.js';

const TestSchema = EntityESchema.make('TestEntity', 'id', {
  name: Schema.String,
  channelId: Schema.String,
}).build();

type TestItem = typeof TestSchema.Type;
type TestCollectionItem = CollectionItem<TestItem>;

const entity = (
  value: TestItem,
  updated: string,
  deleted = false,
): EntityType<TestItem> => ({
  value,
  meta: {
    _v: 'v1',
    _e: TestSchema.name,
    _d: deleted,
    _u: updated,
  },
});

const makeHarness = (
  getKey: (item: TestCollectionItem) => string,
  initial: TestCollectionItem[] = [],
) => {
  const rows = new Map(initial.map((item) => [getKey(item), item]));
  const writes: unknown[] = [];
  let ready!: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    ready = resolve;
  });

  const params = {
    collection: {
      get: (key: string) => rows.get(key),
      has: (key: string) => rows.has(key),
      getKeyFromItem: getKey,
      on: () => () => {},
    },
    begin: () => {},
    write: (message: {
      type: 'insert' | 'update' | 'delete';
      key?: string;
      value?: TestCollectionItem;
    }) => {
      writes.push(message);
      if (message.type === 'delete') {
        rows.delete(message.key!);
        return;
      }

      const value = message.value!;
      rows.set(getKey(value), value);
    },
    commit: () => {},
    markReady: ready,
    truncate: () => rows.clear(),
  };

  return { params, ready: readyPromise, rows, writes };
};

describe('tanstack sync configs', () => {
  it('writes inserts, updates, tombstone deletes, and ignores stale entities', async () => {
    const config = createStdSync().totalSync({
      schema: TestSchema,
      query: () => Effect.succeed([]),
    });
    const harness = makeHarness(config.getKey);

    config.sync.sync(harness.params as never);
    await harness.ready;

    config.utils.upsert(
      entity(
        { id: '1', name: 'first', channelId: 'a' },
        '2024-01-02T00:00:00.000Z',
      ),
    );
    expect(harness.rows.get('1')?.name).toBe('first');
    expect(harness.writes.at(-1)).toMatchObject({ type: 'insert' });

    config.utils.upsert(
      entity(
        { id: '1', name: 'newer', channelId: 'a' },
        '2024-01-03T00:00:00.000Z',
      ),
    );
    expect(harness.rows.get('1')?.name).toBe('newer');
    expect(harness.writes.at(-1)).toMatchObject({ type: 'update' });

    config.utils.upsert(
      entity(
        { id: '1', name: 'older', channelId: 'a' },
        '2024-01-01T00:00:00.000Z',
      ),
    );
    expect(harness.rows.get('1')?.name).toBe('newer');

    config.utils.upsert(
      entity(
        { id: '1', name: 'deleted', channelId: 'a' },
        '2024-01-04T00:00:00.000Z',
        true,
      ),
    );
    expect(harness.rows.has('1')).toBe(false);
    expect(harness.writes.at(-1)).toMatchObject({ type: 'delete', key: '1' });
  });

  it('routes broadcast tombstones through metadata-aware collection writes', async () => {
    const std = createStdSync();
    const config = std.totalSync({
      schema: TestSchema,
      query: () => Effect.succeed([]),
    });
    const registry = std.registry();
    const harness = makeHarness(config.getKey);

    config.sync.sync(harness.params as never);
    await harness.ready;

    registry.process({
      _tag: '@std-toolkit/broadcast',
      values: [
        entity(
          { id: '1', name: 'current', channelId: 'a' },
          '2024-01-03T00:00:00.000Z',
        ),
      ],
    });
    registry.process({
      _tag: '@std-toolkit/broadcast',
      values: [
        entity(
          { id: '1', name: 'stale delete', channelId: 'a' },
          '2024-01-02T00:00:00.000Z',
          true,
        ),
      ],
    });
    expect(harness.rows.has('1')).toBe(true);

    registry.process({
      _tag: '@std-toolkit/broadcast',
      values: [
        entity(
          { id: '1', name: 'fresh delete', channelId: 'a' },
          '2024-01-04T00:00:00.000Z',
          true,
        ),
      ],
    });
    expect(harness.rows.has('1')).toBe(false);
  });

  it('removes rows after a successful delete mutation', async () => {
    const config = createStdSync().totalSync({
      schema: TestSchema,
      query: () => Effect.succeed([]),
      onDelete: () => Effect.void,
    });
    const harness = makeHarness(config.getKey);

    config.sync.sync(harness.params as never);
    await harness.ready;

    config.utils.upsert(
      entity(
        { id: '1', name: 'current', channelId: 'a' },
        '2024-01-03T00:00:00.000Z',
      ),
    );
    await config.onDelete!({
      transaction: { mutations: [{ key: '1' }] },
    } as never);

    expect(harness.rows.has('1')).toBe(false);
  });

  it('hydrates known on-demand partition caches on resync', async () => {
    let queryCount = 0;
    const config = createStdSync().onDemand({
      schema: TestSchema,
      queries: {
        channelId: {
          query: () => {
            queryCount += 1;
            return Effect.succeed(
              queryCount === 1
                ? [
                    entity(
                      { id: '1', name: 'cached', channelId: 'a' },
                      '2024-01-03T00:00:00.000Z',
                    ),
                  ]
                : [],
            );
          },
        },
      },
    });

    await Effect.runPromise(config.utils.fetchMore({ channelId: 'a' }));

    const harness = makeHarness(config.getKey);
    config.sync.sync(harness.params as never);
    await harness.ready;

    expect(harness.rows.get('1')?.name).toBe('cached');
    expect(queryCount).toBe(1);
  });
});
