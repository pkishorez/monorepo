import { Effect, Fiber, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { defaultBroadcaster } from '@kestack/std-toolkit/core';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();

export default Proof.make({
  title:
    'A subscriber hears every saved change on its board, and nothing that was refused',
  description:
    'With a Broadcaster provided, `subscribe({ boardId })` yields one Change Notice per committed write on that board.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const existing = yield* table.Task.insert({
      taskId: 't1',
      boardId: 'work',
      title: 'Plan',
    }).pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'one task exists before anyone listens',
      existing.meta._d === false,
    );
    return { db, existing };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const listening = yield* Effect.forkChild(
        Stream.runCollect(
          table.Task.subscribe({ boardId: 'work' }).pipe(Stream.take(3)),
        ),
        { startImmediately: true },
      );
      yield* table.Task.insert({
        taskId: 't2',
        boardId: 'work',
        title: 'Review',
      });
      yield* table.Task.insert({
        taskId: 't3',
        boardId: 'home',
        title: 'Cook',
      });
      // Refused: t1 already exists. A refused write is never announced.
      yield* table.Task.insert({
        taskId: 't1',
        boardId: 'work',
        title: 'Again',
      }).pipe(Effect.ignore);
      yield* table.Task.getAndUpdate(
        { boardId: 'work', taskId: 't1' },
        { title: 'Plan it' },
      );
      yield* table.Task.delete({ boardId: 'work', taskId: 't2' });
      const notices = yield* Fiber.join(listening);
      return {
        notices: notices.map(({ value, meta }) => ({
          taskId: value.taskId,
          title: value.title,
          deleted: meta._d,
        })),
      };
    }).pipe(Effect.provide(db.layer), Effect.provide(defaultBroadcaster)),
  verify: ({ notices }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the three committed writes on work were heard in order',
        notices.map(({ taskId, title }) => `${taskId}:${title}`).join() ===
          't2:Review,t1:Plan it,t2:Review',
      );
      yield* Proof.assert(
        'the delete arrives as a tombstone',
        notices[2]?.deleted === true,
      );
    }),
});
