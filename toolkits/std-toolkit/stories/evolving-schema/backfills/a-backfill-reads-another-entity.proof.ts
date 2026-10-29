import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Board = EntityESchema.make('Board', 'boardId', {
  name: Schema.String,
  owner: Schema.String,
}).build();
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
// A task now has its own owner, which starts as its board's owner.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .build();

const lastRelease = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Board, (e) => e.primary())
  .entity(TaskV1, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Board, (e) => e.primary())
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .backfill('task-owner', {
    entity: 'Task',
    to: 'v2',
    run: (task, db) =>
      Effect.gen(function* () {
        const board = yield* db.Board.get({ boardId: task.boardId });
        return { ...task, owner: board?.value.owner ?? 'nobody' };
      }),
  })
  .build();

export default Proof.make({
  title: "A Backfill fills an old task's new field from its board",
  description:
    'A migration sees one row; a Backfill may read every entity on the table, so a value no old row holds can still be found.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(lastRelease, { mode: 'persistent', database });
    yield* Effect.gen(function* () {
      yield* lastRelease.Board.insert({
        boardId: 'work',
        name: 'Work',
        owner: 'ann',
      });
      yield* lastRelease.Board.insert({
        boardId: 'home',
        name: 'Home',
        owner: 'bo',
      });
      yield* lastRelease.Task.insert({
        boardId: 'work',
        taskId: 't1',
        title: 'Plan',
      });
      yield* lastRelease.Task.insert({
        boardId: 'home',
        taskId: 't2',
        title: 'Shop',
      });
    }).pipe(Effect.provide(SQLite.make(lastRelease, { database }).layer));
    return { database };
  }),
  act: ({ database }) =>
    Effect.gen(function* () {
      yield* SQLite.setup(table, { mode: 'persistent', database });
      return yield* Effect.all([
        table.Task.get({ boardId: 'work', taskId: 't1' }),
        table.Task.get({ boardId: 'home', taskId: 't2' }),
      ]).pipe(Effect.provide(SQLite.make(table, { database }).layer));
    }),
  verify: ([work, home]) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the work task is owned by the work board owner',
        work?.value.owner === 'ann',
      );
      yield* Proof.assert(
        'the home task is owned by the home board owner',
        home?.value.owner === 'bo',
      );
    }),
});
