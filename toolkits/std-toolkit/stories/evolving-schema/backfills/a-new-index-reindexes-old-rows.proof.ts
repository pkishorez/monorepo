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
const entities = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) =>
    e
      .primary({ pk: ['boardId'] })
      .index('GSI1', 'byStatus', { pk: ['status'], sk: ['title'] }),
  );
const table = entities.backfill('task-by-status', { reindex: 'Task' }).build();

export default Proof.make({
  title: 'A new index finds old tasks once its reindex Backfill runs',
  description:
    'Setup refuses a new index on a persistent table until a `{ reindex }` Backfill says to fill it, then fills it before the new code serves.',
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
    const refused = yield* Effect.flip(
      SQLite.setup(entities.build(), { mode: 'persistent', database }),
    );
    yield* Proof.assert(
      'without the reindex, setup refuses the new index',
      refused._tag === 'SetupRefused',
    );
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
      return { outcome, found: open.items.map(({ value }) => value.taskId) };
    }),
  verify: ({ outcome, found }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'setup ran the reindex',
        outcome.kind === 'applied' &&
          outcome.backfills.join() === 'task-by-status',
      );
      yield* Proof.assert(
        'the new index finds the old task',
        found.join() === 't1',
      );
    }),
});
