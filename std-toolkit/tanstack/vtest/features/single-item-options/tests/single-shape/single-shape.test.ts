import { Effect, Schema } from 'effect';
import { SingleEntityESchema } from '@std-toolkit/eschema';
import type { SingleEntityType } from '@std-toolkit/core';
import { stdSingleItemOptions } from '@std-toolkit/tanstack';
import { vdescribe, vtest } from '@monorepo/vtest';

const SettingsSchema = SingleEntityESchema.make('AppSettings', {
  theme: Schema.String,
}).build();

type Settings = typeof SettingsSchema.Type;

const envelope = (value: Settings): SingleEntityType<Settings> => ({
  value,
  meta: { _v: 'v1', _e: 'AppSettings', _u: new Date().toISOString() },
});

const config = () =>
  stdSingleItemOptions({
    schema: SettingsSchema,
    get: () => Effect.succeed(envelope({ theme: 'dark' })),
  });

vdescribe(
  'a single item is a one-row collection',
  'singleResult with a constant key, no paging, no compare or insert',
  () => {
    vtest(
      'the config is flagged singleResult',
      'TanStack treats it as a single value, not a list',
      () => {
        if (config().singleResult !== true)
          throw new Error('expected singleResult');
      },
    );

    vtest(
      'getKey returns the schema name, ignoring its argument',
      'there is only ever one row, always at the same key',
      () => {
        const key = config().getKey({} as never);
        if (key !== 'AppSettings') throw new Error(`got ${key}`);
      },
    );

    vtest(
      'utils has refetch but no fetch or fetchAll',
      'there is nothing to page through — just re-run get',
      () => {
        const utils = config().utils!;
        if (typeof utils.refetch !== 'function')
          throw new Error('refetch missing');
        if ('fetch' in utils) throw new Error('should not have fetch');
        if ('fetchAll' in utils) throw new Error('should not have fetchAll');
      },
    );

    vtest(
      'the config has no compare or onInsert',
      'a single item is replaced, never sorted or inserted into a list',
      () => {
        const c = config();
        if ('compare' in c) throw new Error('should not have compare');
        if ('onInsert' in c) throw new Error('should not have onInsert');
      },
    );
  },
);
