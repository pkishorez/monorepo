import { Effect, Schema } from 'effect';
import { Actor, Command } from 'effect-oak';
import { Shelf } from './capabilities.ts';

/** How long one file takes, in milliseconds of Downloading. */
export const DURATION = 8000;

const cancel = Command.make('cancel', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.gen(function* () {
      const shelf = yield* Shelf;
      yield* shelf.remove(id);
    }),
});

/**
 * One file. Its progress is never a Message: the Model keeps how much was
 * done before the last pause, the State when this run began, and the View
 * works the rest out from the Frame.
 */
export const Download = Actor.make('Download', {
  requires: [Shelf],
  input: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    since: Schema.Number,
  }),
  model: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    done: Schema.Number,
  }),
  state: Schema.TaggedUnion({
    Downloading: { since: Schema.Number },
    Paused: {},
    Done: {},
  }),
  message: Schema.TaggedUnion({
    Finished: {},
    Pause: {},
    Resume: {},
    Cancel: {},
  }),
}).build({
  init: ({ id, name, since }) => ({
    model: { id, name, done: 0 },
    state: { _tag: 'Downloading', since },
  }),
  on: {
    Cancel: (_, { model }) => ({ command: cancel({ id: model.id }) }),
  },
  state: {
    Downloading: {
      workers: {
        download: {
          run: (self) =>
            Effect.gen(function* () {
              const { model, state } = yield* self.get;
              const now = yield* self.now;
              const left = DURATION - model.done - (now - state.since);
              yield* Effect.sleep(Math.max(0, left));
              yield* self.send({ _tag: 'Finished' });
            }),
        },
      },
      on: {
        Pause: (_, { model, state, at }) => ({
          model: { ...model, done: model.done + at - state.since },
          state: { _tag: 'Paused' },
        }),
        Finished: (_, { model }) => ({
          model: { ...model, done: DURATION },
          state: { _tag: 'Done' },
        }),
      },
    },
    Paused: {
      on: {
        Resume: (_, { at }) => ({ state: { _tag: 'Downloading', since: at } }),
      },
    },
  },
});
