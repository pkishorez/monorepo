import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { Actor, History, Runtime, Snapshot } from '@kestack/kabuki';
import type { AnyActor, RuntimeOptions } from '@kestack/kabuki/types';
import type { AppRuntime, Step } from '@kestack/kabuki/react/types';

const Note = Schema.Struct({ at: Schema.DateFromString, text: Schema.String });

export const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

export const Diary = Actor.define('Diary', {
  description: 'Notes, each with when it was written',
  model: Schema.Struct({ notes: Schema.Array(Note) }),
  message: {
    Wrote: Schema.Struct({ note: Note }).annotate({
      description: 'A note was written',
    }),
  },
}).build({
  init: () => ({ model: { notes: [] } }),
  children: { counter: Actor.child(Counter) },
  on: {
    Wrote: ({ note }, { model }) => ({
      model: { notes: [...model.notes, note] },
    }),
  },
});

export interface Running<A extends AnyActor> {
  readonly app: AppRuntime;
  readonly runtime: Runtime<A>;
}

export const running = <A extends AnyActor>(
  actor: A,
): Effect.Effect<Running<A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const options = { running: false } as RuntimeOptions<AnyActor>;
    const runtime = Runtime.make(actor as AnyActor, options) as Runtime<A>;
    let history = History.init(runtime.snapshot);
    let window: number | null = null;
    let seeking: Step | null = null;
    const listeners = new Set<() => void>();
    const changed = () => {
      for (const listener of listeners) listener();
    };
    const unfollow = runtime.subscribe((entries) => {
      history = History.compact(actor, History.add(history, entries), window);
      changed();
    });
    void runtime.start();
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => {
        unfollow();
        return runtime.dispose();
      }),
    );
    const app: AppRuntime = {
      name: actor.name,
      runtime: runtime as Runtime,
      get history() {
        return history;
      },
      get window() {
        return window;
      },
      keep: (next) => {
        history = History.compact(actor, history, next);
        window = next;
        changed();
      },
      get seeking() {
        return seeking;
      },
      failure: null,
      seek: (entry) => {
        const snapshot = History.snapshot(actor, history, entry);
        seeking = { entry, at: snapshot.at, snapshot };
        changed();
      },
      toHead: () => {
        seeking = null;
        changed();
      },
      fork: (entry) => {
        seeking = null;
        history = History.move(history, entry);
        void runtime.follow(History.snapshot(actor, history), {
          restart: true,
        });
      },
      startOver: () => {
        seeking = null;
        history = History.init(Snapshot.init(actor));
        void runtime.follow(History.snapshot(actor, history), {
          restart: true,
        });
      },
      start: () => void runtime.start(),
      stop: () => void runtime.stop(),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    return { app, runtime };
  });

export interface Started extends Running<typeof Diary> {
  readonly write: (text: string, at: number) => void;
  readonly bump: () => void;
}

export const started: Effect.Effect<Started, never, Scope.Scope> = Effect.map(
  running(Diary),
  ({ app, runtime }) => ({
    app,
    runtime,
    write: (text, at) => {
      runtime.root.send({ _tag: 'Wrote', note: { at: new Date(at), text } });
    },
    bump: () => {
      runtime.root.children.counter.send({ _tag: 'Bumped' });
    },
  }),
);
