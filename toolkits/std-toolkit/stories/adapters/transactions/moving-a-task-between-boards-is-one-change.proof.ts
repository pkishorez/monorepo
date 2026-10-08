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
    'Moving a task between boards lands both writes under one update stamp',
  description:
    'A key cannot change in an update, so a move is an insert on the new board plus a delete on the old one, committed together.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const onWork = yield* task
      .insert({ taskId: 't1', boardId: 'work', title: 'Plan' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert('the task is on work', onWork.meta._d === false);
    return { db, onWork };
  }),
  act: ({ db, onWork }) =>
    Effect.gen(function* () {
      const arrive = yield* task.insertOp({ ...onWork.value, boardId: 'home' });
      const leave = yield* task.deleteOp({ boardId: 'work', taskId: 't1' });
      const [arrived, left] = yield* table.transact([arrive, leave]);
      const home = yield* task.get({ boardId: 'home', taskId: 't1' });
      const work = yield* task.get({ boardId: 'work', taskId: 't1' });
      return { arrived, left, home, work };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ arrived, left, home, work }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the task is live on home', home?.meta._d === false);
      yield* Proof.assert(
        'the old copy is a tombstone on work',
        work?.meta._d === true,
      );
      yield* Proof.assert(
        'both writes carry one update stamp',
        arrived.meta._u === left.meta._u && home?.meta._u === arrived.meta._u,
      );
      yield* Proof.budget('StdTable.transact', '50 millis');
    }),
});
