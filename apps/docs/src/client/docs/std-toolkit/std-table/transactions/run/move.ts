import { Console, Effect, Layer, Stream } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { moveToHome, table, task } from '../components/tasks.ts';

export const program = Effect.gen(function* () {
  yield* task.insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' });

  // A move that lands: both writes, under one update stamp.
  yield* moveToHome('t1');
  for (const row of yield* Stream.runCollect(table.scan())) {
    yield* Console.log(row.pk, row.meta);
  }

  // A move that is refused: home already has a t2.
  yield* task.insert({ boardId: 'work', taskId: 't2', title: 'Call home' });
  yield* task.insert({
    boardId: 'home',
    taskId: 't2',
    title: 'Water the plants',
  });
  const refused = yield* Effect.flip(moveToHome('t2'));
  // A DatabaseError: its reason says which op refused, and why.
  if (typeof refused !== 'string' && refused.reason._tag === 'TransactFailed') {
    const { _tag, operations } = refused.reason;
    yield* Console.log('refused', { _tag, operations });
  }

  // Nothing was written: t2 is still on work.
  yield* Console.log(
    't2 on work',
    yield* task.get({ boardId: 'work', taskId: 't2' }),
  );
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
