import { Console, Effect, Schema } from 'effect';
import { Task, TaskV1 } from '../components/tasks.ts';

export const program = Effect.gen(function* () {
  // Release 1 saves two tasks. This is what the database keeps.
  const saved = [
    yield* Schema.encodeEffect(TaskV1.schema)({
      boardId: 'work',
      title: 'Plan the week',
    }),
    yield* Schema.encodeEffect(TaskV1.schema)({
      boardId: 'work',
      title: 'Water the plants',
    }),
  ];
  yield* Console.log('saved by release 1:', saved);

  // Release 2 ships. It reads the very same rows with its own shape.
  for (const row of saved) {
    const task = yield* Schema.decodeUnknownEffect(Task.schema)(row);
    yield* Console.log('release 2 reads:', task);
  }

  // Release 2 saves a task of its own: stamped v2, with its priority.
  const fresh = yield* Schema.encodeEffect(Task.schema)({
    boardId: 'work',
    title: 'Call home',
    priority: 'high',
  });
  yield* Console.log('saved by release 2:', fresh);

  return `the rows release 1 saved are still ${saved[0]?._v}`;
});
