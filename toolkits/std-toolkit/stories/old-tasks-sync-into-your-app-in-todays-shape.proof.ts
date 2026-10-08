import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import type { Entity } from '@kstackz/std-toolkit/core';
import { StdTable } from '@kstackz/std-toolkit/db';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kstackz/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { createStdSync, strategy } from '@kstackz/std-toolkit/sync';

// Last release: a task is open or not.
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  open: Schema.Boolean,
}).build();
const lastRelease = StdTable.make('board').primary('pk', 'sk').build();
const oldTask = lastRelease
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();

// This release: `open` became a status with room to grow.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  open: Schema.Boolean,
})
  .evolve(
    'v2',
    { open: null, status: Schema.Literals(['open', 'doing', 'done']) },
    ({ open, ...v1 }) => ({
      ...v1,
      status: open ? ('open' as const) : ('done' as const),
    }),
  )
  .build();
type Task = typeof Task.Type;
const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const until = (ready: () => boolean) =>
  Effect.gen(function* () {
    while (!ready()) yield* Effect.sleep('20 millis');
  });

export default Proof.make({
  title:
    'Tasks saved in an old shape sync into your app in the new one, and edits save back in it',
  description:
    'One Task definition serves storage and sync. The backend is a SQLite database holding v1 rows; the app sees only v2 values, and its edit lands on the backend as a v2 row.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(lastRelease, { database });
    yield* Effect.forEach(
      [
        { boardId: 'work', taskId: 't1', title: 'Write the plan', open: true },
        { boardId: 'work', taskId: 't2', title: 'Book the room', open: false },
      ],
      (value) => oldTask.insert(value),
    ).pipe(Effect.provide(SQLite.make(lastRelease, { database }).layer));
    const backend = SQLite.make(table, { database });
    const storedBefore = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(backend.layer),
    );
    yield* Proof.assert(
      'the backend holds two tasks at v1',
      storedBefore.length === 2 &&
        storedBefore.every(({ data }) => data._v === 'v1'),
    );
    return { backend, storedBefore };
  }),
  act: ({ backend }) =>
    Effect.gen(function* () {
      // The app: one Collection of tasks, kept fresh from the backend.
      const app = createStdSync({ name: 'board' });
      yield* Effect.addFinalizer(() => Effect.promise(() => app.dispose()));
      const tasks = app.collection(Task, {
        sync: {
          global: strategy.oldToNew({
            fetch: ({ after }: { after: Entity<Task> | null }) =>
              task
                .query('primary', { pk: { boardId: 'work' }, '>=': null })
                .pipe(
                  Effect.map((page) =>
                    page.items
                      .filter(
                        (item) =>
                          after === null || item.meta._u > after.meta._u,
                      )
                      .sort((a, b) => (a.meta._u < b.meta._u ? -1 : 1)),
                  ),
                  Effect.provide(backend.layer),
                ),
          }),
        },
        onUpdate: ({ current, updates }) =>
          task
            .getAndUpdate(
              { boardId: current.boardId, taskId: current.taskId },
              updates,
            )
            .pipe(Effect.provide(backend.layer)),
      });
      yield* Effect.promise(() => tasks.preload());
      yield* until(() => tasks.size === 2);
      const oldFlagShown = tasks.toArray.some((row) => 'open' in row);
      const synced = tasks.toArray.map(({ taskId, title, status }) => ({
        taskId,
        title,
        status,
      }));

      yield* Effect.promise(
        () =>
          tasks.update('t1', (draft) => {
            draft.status = 'doing';
          }).isPersisted.promise,
      );
      const stored = yield* Stream.runCollect(table.scan()).pipe(
        Effect.provide(backend.layer),
      );
      return {
        synced: synced.sort((a, b) => (a.taskId < b.taskId ? -1 : 1)),
        oldFlagShown,
        afterEdit: tasks.get('t1')?.status,
        stored: stored.map(({ data }) => data),
      };
    }),
  verify: ({ synced, oldFlagShown, afterEdit, stored }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the app shows both tasks with a status, never the old flag',
        synced.length === 2 &&
          synced[0]?.status === 'open' &&
          synced[1]?.status === 'done' &&
          !oldFlagShown,
      );
      yield* Proof.assert('the edit shows in the app', afterEdit === 'doing');
      const t1 = stored.find(({ taskId }) => taskId === 't1');
      const t2 = stored.find(({ taskId }) => taskId === 't2');
      yield* Proof.assert(
        'the backend stored the edit as a v2 row',
        t1?._v === 'v2' && t1.status === 'doing' && !('open' in t1),
      );
      yield* Proof.assert(
        'the task nobody edited is still a v1 row on the backend',
        t2?._v === 'v1' && t2.open === false,
      );
    }),
});
