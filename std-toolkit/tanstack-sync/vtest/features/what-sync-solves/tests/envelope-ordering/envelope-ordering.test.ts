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

vdescribe(
  'The envelope, not arrival order, decides what the collection holds',
  'newer _u wins, stale _u is ignored, _d:true deletes — sync converges',
  () => {
    vtest(
      'a newer _u overwrites an older one',
      'updates are ordered by the monotonic _u key, not by when they arrive',
      async () => {
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        config.utils.upsert(
          envelope({ id: '1', title: 'old' }, '2024-01-01T00:00:00.000Z'),
        );
        config.utils.upsert(
          envelope({ id: '1', title: 'new' }, '2024-01-02T00:00:00.000Z'),
        );
        if (harness.rows.get('1')?.title !== 'new')
          throw new Error('newer _u should win');
      },
    );

    vtest(
      'a stale _u is dropped',
      'an envelope older than the row it targets is ignored entirely',
      async () => {
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        config.utils.upsert(
          envelope({ id: '1', title: 'current' }, '2024-01-03T00:00:00.000Z'),
        );
        config.utils.upsert(
          envelope({ id: '1', title: 'late' }, '2024-01-01T00:00:00.000Z'),
        );
        if (harness.rows.get('1')?.title !== 'current')
          throw new Error('stale _u should be ignored');
      },
    );

    vtest(
      'a _d:true envelope removes the row',
      'a fresh tombstone deletes by key; the collection converges to absent',
      async () => {
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        config.utils.upsert(
          envelope({ id: '1', title: 'live' }, '2024-01-01T00:00:00.000Z'),
        );
        config.utils.upsert(
          envelope(
            { id: '1', title: 'gone' },
            '2024-01-02T00:00:00.000Z',
            true,
          ),
        );
        if (harness.rows.has('1'))
          throw new Error('fresh tombstone should delete the row');
      },
    );
  },
);
