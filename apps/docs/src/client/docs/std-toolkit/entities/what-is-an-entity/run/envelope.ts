import { Console, Effect, Layer } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { table, task } from '../../board/board.ts';

const t1 = { boardId: 'work', taskId: 't1' };

export const program = Effect.gen(function* () {
  // Save a task: you get back an Entity, its value and its meta.
  const saved = yield* task.insert({
    ...t1,
    title: 'Plan the week',
    priority: 'low',
    done: false,
  });
  yield* Console.log('saved', saved);

  // Change it: the value changes, and _u moves forward.
  const updated = yield* task.getAndUpdate(t1, { done: true });
  yield* Console.log('updated', updated);

  // Delete it: the value stays, and _d becomes true.
  const deleted = yield* task.delete(t1);
  yield* Console.log('deleted', deleted);

  return yield* task.get(t1);
}).pipe(
  // A fresh table in memory on every run. The Adapters Part explains this.
  Effect.provide(Layer.suspend(() => Memory.make(table).layer)),
);
