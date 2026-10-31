import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

const lastRelease = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(TaskV1, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();

export default Proof.make({
  title:
    'A board of tasks saved at different versions lists every task in the latest shape',
  description:
    'Each row is migrated from its own version, so a query never mixes shapes.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    yield* Effect.gen(function* () {
      yield* lastRelease.Task.insert({
        taskId: 't1',
        boardId: 'work',
        title: 'Old one',
      });
      yield* lastRelease.Task.insert({
        taskId: 't2',
        boardId: 'work',
        title: 'Old two',
      });
      yield* table.Task.insert({
        taskId: 't3',
        boardId: 'work',
        title: 'New',
        priority: 'high',
      });
    }).pipe(Effect.provide(db.layer));
    const rows = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    const versions = rows.map(({ data }) => data._v).sort();
    yield* Proof.assert(
      'two v1 rows and one v2 row are stored',
      versions.join() === 'v1,v1,v2',
    );
    return { db, storedVersions: versions };
  }),
  act: ({ db }) =>
    table.Task.query('primary', { pk: { boardId: 'work' }, '>=': null }).pipe(
      Effect.map((page) => ({
        listed: page.items.map(({ value, meta }) => ({
          taskId: value.taskId,
          priority: value.priority,
          _v: meta._v,
        })),
      })),
      Effect.provide(db.layer),
    ),
  verify: ({ listed }) =>
    Effect.gen(function* () {
      yield* Proof.assert('all three are listed', listed.length === 3);
      yield* Proof.assert(
        'every listed task is v2',
        listed.every(({ _v }) => _v === 'v2'),
      );
      yield* Proof.assert(
        'old tasks got the default and the new one kept its own',
        listed.map(({ priority }) => priority).join() === 'low,low,high',
      );
    }),
});
