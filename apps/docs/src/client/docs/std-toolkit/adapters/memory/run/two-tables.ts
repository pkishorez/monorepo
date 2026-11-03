import { Console, Effect } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { table, task, titles } from '../components/board.ts';

export const program = Effect.gen(function* () {
  // Two calls, two tables: each Memory.make starts empty.
  const first = Memory.make(table);
  const second = Memory.make(table);

  // Save a task through the first table's layer.
  yield* task
    .insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' })
    .pipe(Effect.provide(first.layer));

  // A later program on the same layer sees it; the other table does not.
  yield* Console.log(
    'first table',
    yield* titles.pipe(Effect.provide(first.layer)),
  );
  yield* Console.log(
    'second table',
    yield* titles.pipe(Effect.provide(second.layer)),
  );
});
