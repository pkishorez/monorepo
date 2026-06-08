import { ESchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

const User = ESchema.make({ name: Schema.String })
  .evolve('v2', { email: Schema.String }, (prev) => ({
    ...prev,
    email: 'unknown@example.com',
  }))
  .evolve('v3', { verified: Schema.Boolean }, (prev) => ({
    ...prev,
    verified: false,
  }))
  .build();

vdescribe(
  'decode folds an old row forward through every migration',
  'a v1 row walks v1 → v2 → v3, filling each gap as it goes',
  () => {
    vtest(
      'a v1 row is migrated to the latest shape on read',
      'each migration runs in order; old data never has to be rewritten',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* User.decode({ _v: 'v1', name: 'Bob' });
            if (
              decoded.name !== 'Bob' ||
              decoded.email !== 'unknown@example.com' ||
              decoded.verified !== false
            ) {
              throw new Error('row did not fold forward to latest');
            }
          }),
        ),
    );

    vtest(
      'encode always writes the latest version',
      'old shapes only exist to be read, never written',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const encoded = yield* User.encode({
              name: 'Carol',
              email: 'c@x.com',
              verified: true,
            });
            if (encoded._v !== 'v3') throw new Error('expected latest _v: v3');
          }),
        ),
    );

    vtest(
      'a middle version folds forward from where it sits',
      'decode starts at the row’s own _v, not always at v1',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* User.decode({
              _v: 'v2',
              name: 'Dee',
              email: 'dee@x.com',
            });
            if (decoded.verified !== false || decoded.email !== 'dee@x.com') {
              throw new Error('v2 row did not fold to v3 correctly');
            }
          }),
        ),
    );
  },
);
