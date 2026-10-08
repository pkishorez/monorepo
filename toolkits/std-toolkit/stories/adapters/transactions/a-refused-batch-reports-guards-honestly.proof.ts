import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title:
    'When a batch is refused, a guard that never held is not reported as passed',
  description:
    "`passed` means the op's condition held. A guard whose `_u` already moved never held, so the report must not say it passed.",
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const seen = yield* task
      .insert({ taskId: 't1', boardId: 'work', title: 'Plan' })
      .pipe(Effect.provide(db.layer));
    // Someone else edits t1 after we read it.
    const theirs = yield* task
      .getAndUpdate({ boardId: 'work', taskId: 't1' }, { title: 'Plan it' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      't1 moved after our read',
      theirs.meta._u > seen.meta._u,
    );
    return { db, seen };
  }),
  act: ({ db, seen }) =>
    Effect.gen(function* () {
      const guard = yield* task.unchangedOp(seen);
      // t9 does not exist: this op refuses before anything is submitted.
      const finish = yield* task.getAndUpdateOp(
        { boardId: 'work', taskId: 't9' },
        { title: 'Done' },
      );
      const statuses = yield* table.transact([guard, finish]).pipe(
        Effect.match({
          onFailure: (error) =>
            error.reason._tag === 'TransactFailed'
              ? error.reason.operations.map(({ status }) => status)
              : [error.reason._tag],
          onSuccess: () => null,
        }),
      );
      return { statuses };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ statuses }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the batch failed', statuses !== null);
      yield* Proof.assert(
        'the missing task is reported missing',
        statuses?.[1] === 'missing',
      );
      yield* Proof.assert(
        'the stale guard is reported stale or not-evaluated, never passed',
        statuses?.[0] === 'stale' || statuses?.[0] === 'not-evaluated',
      );
    }),
});
