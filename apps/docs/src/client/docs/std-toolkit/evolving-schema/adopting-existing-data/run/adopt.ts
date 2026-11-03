import { Console, Effect, Schema } from 'effect';
import { Task, TaskAdopted } from '../components/task.ts';

// Saved long before std-toolkit: no _v anywhere.
const legacy = { taskId: 't1', boardId: 'work', title: 'Call home' };

export const program = Effect.gen(function* () {
  yield* Console.log('stored, no version:', legacy);

  // Adopted as v1, it reads exactly as it was.
  yield* Console.log(
    'adopted:',
    yield* Schema.decodeUnknownEffect(TaskAdopted.schema)(legacy),
  );

  // Two versions later, the same row is read as v1 and migrated up.
  const read = yield* Schema.decodeUnknownEffect(Task.schema)(legacy);
  yield* Console.log('read by v3:', read);

  // Saved again, it gets a version for the first time.
  yield* Console.log(
    'saved again:',
    yield* Schema.encodeEffect(Task.schema)(read),
  );

  // A row that never had v1's shape fails loudly. Nothing is guessed.
  const wrong = yield* Schema.decodeUnknownEffect(Task.schema)({
    taskId: 't2',
    boardId: 'work',
    text: 'Water the plants',
  }).pipe(Effect.flip);
  return wrong.message;
});
