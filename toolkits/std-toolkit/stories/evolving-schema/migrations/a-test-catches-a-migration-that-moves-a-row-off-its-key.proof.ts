import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';

// Board ids became lowercase in v2, and the migration lowercased old ones too.
// Every old task still decodes, but under a partition key it was never saved at.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { done: Schema.Boolean }, (v1) => ({
    ...v1,
    boardId: v1.boardId.toLowerCase(),
    done: false,
  }))
  .build();

const outcome = (check: Promise<void>) =>
  Effect.promise(() =>
    check.then(
      () => ({ failed: false, message: '' }),
      (error: Error) => ({ failed: true, message: error.message }),
    ),
  );

export default Proof.make({
  title: 'A test catches a migration that moves an old row off its key',
  description:
    'A row is stored under keys read from its value. The table test names each entity’s partition-key paths as `unchanged`, so a migration that rewrites one fails before `get` and `query` silently stop finding the row.',
  prepare: outcome(expectUpgradable(Task)).pipe(
    Effect.tap(({ failed }) =>
      Proof.assert(
        'without its keys named, the migration looks fine: every row decodes',
        !failed,
      ),
    ),
  ),
  act: () => outcome(expectUpgradable(Task, { unchanged: ['boardId'] })),
  verify: ({ failed, message }) =>
    Effect.gen(function* () {
      yield* Proof.assert('with the partition key named, it fails', failed);
      yield* Proof.assert(
        'it names the version and the key that moved',
        message.includes('Task v1 → v2: unchanged failed: boardId changed'),
      );
    }),
});
