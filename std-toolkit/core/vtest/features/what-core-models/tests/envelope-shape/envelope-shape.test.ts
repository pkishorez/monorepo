import { Effect, Schema } from 'effect';
import { MetaSchema } from '@std-toolkit/core';
import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'the meta half of the envelope is a fixed, validated shape',
  'core standardizes the bookkeeping that rides alongside every stored value',
  () => {
    vtest(
      'a well-formed meta validates',
      'all four bookkeeping keys present and correctly typed',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const meta = yield* Schema.decodeUnknownEffect(MetaSchema)({
              _v: 'v1',
              _e: 'User',
              _d: false,
              _u: '2024-01-01T00:00:00.000Z',
            });
            if (meta._e !== 'User') throw new Error('lost the entity name');
          }),
        ),
    );

    vtest(
      'a meta missing a key is rejected',
      'the envelope contract is enforced, not merely documented',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const result = yield* Schema.decodeUnknownEffect(MetaSchema)({
              _v: 'v1',
              _e: 'User',
              _d: false,
            }).pipe(Effect.result);
            if (result._tag !== 'Failure') {
              throw new Error('expected a malformed envelope to be rejected');
            }
          }),
        ),
    );
  },
);
