import { ESchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

const User = ESchema.make({
  name: Schema.String,
  age: Schema.Number,
}).build();

vdescribe(
  'a single-version schema round-trips with a version stamp',
  'encode writes the latest version and stamps _v; decode reads it back',
  () => {
    vtest(
      'encode stamps the latest version onto the value',
      'the _v stamp is what a future decode uses to pick a version',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const encoded = yield* User.encode({ name: 'Ada', age: 36 });
            if (encoded._v !== 'v1') throw new Error('expected _v: v1');
            if (encoded.name !== 'Ada' || encoded.age !== 36) {
              throw new Error('fields were altered on encode');
            }
          }),
        ),
    );

    vtest(
      'decode reads a stamped row back to its fields',
      'decode is the inverse of encode for a single-version schema',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* User.decode({
              _v: 'v1',
              name: 'Ada',
              age: 36,
            });
            if (decoded.name !== 'Ada' || decoded.age !== 36) {
              throw new Error('round-trip did not preserve fields');
            }
          }),
        ),
    );
  },
);
