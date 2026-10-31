import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Board = EntityESchema.make('Board', 'boardId', {
  name: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// Both live under the board's partition key: one item collection per table.Board.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Board, (e) => e.primary({ pk: ['boardId'] }))
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();

export default Proof.make({
  title: 'Boards and tasks share one table and one partition without mixing',
  description:
    'Each entity reads only its own rows, even when a board and its tasks share a partition key and an id.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    yield* table.Board.insert({ boardId: 'work', name: 'Work' }).pipe(
      Effect.provide(db.layer),
    );
    yield* Effect.forEach(['t1', 't2'], (taskId) =>
      table.Task.insert({ taskId, boardId: 'work', title: `Task ${taskId}` }),
    ).pipe(Effect.provide(db.layer));
    // A task whose id happens to equal the board's id.
    yield* table.Task.insert({
      taskId: 'work',
      boardId: 'work',
      title: 'Same id as the board',
    }).pipe(Effect.provide(db.layer));
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
      const tasks = yield* table.Task.query('primary', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      const boards = yield* table.Board.query('primary', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      const theBoard = yield* table.Board.get({ boardId: 'work' });
      const theTask = yield* table.Task.get({
        boardId: 'work',
        taskId: 'work',
      });
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
