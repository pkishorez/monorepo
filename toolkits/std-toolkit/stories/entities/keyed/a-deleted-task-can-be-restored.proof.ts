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
  title: 'A deleted task stays readable as a tombstone until it is restored',
  description:
    'Deletion is sync data: get and query return tombstones unless asked to exclude them, and restore brings the task back.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const live = yield* task
      .insert({ ...key, title: 'Write the plan' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert('the task starts live', live.meta._d === false);
    return { db, live };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const deleted = yield* task.delete(key);
      const tombstone = yield* task.get(key);
      const hidden = yield* task.get(key, { excludeDeleted: true });
      const listed = yield* task.query('primary', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      const listedLive = yield* task.query(
        'primary',
        { pk: { boardId: 'work' }, '>=': null },
        { excludeDeleted: true },
      );
      const restored = yield* task.restore(key);
      return {
        deleted,
        tombstone,
        hidden,
        listed: listed.items.length,
        listedLive: listedLive.items.length,
        restored,
      };
    }).pipe(Effect.provide(db.layer)),
  verify: (output) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'delete returns the tombstone',
        output.deleted.meta._d === true,
      );
      yield* Proof.assert(
        'get returns the tombstone with its value',
        output.tombstone?.meta._d === true &&
          output.tombstone.value.title === 'Write the plan',
      );
      yield* Proof.assert(
        'excludeDeleted hides it from get',
        output.hidden === null,
      );
      yield* Proof.assert(
        'query lists it by default and hides it with excludeDeleted',
        output.listed === 1 && output.listedLive === 0,
      );
      yield* Proof.assert(
        'restore brings the same task back live',
        output.restored.meta._d === false &&
          output.restored.value.title === 'Write the plan',
      );
    }),
});
