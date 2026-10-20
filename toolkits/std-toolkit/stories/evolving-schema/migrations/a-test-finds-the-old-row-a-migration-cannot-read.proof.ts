import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';

// The same migration that forgot a legacy case: it only parses numbers.
const Task = EntityESchema.make('Task', 'taskId', {
  estimate: Schema.String,
})
  .evolve('v2', { estimate: Schema.Finite }, (v1) => {
    const hours = Number(v1.estimate);
    if (Number.isNaN(hours)) throw new Error(`not a number: ${v1.estimate}`);
    return { ...v1, estimate: hours };
  })
  .build();

const Fixed = EntityESchema.make('Task', 'taskId', {
  estimate: Schema.String,
})
  .evolve('v2', { estimate: Schema.NullOr(Schema.Finite) }, (v1) => {
    const hours = Number(v1.estimate);
    return { ...v1, estimate: Number.isFinite(hours) ? hours : null };
  })
  .build();

const outcome = (check: Promise<void>) =>
  Effect.promise(() =>
    check.then(
      () => ({ failed: false, message: '' }),
      (error: Error) => ({ failed: true, message: error.message }),
    ),
  );

export default Proof.make({
  title:
    'A test finds the old row a migration cannot read, before any user does',
  description:
    '`expectUpgradable` generates rows every version could have stored and reads each at the latest version. It names the version that fails and the smallest row that shows it.',
  prepare: outcome(expectUpgradable(Fixed)).pipe(
    Effect.tap(({ failed }) =>
      Proof.assert('a migration that handles every row passes', !failed),
    ),
  ),
  act: () => outcome(expectUpgradable(Task)),
  verify: ({ failed, message }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the forgetful migration is caught', failed);
      yield* Proof.assert(
        'the report names the version and why it failed',
        message.includes('Task v1 → v2: upgrade failed') &&
          message.includes('not a number'),
      );
      yield* Proof.assert(
        'the report shows a stored v1 row that breaks it',
        /stored row: \{.*"_v":"v1"\}/.test(message),
      );
    }),
});
