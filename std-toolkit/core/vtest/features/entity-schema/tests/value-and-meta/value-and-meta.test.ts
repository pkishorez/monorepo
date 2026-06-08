import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { EntitySchema } from '@std-toolkit/core';
import { vdescribe, vtest } from '@monorepo/vtest';

const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
}).build();

vdescribe(
  'EntitySchema wraps an eschema value into a { value, meta } codec',
  'the stored record validates as one unit: domain data plus its bookkeeping',
  () => {
    vtest(
      'a well-formed record decodes both halves',
      'value keeps the eschema type; meta is the four-key envelope',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const StoredUser = EntitySchema(User);
            const row = yield* Schema.decodeUnknownEffect(StoredUser)({
              value: { id: 'u1', name: 'Ada' },
              meta: { _v: 'v1', _e: 'User', _d: false, _u: '2024-01-01' },
            });
            if (row.value.name !== 'Ada') throw new Error('lost value field');
            if (row.meta._e !== 'User') throw new Error('lost meta field');
          }),
        ),
    );

    vtest(
      'a valid value with malformed meta fails as a unit',
      'a record is valid only if both data and bookkeeping are',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const StoredUser = EntitySchema(User);
            const result = yield* Schema.decodeUnknownEffect(StoredUser)({
              value: { id: 'u1', name: 'Ada' },
              meta: { _v: 'v1', _e: 'User', _u: '2024-01-01' },
            }).pipe(Effect.result);
            if (result._tag !== 'Failure') {
              throw new Error('expected malformed meta to fail the record');
            }
          }),
        ),
    );
  },
);
