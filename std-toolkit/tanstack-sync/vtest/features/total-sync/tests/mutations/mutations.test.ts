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
  'totalSync writes mutations back and keeps the local mirror consistent',
  'a successful onDelete removes the row locally, matching the server',
  () => {
    vtest(
      'a successful delete mutation removes the row',
      'onDelete runs the effect, then drops the key from the collection',
      async () => {
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
          onDelete: () => Effect.void,
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        config.utils.upsert(
          envelope({ id: '1', title: 'doomed' }, '2024-01-01T00:00:00.000Z'),
        );
        if (!harness.rows.has('1')) throw new Error('row should exist first');

        await config.onDelete!({
          transaction: { mutations: [{ key: '1' }] },
        } as never);

        if (harness.rows.has('1'))
          throw new Error('row should be gone after delete');
      },
    );
  },
);
