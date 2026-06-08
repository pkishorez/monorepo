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
  'getCursor advances to the newest seen envelope between fetches',
  'first query sees a null cursor; later fetches page from the high-water mark',
  () => {
    vtest(
      'the cursor moves from null to the newest _u',
      'each query reads getCursor; it is null on mount, then the latest row',
      async () => {
        const seen: (string | null)[] = [];
        let page = 0;
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: ({ getCursor }) =>
            Effect.gen(function* () {
              const cursor = yield* getCursor;
              seen.push(cursor?.value.id ?? null);
              page += 1;
              return page === 1
                ? [
                    envelope(
                      { id: '1', title: 'first' },
                      '2024-01-01T00:00:00.000Z',
                    ),
                    envelope(
                      { id: '2', title: 'second' },
                      '2024-01-02T00:00:00.000Z',
                    ),
                  ]
                : [];
            }),
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        await Effect.runPromise(config.utils.fetchMore());

        if (seen[0] !== null)
          throw new Error('first query should see a null cursor');
        if (seen[1] !== '2')
          throw new Error('second query should page from the newest envelope');
      },
    );

    vtest(
      'fetchMore reports how many new rows it wrote',
      'a subsequent page returns its row count so callers can stop at the end',
      async () => {
        let page = 0;
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () => {
            page += 1;
            return Effect.succeed(
              page === 1
                ? []
                : [
                    envelope(
                      { id: '9', title: 'late' },
                      '2024-01-09T00:00:00.000Z',
                    ),
                  ],
            );
          },
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        const count = await Effect.runPromise(config.utils.fetchMore());
        if (count !== 1)
          throw new Error('fetchMore should report one new row written');
      },
    );
  },
);
