import { Effect, Schema } from 'effect';
import { BroadcastSchema } from '@std-toolkit/core';
import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'BroadcastSchema is a tagged batch of { meta, value } envelopes',
  'one message can carry many entity kinds; the receiver reads meta._e',
  () => {
    vtest(
      'a tagged batch of mixed entities decodes',
      'each value is Unknown but every meta is the four-key envelope',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const batch = yield* Schema.decodeUnknownEffect(BroadcastSchema)({
              _tag: '@std-toolkit/broadcast',
              values: [
                {
                  meta: { _v: 'v1', _e: 'User', _d: false, _u: '2024-01-01' },
                  value: { id: 'u1', name: 'Ada' },
                },
                {
                  meta: { _v: 'v1', _e: 'Order', _d: true, _u: '2024-01-02' },
                  value: { id: 'o9', total: 42 },
                },
              ],
            });
            if (batch.values.length !== 2) throw new Error('lost a record');
            if (batch.values[1]!.meta._d !== true) {
              throw new Error(
                'a broadcast announces deletes as flagged records',
              );
            }
          }),
        ),
    );

    vtest(
      'a batch with the wrong tag is rejected',
      'the fixed _tag literal is how a receiver recognizes a broadcast',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const result = yield* Schema.decodeUnknownEffect(BroadcastSchema)({
              _tag: 'something-else',
              values: [],
            }).pipe(Effect.result);
            if (result._tag !== 'Failure') {
              throw new Error('expected the wrong tag to be rejected');
            }
          }),
        ),
    );
  },
);
