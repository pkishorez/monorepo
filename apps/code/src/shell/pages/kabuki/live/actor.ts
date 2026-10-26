import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Inspected, Step } from '../inspected.ts';

/*
 * Live: code as it runs, at any Step of its History.
 *
 * 1. Steps    the `steps` Worker follows code's History for as long as
 *             Live lives, and keeps its Steps in the Model.
 * 2. Where    Watching shows the newest Step as it comes; Scrubbing holds
 *             one Step; Playing moves on one Step at a time, its `play`
 *             Worker ticking only while it lasts, and stops at the last.
 * 3. Looking  the cards open, as many as the reader opened: the Model,
 *             whatever the State.
 */

export const Live = Actor.define('Live', {
  requires: [Inspected],
  model: Schema.Struct({
    steps: Schema.Array(Step),
    /** The Instances whose cards are open, in the order they were opened. */
    opened: Schema.Array(Schema.String),
  }),
  state: Schema.TaggedUnion({
    Watching: {},
    /** `entry`: the History entry shown. */
    Scrubbing: { entry: Schema.Number },
    Playing: { entry: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    Grew: { steps: Schema.Array(Step) },
    Chose: { entry: Schema.Number },
    Play: {},
    Pause: {},
    Ticked: {},
    BackToLive: {},
    /** A card opened or closed; the others stay as they are. */
    Toggled: { id: Schema.String, open: Schema.Boolean },
  }),
});

const TICK = '1400 millis';

const ids = (steps: ReadonlyArray<Step>) => steps.map(({ id }) => id);

export const LiveLive = Actor.build(Live, {
  init: () => ({
    model: { steps: [], opened: [] },
    state: { _tag: 'Watching' },
  }),
  workers: {
    // 1. Steps
    steps: {
      run: (self) =>
        Effect.flatMap(Inspected, ({ steps }) =>
          Stream.runForEach(steps, (now) =>
            self.send({ _tag: 'Grew', steps: now }),
          ),
        ),
    },
  },
  on: {
    Grew: ({ steps }, { model }) => ({ model: { ...model, steps } }),
    Chose: ({ entry }) => ({ state: { _tag: 'Scrubbing', entry } }),
    BackToLive: () => ({ state: { _tag: 'Watching' } }),
    // 3. Looking
    Toggled: ({ id, open }, { model }) => ({
      model: {
        ...model,
        opened: open
          ? [...model.opened.filter((one) => one !== id), id]
          : model.opened.filter((one) => one !== id),
      },
    }),
  },
  // 2. Where
  state: {
    Watching: {
      on: {
        // From the first Step: live has nothing after it to play.
        Play: (_, { model }) => {
          const first = model.steps[0];
          return first ? { state: { _tag: 'Playing', entry: first.id } } : {};
        },
      },
    },
    Scrubbing: {
      on: {
        Play: (_, { model, state }) => {
          const all = ids(model.steps);
          const entry =
            all.at(-1) === state.entry ? (all[0] ?? state.entry) : state.entry;
          return { state: { _tag: 'Playing', entry } };
        },
      },
    },
    Playing: {
      workers: {
        play: {
          run: (self) =>
            Effect.forever(
              Effect.andThen(Effect.sleep(TICK), self.send({ _tag: 'Ticked' })),
            ),
        },
      },
      on: {
        Pause: (_, { state }) => ({
          state: { _tag: 'Scrubbing', entry: state.entry },
        }),
        Ticked: (_, { model, state }) => {
          const all = ids(model.steps);
          const next = all[all.indexOf(state.entry) + 1];
          return next === undefined
            ? { state: { _tag: 'Scrubbing', entry: state.entry } }
            : { state: { _tag: 'Playing', entry: next } };
        },
      },
    },
  },
});
