import { Console, Effect } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { table, task } from '../components/tasks.ts';

// 3. An adapter: this table, kept in memory.
const board = Memory.make(table);

export const program = Effect.gen(function* () {
  yield* task.insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' });
  yield* task.insert({ boardId: 'work', taskId: 't2', title: 'Call home' });

  const page = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  for (const item of page.items)
    yield* Console.log(item.value.title, 'saved at', item.meta._v);
  return page.items.map((item) => item.value);
}).pipe(Effect.provide(board.layer));
