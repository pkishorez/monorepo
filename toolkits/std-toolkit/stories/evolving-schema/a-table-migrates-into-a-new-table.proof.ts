import { Effect, Layer, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// The board as it shipped: a task does not know its owner, its project does.
const OldProject = EntityESchema.make('Project', 'projectId', {
  owner: Schema.String,
}).build();
const OldTask = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
}).build();
const oldBoard = StdTable.make('board-v1')
  .primary('pk', 'sk')
  .entity(OldProject, (e) => e.primary())
  .entity(OldTask, (e) => e.primary({ pk: ['projectId'] }))
  .build();

// The new board, on a new physical table: every task has an owner. No
// migration of one task can know it, so the table migrates instead.
const Project = EntityESchema.make('Project', 'projectId', {
  owner: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
  owner: Schema.String,
}).build();
const board = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Project, (e) => e.primary())
  .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
  .build();

const migration = StdTable.migrate(oldBoard, board, {
  Project: (project, { next }) => next.Project.insert(project.value),
  Task: (task, { old, next }) =>
    old.Project.get({ projectId: task.value.projectId }).pipe(
      Effect.flatMap((project) =>
        next.Task.insert({
          ...task.value,
          owner: project?.value.owner ?? 'nobody',
        }),
      ),
    ),
});

export default Proof.make({
  title: 'A table migrates into a new table once',
  description:
    'The new board is a new StdTable on a new physical table. StdTable.migrate sends every old row to its entity’s handler, which reads the old table and writes the new one. The new table’s Stored contract records the migration as done, so running it again does nothing.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(oldBoard, { mode: 'persistent', database });
    yield* SQLite.setup(board, { mode: 'persistent', database });
    const layer = Layer.merge(
      SQLite.make(oldBoard, { database }).layer,
      SQLite.make(board, { database }).layer,
    );
    yield* Effect.gen(function* () {
      yield* oldBoard.Project.insert({ projectId: 'work', owner: 'ada' });
      yield* oldBoard.Task.insert({
        projectId: 'work',
        taskId: 't1',
        title: 'Plan',
      });
    }).pipe(Effect.provide(layer));
    return { layer };
  }),
  act: ({ layer }) =>
    Effect.gen(function* () {
      const events = yield* Stream.runCollect(migration);
      const task = yield* board.Task.get({ projectId: 'work', taskId: 't1' });
      const again = yield* Stream.runCollect(migration);
      return {
        last: [...events].at(-1),
        owner: task?.value.owner,
        again: [...again].map(({ _tag }) => _tag),
      };
    }).pipe(Effect.provide(layer)),
  verify: ({ last, owner, again }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'every old row went through its handler',
        last?._tag === 'Done' &&
          last.counts.Project?.read === 1 &&
          last.counts.Task?.written === 1,
      );
      yield* Proof.assert(
        'the task took its owner from its old project',
        owner === 'ada',
      );
      yield* Proof.assert(
        'a second run is skipped',
        again.join() === 'Skipped',
      );
    }),
});
