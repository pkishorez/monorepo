import { Console, Effect, Schema } from 'effect';
import { Task } from '../components/task.ts';

export const program = Effect.gen(function* () {
  yield* Console.log('name:', Task.name, 'id field:', Task.idField);
  yield* Console.log('latest version:', Task.latestVersion);

  // The value: what your code holds. dueAt is a Date.
  const value: typeof Task.Type = {
    taskId: 't1',
    boardId: 'work',
    title: 'Plan the week',
    dueAt: new Date('2026-11-09T09:00:00Z'),
    note: null,
    estimate: 2,
  };

  // Encoding gives the stored form: plain JSON, stamped with _v.
  const stored = yield* Schema.encodeEffect(Task.schema)(value);
  yield* Console.log('stored:', stored);

  // Decoding reads it back into a value.
  const read = yield* Schema.decodeUnknownEffect(Task.schema)(stored);
  yield* Console.log('read back, dueAt is a Date:', read.dueAt instanceof Date);

  // A row that doesn't fit the shape is refused.
  const refused = yield* Schema.decodeUnknownEffect(Task.schema)({
    ...stored,
    estimate: 'two',
  }).pipe(Effect.flip);
  return refused.message;
});
