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

// One table; a task's board fills the partition key and its id the sort key.
const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title: 'A saved task reads back exactly as it was saved',
  description:
    'Insert returns the stored Entity, `{ value, meta }`; get by key returns the same value and update stamp. A key never saved reads as null.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const before = yield* task.get(key).pipe(Effect.provide(db.layer));
    yield* Proof.assert('the board starts empty', before === null);
    return { db, before };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const inserted = yield* task.insert({
        ...key,
        title: 'Write the plan',
        status: 'open',
      });
      const read = yield* task.get(key);
      const missing = yield* task.get({ boardId: 'work', taskId: 'nope' });
      return { inserted, read, missing };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ inserted, read, missing }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the stored task is stamped as a live Task at v1',
        inserted.meta._e === 'Task' &&
          inserted.meta._d === false &&
          inserted.meta._v === 'v1',
      );
      yield* Proof.assert(
        'reading it back gives the same value and update stamp',
        read?.value.title === 'Write the plan' &&
          read.value.status === 'open' &&
          read.meta._u === inserted.meta._u,
      );
      yield* Proof.assert('a key never saved reads as null', missing === null);
      yield* Proof.budget('StdTable.insert', '50 millis');
      yield* Proof.budget('StdTable.get', '50 millis');
    }),
});
