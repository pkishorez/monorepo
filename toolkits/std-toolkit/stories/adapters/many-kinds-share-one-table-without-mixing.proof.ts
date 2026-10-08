import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Board = EntityESchema.make('Board', 'boardId', {
  name: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// Both live under the board's partition key: one item collection per board.
const table = StdTable.make('board').primary('pk', 'sk').build();
const board = table
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title: 'Boards and tasks share one table and one partition without mixing',
  description:
    'Each entity reads only its own rows, even when a board and its tasks share a partition key and an id.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    yield* board
      .insert({ boardId: 'work', name: 'Work' })
      .pipe(Effect.provide(db.layer));
    yield* Effect.forEach(['t1', 't2'], (taskId) =>
      task.insert({ taskId, boardId: 'work', title: `Task ${taskId}` }),
    ).pipe(Effect.provide(db.layer));
    // A task whose id happens to equal the board's id.
    yield* task
      .insert({
        taskId: 'work',
        boardId: 'work',
        title: 'Same id as the board',
      })
      .pipe(Effect.provide(db.layer));
    const rows = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert('four rows sit in one table', rows.length === 4);
    return {
      db,
      rows: rows.map(({ pk, sk, meta }) => ({ pk, sk, entity: meta._e })),
    };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const tasks = yield* task.query('primary', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      const boards = yield* board.query('primary', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      const theBoard = yield* board.get({ boardId: 'work' });
      const theTask = yield* task.get({ boardId: 'work', taskId: 'work' });
      return {
        tasks: tasks.items.map(({ value }) => value.taskId),
        boards: boards.items.map(({ value }) => value.name),
        theBoard: theBoard?.value ?? null,
        theTask: theTask?.value ?? null,
      };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ tasks, boards, theBoard, theTask }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the task query sees only tasks',
        tasks.join() === 't1,t2,work',
      );
      yield* Proof.assert(
        'the board query sees only the board',
        boards.join() === 'Work',
      );
      yield* Proof.assert(
        'a board and a task with the same id do not collide',
        theBoard?.name === 'Work' && theTask?.title === 'Same id as the board',
      );
    }),
});
