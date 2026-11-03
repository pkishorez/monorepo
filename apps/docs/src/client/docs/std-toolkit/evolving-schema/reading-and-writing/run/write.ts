import { Console, Effect, Schema } from 'effect';
import { Task } from '../components/task.ts';

export const program = Effect.gen(function* () {
  // A row saved by release 1.
  const old = { _v: 'v1', boardId: 'work', title: 'Plan the week' };
  yield* Console.log('stored:', old);

  // Your code reads it, marks it done, and saves it.
  const task = yield* Schema.decodeUnknownEffect(Task.schema)(old);
  const saved = yield* Schema.encodeEffect(Task.schema)({
    ...task,
    done: true,
  });

  // The save is stamped with the latest version: the row is now v3.
  yield* Console.log('stored after the save, at', saved._v, saved);
  return `written at ${saved._v}`;
});
