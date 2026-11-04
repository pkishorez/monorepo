import { Console, Effect, Fiber, Layer, Stream } from 'effect';
import { defaultBroadcaster } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { table, task } from '../../board/board.ts';

const t1 = { boardId: 'work', taskId: 't1' };
const fields = { priority: 'low', done: false } as const;

const writes = Effect.gen(function* () {
  yield* task.insert({ ...t1, title: 'Plan the week', ...fields });
  yield* task.insert({
    boardId: 'home',
    taskId: 't2',
    title: 'Call home',
    ...fields,
  });
  // Refused: t1 exists. A refused write is never announced.
  yield* task.insert({ ...t1, title: 'Again', ...fields }).pipe(Effect.ignore);
  yield* task.getAndUpdate(t1, { done: true });
  yield* task.delete(t1);
});

export const program = Effect.gen(function* () {
  // Listen to the work board, and stop after three notices.
  const listening = yield* Effect.forkChild(
    task.subscribe({ boardId: 'work' }).pipe(
      Stream.take(3),
      Stream.runForEach((notice) => Console.log('heard', notice)),
    ),
    { startImmediately: true },
  );
  yield* writes;
  yield* Fiber.join(listening);
  return 'every saved change on work, and nothing else';
}).pipe(
  // A fresh table each run, and the Broadcaster subscribers listen on.
  Effect.provide(Layer.suspend(() => Memory.make(table).layer)),
  Effect.provide(defaultBroadcaster),
);
