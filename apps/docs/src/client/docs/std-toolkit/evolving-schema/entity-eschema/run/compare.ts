import { Console, Effect, Schema } from 'effect';
import { TaskShape } from '../components/as-eschema.ts';
import { Task } from '../components/as-entity.ts';

export const program = Effect.gen(function* () {
  // What the entity knows about itself: one fact more than an ESchema.
  yield* Console.log({
    name: Task.name,
    idField: Task.idField,
    latestVersion: Task.latestVersion,
  });

  // Encoded, side by side. The only difference is taskId.
  yield* Console.log(
    'ESchema stores',
    yield* Schema.encodeEffect(TaskShape.schema)({
      boardId: 'work',
      title: 'Plan the week',
      priority: 'high',
    }),
  );
  yield* Console.log(
    'EntityESchema stores',
    yield* Schema.encodeEffect(Task.schema)({
      taskId: 't1',
      boardId: 'work',
      title: 'Plan the week',
      priority: 'high',
    }),
  );

  // A row saved at v1 upgrades to v2, and its id comes along untouched.
  return yield* Schema.decodeUnknownEffect(Task.schema)({
    _v: 'v1',
    taskId: 't1',
    boardId: 'work',
    title: 'Water the plants',
  });
});
