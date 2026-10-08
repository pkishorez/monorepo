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

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title: 'A hard delete removes the task for good',
  description:
    'Unlike delete, hardDelete leaves no tombstone, needs the explicit confirmation, and cannot be restored.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const stored = yield* task
      .insert({ ...key, title: 'Write the plan' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert('the task exists', stored.meta._d === false);
    return { db, stored };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const removed = yield* task.hardDelete(key, 'I KNOW WHAT I AM DOING');
      const after = yield* task.get(key);
      const restore = yield* task.restore(key).pipe(
        Effect.match({
          onFailure: (error) => error.reason._tag,
          onSuccess: () => 'restored',
        }),
      );
      return { removed, after, restore };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ after, restore }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'nothing is left to read, not even a tombstone',
        after === null,
      );
      yield* Proof.assert(
        'restore has nothing to bring back',
        restore === 'NoItemToUpdate',
      );
    }),
});
