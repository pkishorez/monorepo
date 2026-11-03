import { Console, Effect, Schema } from 'effect';
import { Task } from '../components/task.ts';

export const program = Effect.gen(function* () {
  yield* Console.log('name:', Task.name, 'latest version:', Task.latestVersion);

  // The value: what your code holds. It has no version in it.
  const value: typeof Task.Type = { boardId: 'work', title: 'Plan the week' };
  yield* Console.log('the value:', value);

  // Encoding gives the form that is stored: the same fields, plus _v.
  const stored = yield* Schema.encodeEffect(Task.schema)(value);
  yield* Console.log('stored:', stored);

  // Decoding reads it back into a value, the version taken off again.
  const read = yield* Schema.decodeUnknownEffect(Task.schema)(stored);
  yield* Console.log('read back:', read);

  // A row that does not fit the shape is refused, not let through.
  const broken = { _v: 'v1', boardId: 'work' };
  const refused = yield* Schema.decodeUnknownEffect(Task.schema)(broken).pipe(
    Effect.flip,
  );
  yield* Console.error('refused:', broken, refused.message);
  return 'only rows that fit a version are read';
});
