import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { EntityESchema, findNeedsBackfill } from '@kestack/std-toolkit/eschema';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
// v2 is a gap: no v1 row says who owns it, so no migration can fill `owner`.
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
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .backfill('task-owner', {
    entity: 'Task',
    to: 'v2',
    run: (task) => Effect.succeed({ ...task, owner: 'ann' }),
  })
  .build();

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title: 'A task saved before a gap version reads only once its Backfill runs',
  description:
    'Setup runs the Backfill before the new code serves; until then the old row says it needs one, never a guess.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(lastRelease, { mode: 'persistent', database });
    yield* lastRelease.Task.insert({ ...key, title: 'Plan' }).pipe(
      Effect.provide(SQLite.make(lastRelease, { database }).layer),
    );
    const db = SQLite.make(table, { database });
    const early = yield* Effect.flip(
      table.Task.get(key).pipe(Effect.provide(db.layer)),
    );
    yield* Proof.assert(
      'before setup, the old row needs a Backfill to reach v2',
      findNeedsBackfill(early)?.gapVersion === 'v2',
    );
    return { database, db };
  }),
  act: ({ database, db }) =>
    Effect.gen(function* () {
      const outcome = yield* SQLite.setup(table, {
        mode: 'persistent',
        database,
      });
      const read = yield* table.Task.get(key).pipe(Effect.provide(db.layer));
      return { outcome, read };
    }),
  verify: ({ outcome, read }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'setup ran the Backfill',
        outcome.kind === 'applied' && outcome.backfills.join() === 'task-owner',
      );
      yield* Proof.assert(
        'the task reads at v2 with its owner',
        read?.meta._v === 'v2' && read.value.owner === 'ann',
      );
    }),
});
