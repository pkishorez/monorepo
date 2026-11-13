import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Step } from '@kestack/kabuki/types';
import type { AppRuntime } from '@kestack/kabuki/react/types';

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

/** The Diary running, read live as `View.app` hands it to an Attachment. */
export const started: Effect.Effect<Started, never, Scope.Scope> = Effect.gen(
  function* () {
    const runtime = Runtime.make(Diary, { window: null });
    let seeking: Step | null = null;
    const listeners = new Set<() => void>();
    const changed = () => {
      for (const listener of listeners) listener();
    };
    const unfollow = runtime.subscribe(changed);
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => {
        unfollow();
        return runtime.dispose();
      }),
    );
    const app: AppRuntime = {
      name: Diary.name,
      runtime,
      get seeking() {
        return seeking;
      },
      failure: null,
      seek: (entry) => {
        seeking = runtime.seek(entry);
        changed();
      },
      toHead: () => {
        seeking = null;
        changed();
      },
      fork: (entry) => {
        seeking = null;
        void runtime.fork(entry);
      },
      start: () => void runtime.start(),
      stop: () => void runtime.stop(),
      workers: (address) => runtime.workers(address),
      instance: (options) => runtime.instance(options),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const write = (text: string, at: number) => {
      runtime.send(runtime.snapshot.root.address, {
        _tag: 'Wrote',
        note: { at: new Date(at), text },
      });
    };
    const bump = () => {
      runtime.send(runtime.snapshot.root.children.counter.address, {
        _tag: 'Bumped',
      });
    };
    return { app, runtime, write, bump };
  },
);
