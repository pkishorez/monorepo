import { Effect, Schema } from 'effect';
import { SingleEntityESchema } from '@std-toolkit/eschema';
import { SingleEntitySchema, SingleEntityMetaSchema } from '@std-toolkit/core';
import { vdescribe, vtest } from '@monorepo/vtest';

const Settings = SingleEntityESchema.make('Settings', {
  locale: Schema.String,
}).build();

vdescribe(
  'a single entity drops _d: singletons are present or absent, not deleted',
  'SingleEntitySchema pairs a value with the three-key singleton meta',
  () => {
    vtest(
      'a singleton record decodes with no delete flag',
      'three keys only: _v, _e, _u',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const StoredSettings = SingleEntitySchema(Settings);
            const row = yield* Schema.decodeUnknownEffect(StoredSettings)({
              value: { locale: 'en' },
              meta: { _v: 'v1', _e: 'Settings', _u: '2024-01-01' },
            });
            if (row.value.locale !== 'en') throw new Error('lost value');
            if ('_d' in row.meta) throw new Error('singleton meta has no _d');
          }),
        ),
    );

    vtest(
      'the singleton meta itself has no place for _d',
      'soft-delete is meaningless for a singleton, so the key is omitted',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const meta = yield* Schema.decodeUnknownEffect(
              SingleEntityMetaSchema,
            )({ _v: 'v1', _e: 'Settings', _u: '2024-01-01' });
            if ('_d' in meta)
              throw new Error('expected no _d on singleton meta');
          }),
        ),
    );
  },
);
