import { Context, Effect, Layer, Schema } from 'effect';
import { TodoList } from './list.js';

/** Where todos are kept between visits. */
export class TodoStore extends Context.Service<
  TodoStore,
  {
    readonly load: Effect.Effect<TodoList>;
    readonly save: (todos: TodoList) => Effect.Effect<void, Error>;
  }
>()('docs/todo/TodoStore') {}

const KEY = 'effect-oak/todos';
const Json = Schema.fromJsonString(Schema.toCodecJson(TodoList));

/** The browser's localStorage. Nothing saved, or nothing readable, is an empty list. */
export const TodoStoreLive = Layer.succeed(TodoStore, {
  load: Effect.suspend(() => {
    const saved = localStorage.getItem(KEY);
    return saved === null
      ? Effect.succeed([])
      : Schema.decodeEffect(Json)(saved).pipe(
          Effect.orElseSucceed((): TodoList => []),
        );
  }),
  save: (todos) =>
    Schema.encodeEffect(Json)(todos).pipe(
      Effect.flatMap((json) =>
        Effect.try({
          try: () => localStorage.setItem(KEY, json),
          catch: (cause) => cause,
        }),
      ),
      Effect.mapError((cause) => new Error('Could not save todos', { cause })),
    ),
});
