import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { Actor, History, Runtime } from '@kestack/kabuki';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { AppRuntime } from '@kestack/kabuki/react/view';

/* A small app the tests run, and its running app as Kabuki hands it to an Attachment. */

const Note = Schema.Struct({ at: Schema.DateFromString, text: Schema.String });

export const Counter = Actor.build(
  Actor.define('Counter', {
    model: Schema.Struct({ count: Schema.Number }),
    message: Schema.TaggedUnion({ Bumped: {} }),
  }),
  {
    init: () => ({ model: { count: 0 } }),
    on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
  },
);

/** A Diary whose Model holds Dates: encoded, they are strings. */
export const Diary = Actor.build(
  Actor.define('Diary', {
    model: Schema.Struct({ notes: Schema.Array(Note) }),
    message: Schema.TaggedUnion({ Wrote: { note: Note } }),
  }),
  {
    init: () => ({ model: { notes: [] } }),
    children: (child) => ({ counter: child(Counter) }),
    on: {
      Wrote: ({ note }, { model }) => ({
        model: { notes: [...model.notes, note] },
      }),
    },
  },
);

export interface Started {
  readonly runtime: AppRuntime;
  readonly running: Running<typeof Diary>;
  /** Write a note at a Time, in milliseconds. */
  readonly write: (text: string, at: number) => void;
}

/** The Diary running, read live as `View.app` hands it to an Attachment. */
export const started: Effect.Effect<Started, never, Scope.Scope> = Effect.gen(
  function* () {
    const history = History.make(Diary, { window: null });
    const running = yield* Runtime.start(history);
    let shown: AppRuntime['shown'] = null;
    const listeners = new Set<() => void>();
    const changed = () => {
      for (const listener of listeners) listener();
    };
    history.subscribe(changed);
    running.subscribe(changed);
    const runtime: AppRuntime = {
      name: history.actor.definition.name,
      get history() {
        return history;
      },
      get branch() {
        return history.branch();
      },
      get head() {
        return history.head();
      },
      get running() {
        return running.running();
      },
      get shown() {
        return shown;
      },
      failure: null,
      show: (step) => {
        shown = step;
        changed();
      },
      start: (from) => {
        Effect.runFork(running.start(from));
      },
      stop: () => {
        Effect.runFork(running.stop());
      },
      clear: () => history.clear(),
      workers: running.workers,
      provided: running.provided,
      instance: (options) => running.instance(options),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const write = (text: string, at: number) =>
      running.send('Diary', {
        _tag: 'Wrote',
        note: { at: new Date(at), text },
      });
    return { runtime, running, write };
  },
);
