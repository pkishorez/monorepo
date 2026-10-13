import { Effect, Schema } from 'effect';
import { Actor, Command } from 'effect-oak';
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

/**
 * One file. Its Worker downloads while it is Downloading and Sends what it
 * has done every `STEP`, so the Model always says how far along it is.
 */
export const Download = Actor.make('Download', {
  requires: [Shelf],
  input: Schema.Struct({ id: Schema.String, name: Schema.String }),
  model: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    /** Milliseconds of it downloaded, up to `DURATION`. */
    done: Schema.Number,
  }),
  state: Schema.TaggedUnion({ Downloading: {}, Paused: {}, Done: {} }),
  message: Schema.TaggedUnion({
    Progressed: {},
    Pause: {},
    Resume: {},
    Cancel: {},
  }),
}).build({
  init: ({ id, name }) => ({
    model: { id, name, done: 0 },
    state: { _tag: 'Downloading' },
  }),
  on: {
    Cancel: (_, { model }) => ({ command: cancel({ id: model.id }) }),
  },
  state: {
    Downloading: {
      workers: {
        download: {
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
        Pause: () => ({ state: { _tag: 'Paused' } }),
      },
    },
    Paused: {
      on: { Resume: () => ({ state: { _tag: 'Downloading' } }) },
    },
  },
});
