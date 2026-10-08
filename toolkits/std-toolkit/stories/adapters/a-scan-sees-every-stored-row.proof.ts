import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema, ESchema } from '@kstackz/std-toolkit/eschema';

const Board = EntityESchema.make('Board', 'boardId', {
  name: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const Settings = ESchema.make('Settings', { theme: Schema.String }).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const board = table
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
const settings = table.singleEntity(Settings).default({ theme: 'light' });

export default Proof.make({
  title: 'A scan sees every stored row of every entity, deleted ones included',
  description:
    'table.scan() streams raw stored items in their encoded form, the way the table holds them.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const deleted = yield* Effect.gen(function* () {
      yield* board.insert({ boardId: 'work', name: 'Work' });
      yield* task.insert({ taskId: 't1', boardId: 'work', title: 'Plan' });
      yield* task.insert({ taskId: 't2', boardId: 'work', title: 'Review' });
      yield* settings.put({ theme: 'dark' });
      return yield* task.delete({ boardId: 'work', taskId: 't2' });
    }).pipe(Effect.provide(db.layer));
    yield* Proof.assert('t2 was deleted', deleted.meta._d === true);
    return { db, deleted };
  }),
  act: ({ db }) =>
    Stream.runCollect(table.scan()).pipe(
      Effect.map((rows) => ({ rows })),
      Effect.provide(db.layer),
    ),
  verify: ({ rows }) =>
    Effect.gen(function* () {
      const kinds = rows.map(({ meta }) => meta._e).sort();
      yield* Proof.assert(
        'every row is there',
        kinds.join() === 'Board,Settings,Task,Task',
      );
      yield* Proof.assert(
        'the deleted task is there as a tombstone',
        rows.some(
          ({ meta, data }) =>
            meta._e === 'Task' &&
            meta._d &&
            (data as { taskId?: string }).taskId === 't2',
        ),
      );
      yield* Proof.assert(
        'each row carries its version stamp',
        rows.every(({ data }) => (data as { _v?: string })._v === 'v1'),
      );
      yield* Proof.budget('StdTable.scan', '100 millis');
    }),
});
