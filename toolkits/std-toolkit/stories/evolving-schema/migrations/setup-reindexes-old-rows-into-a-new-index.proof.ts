import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

const lastRelease = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
// This release finds tasks by status, so the old ones need its keys.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) =>
    e
      .primary({ pk: ['boardId'] })
      .index('GSI1', 'byStatus', { pk: ['status'], sk: ['title'] }),
  )
  .build();

export default Proof.make({
  title: 'Setup puts old tasks into a new index before the new code serves',
  description:
    'On a persistent table, setup sees the new access pattern, scans the table, and rewrites every task whose index keys are missing, with nothing declared. Only then does it record the new contract.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(lastRelease, { mode: 'persistent', database });
    yield* lastRelease.Task.insert({
      boardId: 'work',
      taskId: 't1',
      title: 'Plan',
      status: 'open',
    }).pipe(Effect.provide(SQLite.make(lastRelease, { database }).layer));
    return { database };
  }),
  act: ({ database }) =>
    Effect.gen(function* () {
      const outcome = yield* SQLite.setup(table, {
        mode: 'persistent',
        database,
      });
      const open = yield* table.Task.query('byStatus', {
        pk: { status: 'open' },
        '>=': null,
      }).pipe(Effect.provide(SQLite.make(table, { database }).layer));
      const again = yield* SQLite.setup(table, {
        mode: 'persistent',
        database,
      });
      return {
        outcome,
        found: open.items.map(({ value }) => value.taskId),
        again: again.kind,
      };
    }),
  verify: ({ outcome, found, again }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'setup reindexed the tasks',
        outcome.kind === 'applied' && outcome.reindexed.join() === 'Task',
      );
      yield* Proof.assert(
        'the new index finds the old task',
        found.join() === 't1',
      );
      yield* Proof.assert(
        'the next setup finds nothing to do',
        again === 'unchanged',
      );
    }),
});
