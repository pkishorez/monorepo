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
// Two releases this database never saw, each with a gap version.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .evolve('v3', { label: Schema.String })
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
        ran.push(`owner ${task.taskId}`);
        return Effect.succeed({ ...task, owner: 'ann' });
      },
    })
    .backfill('task-label', {
      entity: 'Task',
      to: 'v3',
      after: ['task-owner'],
      run: (task) => {
        ran.push(`label ${task.taskId}`);
        return Effect.succeed({
          ...task,
          label: `${task.owner}: ${task.title}`,
        });
      },
    })
    .build();

export default Proof.make({
  title: 'A database that skipped two releases catches up in one setup',
  description:
    'Setup scans the entity once and takes each row through every pending Backfill in order, so it is written once at the latest version.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(lastRelease, { mode: 'persistent', database });
    yield* Effect.forEach(['t1', 't2'], (taskId) =>
      lastRelease.Task.insert({ boardId: 'work', taskId, title: 'Plan' }),
    ).pipe(Effect.provide(SQLite.make(lastRelease, { database }).layer));
    return { database };
  }),
  act: ({ database }) =>
    Effect.gen(function* () {
      const ran: string[] = [];
      const table = release(ran);
      const first = yield* SQLite.setup(table, {
        mode: 'persistent',
        database,
      });
      const ranFirst = [...ran];
      const again = yield* SQLite.setup(table, {
        mode: 'persistent',
        database,
      });
      const rows = yield* Stream.runCollect(table.scan()).pipe(
        Effect.provide(SQLite.make(table, { database }).layer),
      );
      return { first, ranFirst, again, ranAfter: ran, rows };
    }),
  verify: ({ first, ranFirst, again, ranAfter, rows }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'one setup ran both Backfills, in order',
        first.kind === 'applied' &&
          first.backfills.join() === 'task-owner,task-label',
      );
      yield* Proof.assert(
        'each row went through both steps, one row at a time',
        ranFirst.join() === 'owner t1,label t1,owner t2,label t2',
      );
      yield* Proof.assert(
        'every row is stored at v3',
        rows.length === 2 && rows.every((row) => row.data._v === 'v3'),
      );
      yield* Proof.assert(
        'the next setup has nothing left to do',
        again.kind === 'unchanged' && ranAfter.length === ranFirst.length,
      );
    }),
});
