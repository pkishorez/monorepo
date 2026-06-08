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

const envelope = (value: Task, updated: string): EntityType<Task> => ({
  value,
  meta: { _v: 'v1', _e: TaskSchema.name, _d: false, _u: updated },
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

vdescribe(
  'totalSync fills a collection from its query on mount',
  'the records query returns are written into the collection, keyed and ordered',
  () => {
    vtest(
      'records returned by query land in the collection',
      'mount runs query once and writes each envelope, keyed by getKey',
      async () => {
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () =>
            Effect.succeed([
              envelope({ id: '1', title: 'alpha' }, '2024-01-01T00:00:00.000Z'),
              envelope({ id: '2', title: 'beta' }, '2024-01-02T00:00:00.000Z'),
            ]),
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        if (harness.rows.get('1')?.title !== 'alpha')
          throw new Error('expected task 1 to be loaded');
        if (harness.rows.get('2')?.title !== 'beta')
          throw new Error('expected task 2 to be loaded');
      },
    );

    vtest(
      'getKey reads the schema id field',
      'the collection keys rows by the entity schema id field',
      () => {
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        const key = config.getKey({
          id: '42',
          title: 'x',
        } as never);
        if (key !== '42') throw new Error('getKey should return the id field');
      },
    );
  },
);
