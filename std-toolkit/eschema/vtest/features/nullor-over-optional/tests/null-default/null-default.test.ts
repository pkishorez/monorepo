import { ESchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

const Profile = ESchema.make({ name: Schema.String })
  .evolve('v2', { bio: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    bio: null,
  }))
  .build();

vdescribe(
  'a new field is always present, defaulting to null',
  'NullOr keeps the field definite for old and new rows alike',
  () => {
    vtest(
      'an old row gets the field as an explicit null',
      'no absent keys: "no value yet" is represented as null',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* Profile.decode({ _v: 'v1', name: 'Ada' });
            if (!('bio' in decoded) || decoded.bio !== null) {
              throw new Error('bio should be present and null');
            }
          }),
        ),
    );

    vtest(
      'a new row carries a real value in the same field',
      'the field is stable: same shape whether the value is null or set',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const encoded = yield* Profile.encode({
              name: 'Ada',
              bio: 'mathematician',
            });
            if (encoded.bio !== 'mathematician' || encoded._v !== 'v2') {
              throw new Error('expected a v2 row with a set bio');
            }
          }),
        ),
    );
  },
);
