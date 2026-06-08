import { Effect, Schema } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { EntityESchema } from '@std-toolkit/eschema';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { vdescribe, vtest } from '@monorepo/vtest';

const TaskSchema = EntityESchema.make('Task', 'id', {
  title: Schema.String,
}).build();

type Task = typeof TaskSchema.Type;
type Row = Task & { _meta?: unknown };

const envelope = (
  value: Task,
  updated: string,
  deleted = false,
): EntityType<Task> => ({
  value,
  meta: { _v: 'v1', _e: TaskSchema.name, _d: deleted, _u: updated },
});

const makeHarness = (getKey: (item: Row) => string) => {
  const rows = new Map<string, Row>();
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
    write: (m: { type: string; key?: string; value?: Row }) => {
      if (m.type === 'delete') {
        rows.delete(m.key!);
        return;
      }
      rows.set(getKey(m.value!), m.value!);
    },
    commit: () => {},
    markReady: ready,
    truncate: () => rows.clear(),
  };
  return { params, ready: readyPromise, rows };
};

const broadcast = (values: EntityType<Task>[]) => ({
  _tag: '@std-toolkit/broadcast',
  values,
});

vdescribe(
  'registry.process routes broadcasts to the owning collection by _e',
  'one inbound message fans out; the envelope still decides the write',
  () => {
    vtest(
      'a broadcast envelope is upserted into the matching collection',
      'process matches on _e and lands the record in that collection',
      async () => {
        const std = createStdSync();
        const config = std.totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        const registry = std.registry();
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        registry.process(
          broadcast([
            envelope({ id: '1', title: 'pushed' }, '2024-01-02T00:00:00.000Z'),
          ]),
        );

        if (harness.rows.get('1')?.title !== 'pushed')
          throw new Error('broadcast should be routed into the collection');
      },
    );

    vtest(
      'a stale tombstone broadcast is ignored',
      'a delete older than the live row cannot wipe out a revived record',
      async () => {
        const std = createStdSync();
        const config = std.totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        const registry = std.registry();
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        registry.process(
          broadcast([
            envelope({ id: '1', title: 'current' }, '2024-01-03T00:00:00.000Z'),
          ]),
        );
        registry.process(
          broadcast([
            envelope(
              { id: '1', title: 'stale delete' },
              '2024-01-02T00:00:00.000Z',
              true,
            ),
          ]),
        );
        if (!harness.rows.has('1'))
          throw new Error('stale tombstone should not delete the live row');

        registry.process(
          broadcast([
            envelope(
              { id: '1', title: 'fresh delete' },
              '2024-01-04T00:00:00.000Z',
              true,
            ),
          ]),
        );
        if (harness.rows.has('1'))
          throw new Error('fresh tombstone should delete the row');
      },
    );
  },
);
