import { Console, Effect, Layer, Stream } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { oldTask, reindexAll, table, task } from '../components/tasks.ts';

const high = task
  .query('byPriority', { pk: { priority: 'high' }, '>=': null })
  .pipe(Effect.map((page) => page.items.map((item) => item.value.title)));

export const program = Effect.gen(function* () {
  // One task saved by the last release, one by this one.
  yield* oldTask.insert({
    boardId: 'work',
    taskId: 'old-1',
    title: 'Plan the week',
    priority: 'high',
  });
  yield* task.insert({
    boardId: 'work',
    taskId: 'new-1',
    title: 'Call home',
    priority: 'high',
  });
  yield* Console.log('byPriority, before', yield* high);

  // drift compares each stored row with the form this release would store.
  for (const item of yield* Stream.runCollect(table.scan())) {
    const { drifted, currentForm } = yield* table.drift(item);
    yield* Console.log(item.sk, {
      drifted,
      stored: item.keys,
      current: currentForm.keys,
    });
  }

  yield* reindexAll;
  yield* Console.log('byPriority, after', yield* high);
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
