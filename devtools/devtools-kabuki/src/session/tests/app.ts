import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { Actor, History, Runtime, Snapshot } from '@kestack/kabuki';
import type { AppRuntime, Step } from '@kestack/kabuki/react/types';

/* A small app the tests run, and its running app as Kabuki hands it to an Attachment. */

const Note = Schema.Struct({ at: Schema.DateFromString, text: Schema.String });

export const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

/** A Diary whose Model holds Dates: encoded, they are strings. */
export const Diary = Actor.define('Diary', {
  model: Schema.Struct({ notes: Schema.Array(Note) }),
  message: Schema.TaggedUnion({ Wrote: { note: Note } }),
}).build({
  init: () => ({ model: { notes: [] } }),
  children: { counter: Actor.child(Counter) },
  on: {
    Wrote: ({ note }, { model }) => ({
      model: { notes: [...model.notes, note] },
    }),
  },
});

type Diary = typeof Diary;

export interface Started {
  readonly app: AppRuntime;
  /** The app's one Runtime, the same through every Seek and Fork. */
  readonly runtime: Runtime<Diary>;
  /** Write a note dated `at`, in milliseconds. */
  readonly write: (text: string, at: number) => void;
  /** Bump the Diary's counter. */
  readonly bump: () => void;
}

/** The Diary running, its History kept beside its Runtime, read live as `View.app` hands it to an Attachment. */
export const started: Effect.Effect<Started, never, Scope.Scope> = Effect.gen(
  function* () {
    // Made stopped and started once it is followed, so no entry is missed.
    const runtime = Runtime.make(Diary, { running: false });
    let history = History.init(runtime.snapshot);
    let window: number | null = null;
    let seeking: Step | null = null;
    const listeners = new Set<() => void>();
    const changed = () => {
      for (const listener of listeners) listener();
    };
    const unfollow = runtime.subscribe((entries) => {
      history = History.compact(Diary, History.add(history, entries), window);
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
      name: Diary.name,
      runtime,
      get history() {
        return history;
      },
      get window() {
        return window;
      },
      keep: (next) => {
        history = History.compact(Diary, history, next);
        window = next;
        changed();
      },
      get seeking() {
        return seeking;
      },
      failure: null,
      seek: (entry) => {
        const snapshot = History.snapshot(Diary, history, entry);
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
        void runtime.follow(History.snapshot(Diary, history), {
          restart: true,
        });
      },
      startOver: () => {
        seeking = null;
        history = History.init(Snapshot.init(Diary));
        void runtime.follow(History.snapshot(Diary, history), {
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
    const write = (text: string, at: number) => {
      runtime.root.send({ _tag: 'Wrote', note: { at: new Date(at), text } });
    };
    const bump = () => {
      runtime.root.children.counter.send({ _tag: 'Bumped' });
    };
    return { app, runtime, write, bump };
  },
);
