import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .build();

const lastRelease = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(TaskV1, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const release = (ran: string[]) =>
  StdTable.make('board')
    .primary('pk', 'sk')
    .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
    .backfill('task-owner', {
      entity: 'Task',
      to: 'v2',
      run: (task) => {
        ran.push(task.taskId);
        return Effect.succeed({ ...task, owner: 'ann' });
      },
    })
    .build();

export default Proof.make({
  title: 'A disposable table is emptied instead of backfilled',
  description:
    'Its data can be fetched again, so setup skips the downtime of a Backfill and starts the table empty.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(lastRelease, { mode: 'disposable', database });
    yield* lastRelease.Task.insert({
      boardId: 'work',
      taskId: 't1',
      title: 'Plan',
    }).pipe(Effect.provide(SQLite.make(lastRelease, { database }).layer));
    return { database };
  }),
  act: ({ database }) =>
    Effect.gen(function* () {
      const ran: string[] = [];
      const table = release(ran);
      const outcome = yield* SQLite.setup(table, {
        mode: 'disposable',
        database,
      });
      const rows = yield* Stream.runCollect(table.scan()).pipe(
        Effect.provide(SQLite.make(table, { database }).layer),
      );
      return { outcome, ran, rows };
    }),
  verify: ({ outcome, ran, rows }) =>
    Effect.gen(function* () {
      yield* Proof.assert('setup wiped the table', outcome.kind === 'wiped');
      yield* Proof.assert('the Backfill never ran', ran.length === 0);
      yield* Proof.assert('the table is empty', rows.length === 0);
    }),
});
