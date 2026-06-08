import { ValueESchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

const Status = ValueESchema.make(Schema.Literals(['draft', 'published']))
  .evolve('v2', Schema.Literals(['draft', 'review', 'published']), (v) => v)
  .build();

vdescribe(
  'a value evolves inside a { _v, value } envelope',
  'encode wraps the value with its version; bare values still decode',
  () => {
    vtest(
      'encode wraps the value in a versioned envelope',
      'a bare value has no place for _v, so it rides in an envelope',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const encoded = yield* Status.encode('review');
            if (encoded._v !== 'v2' || encoded.value !== 'review') {
              throw new Error('expected { _v: v2, value: review }');
            }
          }),
        ),
    );

    vtest(
      'a bare legacy value decodes as the earliest version',
      'adoption stays non-breaking for values, just like objects',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* Status.decode('draft');
            if (decoded !== 'draft') {
              throw new Error('bare value did not decode through the chain');
            }
          }),
        ),
    );
  },
);
