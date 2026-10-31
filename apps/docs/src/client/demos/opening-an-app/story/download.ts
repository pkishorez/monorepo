import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Shelf } from './capabilities.ts';

/** How long one file takes, in milliseconds of Downloading. */
export const DURATION = 8000;

/** How often a Downloading file reports what it has done, in milliseconds. */
export const STEP = 500;

const cancel = Command.make('cancel', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.gen(function* () {
      const shelf = yield* Shelf;
      yield* shelf.remove(id);
    }),
});

const pause = Command.make('pause', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.gen(function* () {
      const shelf = yield* Shelf;
      yield* shelf.pause(id);
    }),
});

const resume = Command.make('resume', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.gen(function* () {
      const shelf = yield* Shelf;
      yield* shelf.resume(id);
    }),
});

/**
 * One file. Its Worker downloads while it is Downloading and its Props say it
 * is not paused, and Sends what it has done every `STEP`, so the Model always
 * says how far along it is. Downloads owns whether it is paused: Pause and
 * Resume ask it, through what it Provides.
 */
export const Download = Actor.define('Download', {
  requires: [Shelf],
  input: Schema.Struct({ id: Schema.String, name: Schema.String }),
  props: Schema.Struct({ paused: Schema.Boolean }),
  model: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    /** Milliseconds of it downloaded, up to `DURATION`. */
    done: Schema.Number,
  }),
  state: Schema.TaggedUnion({ Downloading: {}, Done: {} }),
  message: Schema.TaggedUnion({
    Progressed: {},
    Pause: {},
    Resume: {},
    Cancel: {},
  }),
});

export const DownloadLive = Actor.build(Download, {
  init: ({ id, name }) => ({
    model: { id, name, done: 0 },
    state: { _tag: 'Downloading' },
  }),
  on: {
    Cancel: (_, { model }) => ({ command: cancel({ id: model.id }) }),
  },
  states: {
    Downloading: {
      workers: {
        download: {
          while: ({ props }) => !props.paused,
          run: (self) =>
            Effect.forever(
              Effect.sleep(STEP).pipe(
                Effect.andThen(self.send({ _tag: 'Progressed' })),
              ),
            ),
        },
      },
      on: {
        Progressed: (_, { model }) => {
          const done = Math.min(DURATION, model.done + STEP);
          return {
            model: { ...model, done },
            ...(done === DURATION ? { state: { _tag: 'Done' } } : {}),
          };
        },
        Pause: (_, { model }) => ({ command: pause({ id: model.id }) }),
        Resume: (_, { model }) => ({ command: resume({ id: model.id }) }),
      },
    },
  },
});
