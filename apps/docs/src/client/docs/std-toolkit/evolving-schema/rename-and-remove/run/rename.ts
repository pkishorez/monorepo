import { Console, Effect, Schema } from 'effect';
import { Task } from '../components/task.ts';

export const program = Effect.gen(function* () {
  // A task saved by release 3, as the table keeps it.
  const stored = {
    _v: 'v3',
    taskId: 't1',
    boardId: 'work',
    title: 'Plan the week',
    priority: 'high',
    done: true,
  };
  yield* Console.log('stored at v3:', stored);

  // Read now: v3 → v4 renames title, v4 → v5 swaps done for status.
  const read = yield* Schema.decodeUnknownEffect(Task.schema)(stored);
  yield* Console.log('reads as:', read);

  // A read never writes: the stored row still has title and done.
  yield* Console.log('still stored:', stored);

  // Only a save writes it again, in the latest shape.
  return yield* Schema.encodeEffect(Task.schema)(read);
});
