import { ESchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

const User = ESchema.make({
  name: Schema.String,
  age: Schema.Number,
})
  .evolve('v2', { email: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    email: null,
  }))
  .build();

vdescribe(
  'a row with no _v is treated as v1',
  'adoption is non-breaking: legacy rows fold forward from v1',
  () => {
    vtest(
      'an unstamped legacy row decodes as v1 and folds forward',
      'no _v means v1, so existing data needs no rewrite',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* User.decode({ name: 'Ada', age: 36 });
            if (decoded.name !== 'Ada' || decoded.email !== null) {
              throw new Error('unstamped row did not fold from v1');
            }
          }),
        ),
    );

    vtest(
      'a row that does not match v1 fails loudly',
      'v1 must mirror real historical data; decode never guesses',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const result = yield* Effect.exit(User.decode({ name: 'Ada' }));
            if (result._tag !== 'Failure') {
              throw new Error('expected decode to fail on a non-v1 shape');
            }
          }),
        ),
    );
  },
);
