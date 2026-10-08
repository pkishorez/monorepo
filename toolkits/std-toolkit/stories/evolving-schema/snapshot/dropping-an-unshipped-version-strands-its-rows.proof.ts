import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

// While deciding, the app tried a v2 with a due date, then dropped the idea.
const TaskTryingDueDate = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { dueDate: Schema.NullOr(Schema.String) }, (v1) => ({
    ...v1,
    dueDate: null,
  }))
  .build();
const TaskWithoutDueDate = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// Two builds of the app over the same logical table.
const trialTable = StdTable.make('board').primary('pk', 'sk').build();
const trialTask = trialTable
  .entity(TaskTryingDueDate)
  .primary({ pk: ['boardId'] })
  .build();
const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(TaskWithoutDueDate)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title: 'Dropping a version that never shipped strands the rows saved with it',
  description:
    'Nothing freezes a version but an approved snapshot, so a draft is free to drop, but a row stamped with it can no longer be read. Keep drafts on the Memory adapter.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    // The trial build saves a task while v2 exists.
    const saved = yield* trialTask
      .insert({ taskId: 't1', boardId: 'work', title: 'Plan', dueDate: null })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the trial build stored it at v2',
      saved.meta._v === 'v2',
    );
    return { db, saved };
  }),
  act: ({ db }) =>
    task.get({ boardId: 'work', taskId: 't1' }).pipe(
      Effect.provide(db.layer),
      Effect.match({
        onFailure: (error) => ({ read: null, reason: error.reason._tag }),
        onSuccess: (read) => ({ read, reason: null }),
      }),
    ),
  verify: ({ read, reason }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the build without v2 cannot read the row',
        read === null,
      );
      yield* Proof.assert(
        'the read fails as DecodeFailed',
        reason === 'DecodeFailed',
      );
    }),
});
