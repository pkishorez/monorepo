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
    'Inserting a task that already exists is refused and the first one survives',
  description: 'An insert never overwrites; changing a task is an update.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const first = yield* task
      .insert({ taskId: 't1', boardId: 'work', title: 'Write the plan' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the first task is stored',
      first.value.title === 'Write the plan',
    );
    return { db, first };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const reason = yield* task
        .insert({ taskId: 't1', boardId: 'work', title: 'Overwritten' })
        .pipe(
          Effect.match({
            onFailure: (error) => error.reason._tag,
            onSuccess: () => 'inserted',
          }),
        );
      const stored = yield* task.get({ boardId: 'work', taskId: 't1' });
      return { reason, stored };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ reason, stored }, { first }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the second insert fails as ItemAlreadyExists',
        reason === 'ItemAlreadyExists',
      );
      yield* Proof.assert(
        'the stored task is the first one, untouched',
        stored?.value.title === 'Write the plan' &&
          stored.meta._u === first.meta._u,
      );
    }),
});
