import { Console, Effect, Layer } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { task as before } from '../components/table.ts';
import { table, task } from '../components/task-v2.ts';

export const program = Effect.gen(function* () {
  // Yesterday's app saved two tasks, in the first shape.
  yield* before.insert({
    boardId: 'work',
    taskId: 't1',
    title: 'Plan the week',
  });
  yield* before.insert({ boardId: 'work', taskId: 't2', title: 'Call home' });

  // Today's app lists the board. Every task has a priority.
  const page = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  yield* Console.log('the board today', page.items);
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
