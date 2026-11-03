import { Console, Effect, Schema } from 'effect';

// January's code saved tasks in this shape.
const TaskInJanuary = Schema.Struct({
  boardId: Schema.String,
  title: Schema.String,
});

// March's code adds a priority.
const TaskInMarch = Schema.Struct({
  boardId: Schema.String,
  title: Schema.String,
  priority: Schema.Literals(['low', 'high']),
});

export const program = Effect.gen(function* () {
  // A row January saved. It is still in the database in March.
  const saved = yield* Schema.encodeEffect(TaskInJanuary)({
    boardId: 'work',
    title: 'Plan the week',
  });
  yield* Console.log('saved in January:', saved);

  // March's code reads it with March's shape.
  const failure = yield* Schema.decodeUnknownEffect(TaskInMarch)(saved).pipe(
    Effect.flip,
  );
  yield* Console.error('read in March:', failure.message);

  return 'the row did not change; the code did';
});
