import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kstackz/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { TableSnapshot } from '@kstackz/std-toolkit/snapshot';

// Last release: a task has a title.
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const lastRelease = StdTable.make('board').primary('pk', 'sk').build();
const oldTask = lastRelease
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();

// This release: the same task, one version on, with a priority.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve(
    'v2',
    { priority: Schema.Literals(['low', 'normal', 'high']) },
    (v1) => ({ ...v1, priority: 'normal' as const }),
  )
  .build();
const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title:
    'A shape change the deploy check calls safe leaves every task saved before it readable',
  description:
    'Last release saved tasks in a SQLite database. This release adds a field: the snapshot diff calls it safe, every old task reads in the new shape, and the next save stores it there.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(lastRelease, { database });
    const lastReleaseDb = SQLite.make(lastRelease, { database });
    yield* Effect.forEach(
      [
        { boardId: 'work', taskId: 't1', title: 'Write the plan' },
        { boardId: 'work', taskId: 't2', title: 'Review it' },
      ],
      (value) => oldTask.insert(value),
    ).pipe(Effect.provide(lastReleaseDb.layer));
    const storedBefore = yield* Stream.runCollect(lastRelease.scan()).pipe(
      Effect.provide(lastReleaseDb.layer),
    );
    yield* Proof.assert(
      'last release saved two tasks at v1, with no priority',
      storedBefore.length === 2 &&
        storedBefore.every(
          ({ data }) => data._v === 'v1' && !('priority' in data),
        ),
    );
    // What last release's deploy accepted.
    const accepted = TableSnapshot.capture(lastRelease);
    return { db: SQLite.make(table, { database }), accepted, storedBefore };
  }),
  act: ({ db, accepted }) =>
    Effect.gen(function* () {
      const changes = TableSnapshot.diff(
        accepted,
        TableSnapshot.capture(table),
      );
      const board = yield* task.query('primary', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      yield* task.getAndUpdate(
        { boardId: 'work', taskId: 't1' },
        { priority: 'high' },
      );
      const storedAfter = yield* Stream.runCollect(table.scan());
      return {
        changes: changes.map(({ impact, action }) => ({ impact, action })),
        board: board.items.map(({ value }) => value),
        storedAfter,
      };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ changes, board, storedAfter }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the deploy check finds the change and calls it safe',
        changes.length > 0 && changes.every(({ impact }) => impact === 'safe'),
      );
      yield* Proof.assert(
        'both old tasks read in the new shape, with the default priority',
        board.length === 2 &&
          board.every(({ priority }) => priority === 'normal') &&
          board.map(({ title }) => title).join() === 'Write the plan,Review it',
      );
      const byId = new Map(
        storedAfter.map((item) => [item.data.taskId, item.data]),
      );
      yield* Proof.assert(
        'the task saved again is stored at v2 with its new priority',
        byId.get('t1')?._v === 'v2' && byId.get('t1')?.priority === 'high',
      );
      yield* Proof.assert(
        'the task nobody touched is still stored as it was',
        byId.get('t2')?._v === 'v1' && !('priority' in (byId.get('t2') ?? {})),
      );
    }),
});
