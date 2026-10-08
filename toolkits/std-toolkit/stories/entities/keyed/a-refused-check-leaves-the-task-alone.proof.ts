import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title: 'An update whose check refuses the current value writes nothing',
  description:
    'A `check` judges the value read at write time; a refusal fails with CheckRefused and the stored task keeps its update stamp.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const done = yield* task
      .insert({ ...key, title: 'Write the plan', status: 'done' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the task is already done',
      done.value.status === 'done',
    );
    return { db, done };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      // Renaming is only allowed while the task is open.
      const reason = yield* task
        .getAndUpdate(
          key,
          { title: 'Renamed' },
          { check: (current) => current.status === 'open' },
        )
        .pipe(
          Effect.match({
            onFailure: (error) => error.reason._tag,
            onSuccess: () => 'written',
          }),
        );
      const stored = yield* task.get(key);
      return { reason, stored };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ reason, stored }, { done }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the update fails as CheckRefused',
        reason === 'CheckRefused',
      );
      yield* Proof.assert(
        'the stored task is unchanged',
        stored?.value.title === 'Write the plan' &&
          stored.meta._u === done.meta._u,
      );
    }),
});
