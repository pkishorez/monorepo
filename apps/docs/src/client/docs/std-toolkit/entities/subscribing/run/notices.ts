import { Console, Effect, Fiber, Layer, Schema, Stream } from 'effect';
import { defaultBroadcaster } from '@kestack/std-toolkit/core';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const save = Effect.gen(function* () {
  yield* task.insert({ taskId: 't1', boardId: 'work', title: 'Plan' });
  yield* task.insert({ taskId: 't2', boardId: 'home', title: 'Cook' });
  // Refused: t1 exists. A refused write is never announced.
  yield* task
    .insert({ taskId: 't1', boardId: 'work', title: 'Again' })
    .pipe(Effect.ignore);
  yield* task.getAndUpdate(
    { boardId: 'work', taskId: 't1' },
    { title: 'Plan it' },
  );
  yield* task.delete({ boardId: 'work', taskId: 't1' });
});

export const program = Effect.gen(function* () {
  // Listen to the work board, and stop after three notices.
  const listening = yield* Effect.forkChild(
    task.subscribe({ boardId: 'work' }).pipe(
      Stream.take(3),
      Stream.runForEach(({ value, meta }) =>
        Console.log(
          `heard ${value.taskId}: '${value.title}'`,
          meta._d ? 'deleted' : '',
        ),
      ),
    ),
    { startImmediately: true },
  );
  yield* save;
  yield* Fiber.join(listening);
  return 'heard every saved change on work';
}).pipe(
  // A fresh table each run, and the Broadcaster subscribers listen on.
  Effect.provide(Layer.suspend(() => Memory.make(table).layer)),
  Effect.provide(defaultBroadcaster),
);
