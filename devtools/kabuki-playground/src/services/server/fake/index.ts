import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { Server, ServerDown } from '../contract/index.ts';

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
});

const ServerState = Schema.Struct({
  todos: Schema.Array(Todo),
  latency: Schema.Number,
  failing: Schema.Boolean,
});

type ServerState = typeof ServerState.Type;

const SEED: ServerState['todos'] = [
  { id: 'todo-1', title: 'Buy oat milk', done: false },
  { id: 'todo-2', title: 'Read the Kabuki README', done: true },
  {
    id: 'todo-3',
    title:
      'Write down everything that has to happen before the release goes out, including the changelog, the migration notes, new screenshots for the docs and a short email to everyone who asked for this last spring',
    done: false,
  },
  {
    id: 'todo-4',
    title:
      'Check https://example.com/a/very/long/path/that/never/breaks/because/it/has/no/spaces/at/all?and=a&query=string',
    done: false,
  },
  {
    id: 'todo-5',
    title: 'Say こんにちは, مرحبا and 🎭 to the team',
    done: false,
  },
];

const set =
  (change: Partial<ServerState>) =>
  (state: SubscriptionRef.SubscriptionRef<ServerState>) =>
    SubscriptionRef.update(state, (was) => ({ ...was, ...change }));

export const server = Fake.make({
  name: 'server',
  state: ServerState,
  initial: { todos: SEED, latency: 800, failing: false },
  controls: {
    SetLatency: Fake.control(
      ServerState,
      Schema.Struct({ latency: Schema.Number }),
      ({ latency }, state) =>
        latency < 0
          ? Effect.fail('Latency cannot be negative')
          : set({ latency })(state),
    ),
    StartFailing: Fake.control(ServerState, Schema.Struct({}), (_, state) =>
      set({ failing: true })(state),
    ),
    StopFailing: Fake.control(ServerState, Schema.Struct({}), (_, state) =>
      set({ failing: false })(state),
    ),
  },
  layer: (state) => {
    const call = Effect.gen(function* () {
      const { latency, failing } = yield* SubscriptionRef.get(state);
      yield* Effect.sleep(latency);
      if (failing)
        return yield* new ServerDown({
          reason: 'The server is not answering.',
        });
    });
    return Layer.succeed(Server, {
      load: call.pipe(
        Effect.andThen(SubscriptionRef.get(state)),
        Effect.map(({ todos }) => todos),
      ),
      mark: (id, done) =>
        call.pipe(
          Effect.andThen(
            SubscriptionRef.update(state, (was) => ({
              ...was,
              todos: was.todos.map((todo) =>
                todo.id === id ? { ...todo, done } : todo,
              ),
            })),
          ),
        ),
      save: (id, title) =>
        call.pipe(
          Effect.andThen(
            SubscriptionRef.update(state, (was) => ({
              ...was,
              todos: was.todos.some((todo) => todo.id === id)
                ? was.todos.map((todo) =>
                    todo.id === id ? { ...todo, title } : todo,
                  )
                : [...was.todos, { id, title, done: false }],
            })),
          ),
        ),
    });
  },
});
