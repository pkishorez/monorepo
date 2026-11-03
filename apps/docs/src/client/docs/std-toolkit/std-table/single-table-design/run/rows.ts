import { Console, Effect, Layer, Stream } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { board, settings, table, task } from '../components/app.ts';

export const program = Effect.gen(function* () {
  // Save one of each kind, through its own entity.
  yield* board.insert({ boardId: 'work', name: 'Work' });
  yield* task.insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' });
  yield* task.insert({ boardId: 'work', taskId: 't2', title: 'Call home' });
  yield* settings.put({ theme: 'dark' });

  // Then look at the table itself: every row, as it is stored.
  const rows = yield* Stream.runCollect(table.scan());
  for (const row of rows) yield* Console.log(row);

  // A query reads one partition: here, every task on the work board.
  const work = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  yield* Console.log(work.items.map((item) => item.value));
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
