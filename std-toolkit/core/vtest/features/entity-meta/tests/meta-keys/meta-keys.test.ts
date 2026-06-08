import { Effect, Schema } from 'effect';
import { MetaSchema } from '@std-toolkit/core';
import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'MetaSchema carries _v, _e, _d, _u with strict types',
  'the four keys are required and typed so downstream code never coerces',
  () => {
    vtest(
      'the soft-delete flag is a real boolean',
      '_d distinguishes a flagged-deleted row from a live one',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const meta = yield* Schema.decodeUnknownEffect(MetaSchema)({
              _v: 'v2',
              _e: 'Order',
              _d: true,
              _u: '2024-06-01T12:00:00.000Z',
            });
            if (meta._d !== true) throw new Error('expected _d: true');
          }),
        ),
    );

    vtest(
      'a stringified boolean for _d is rejected',
      'types are enforced, so "false" never sneaks through as truthy',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const result = yield* Schema.decodeUnknownEffect(MetaSchema)({
              _v: 'v1',
              _e: 'Order',
              _d: 'false',
              _u: '2024-06-01T12:00:00.000Z',
            }).pipe(Effect.result);
            if (result._tag !== 'Failure') {
              throw new Error('expected a string _d to be rejected');
            }
          }),
        ),
    );
  },
);
