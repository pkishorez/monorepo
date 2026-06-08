import { Effect, Schema } from 'effect';
import type { SingleEntityType } from '@std-toolkit/core';
import { SingleEntityESchema } from '@std-toolkit/eschema';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { vdescribe, vtest } from '@monorepo/vtest';

const SettingsSchema = SingleEntityESchema.make('AppSettings', {
  theme: Schema.String,
}).build();

type Settings = typeof SettingsSchema.Type;
type Row = Settings & { _meta?: unknown };

const envelope = (value: Settings): SingleEntityType<Settings> => ({
  value,
  meta: { _v: 'v1', _e: 'AppSettings', _u: new Date().toISOString() },
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
  'singleItem holds exactly one record at a constant key',
  'get loads the one row on mount; singleResult marks it a single value',
  () => {
    vtest(
      'the config is flagged singleResult',
      'TanStack treats the collection as one value, not a list',
      () => {
        const config = createStdSync().singleItem({
          schema: SettingsSchema,
          get: () => Effect.succeed(envelope({ theme: 'dark' })),
        });
        if (config.singleResult !== true)
          throw new Error('expected singleResult');
      },
    );

    vtest(
      'getKey ignores its argument and returns the schema name',
      'there is only ever one row, always at the same key',
      () => {
        const config = createStdSync().singleItem({
          schema: SettingsSchema,
          get: () => Effect.succeed(envelope({ theme: 'dark' })),
        });
        if (config.getKey({ theme: 'x' } as never) !== 'AppSettings')
          throw new Error('getKey should return the schema name');
      },
    );

    vtest(
      'mount runs get and writes the one row',
      'the record get returns lands in the collection at the constant key',
      async () => {
        const config = createStdSync().singleItem({
          schema: SettingsSchema,
          get: () => Effect.succeed(envelope({ theme: 'solarized' })),
        });
        const harness = makeHarness(config.getKey);
        config.sync.sync(harness.params as never);
        await harness.ready;

        if (harness.rows.get('AppSettings')?.theme !== 'solarized')
          throw new Error('the single row should be loaded from get');
      },
    );
  },
);
