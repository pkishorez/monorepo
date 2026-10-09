import { Context, Effect, Layer, Schema } from 'effect';

export const Credentials = Schema.Struct({
  user: Schema.String,
  token: Schema.String,
});
type Credentials = typeof Credentials.Type;

export const Todo = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  done: Schema.Boolean,
});
type Todo = typeof Todo.Type;

/** A pretend backend: slow on purpose, so every in-between State is visible. */
export class Server extends Context.Service<
  Server,
  {
    readonly checkSession: Effect.Effect<Credentials | null>;
    readonly login: (
      user: string,
      password: string,
    ) => Effect.Effect<Credentials, string>;
    readonly listTodos: (token: string) => Effect.Effect<ReadonlyArray<Todo>>;
    readonly addTodo: (token: string, text: string) => Effect.Effect<Todo>;
    readonly toggleTodo: (token: string, id: string) => Effect.Effect<void>;
  }
>()('demos/effect-oak/Server') {}

const latency = Effect.sleep('600 millis');

export const ServerLive = Layer.sync(Server, () => {
  const todos = new Map<string, Array<Todo>>();
  const listOf = (token: string) => {
    const list = todos.get(token) ?? [
      { id: '1', text: 'Read the Log on the right', done: false },
      { id: '2', text: 'Sign out and watch this list disappear', done: false },
    ];
    todos.set(token, list);
    return list;
  };

  return Server.of({
    checkSession: latency.pipe(Effect.as(null)),
    login: (user, password) =>
      latency.pipe(
        Effect.flatMap(() =>
          password === 'oak'
            ? Effect.succeed({ user, token: `token-${user}` })
            : Effect.fail('That password is wrong. It is “oak”.'),
        ),
      ),
    listTodos: (token) => latency.pipe(Effect.as([...listOf(token)])),
    addTodo: (token, text) =>
      latency.pipe(
        Effect.map(() => {
          const todo = { id: crypto.randomUUID(), text, done: false };
          listOf(token).push(todo);
          return todo;
        }),
      ),
    toggleTodo: (token, id) =>
      latency.pipe(
        Effect.map(() => {
          const list = listOf(token);
          const index = list.findIndex((todo) => todo.id === id);
          const todo = list[index];
          if (todo) list[index] = { ...todo, done: !todo.done };
        }),
      ),
  });
});
