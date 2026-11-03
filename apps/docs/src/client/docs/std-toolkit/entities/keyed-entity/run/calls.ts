import { Console, Effect, Layer } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { table, task } from '../../board/board.ts';

const t1 = { boardId: 'work', taskId: 't1' };

export const program = Effect.gen(function* () {
  // insert: save a new task. A second insert of the same key would fail.
  yield* task.insert({
    ...t1,
    title: 'Plan the week',
    priority: 'low',
    done: false,
  });
  yield* task.insert({
    boardId: 'work',
    taskId: 't2',
    title: 'Call home',
    priority: 'high',
    done: false,
  });

  // get: one task by its key, or null.
  yield* Console.log('get t1', yield* task.get(t1));

  // query: every task on one board, in key order.
  const board = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  yield* Console.log('query work', board.items);

  // getAndUpdate: change only the fields you name.
  yield* Console.log('update t1', yield* task.getAndUpdate(t1, { done: true }));

  // delete: leaves a tombstone, marked _d.
  yield* Console.log('delete t1', yield* task.delete(t1));
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
