import { Console, Effect, Layer } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { release1, release2, table } from '../components/releases.ts';

export const program = Effect.gen(function* () {
  // January: release 1 saves a task. It has no priority.
  const saved = yield* release1.insert({
    boardId: 'work',
    taskId: 't1',
    title: 'Plan the week',
  });
  yield* Console.log('release 1 saved', saved);

  // March: release 2 ships, and reads the same task.
  const read = yield* release2.get({ boardId: 'work', taskId: 't1' });
  yield* Console.log('release 2 read', read);
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
