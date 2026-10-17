import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

// Three States; while Running, it knows when its current stretch began.
// The Model keeps the time banked before that, and every lap's total.
export const Stopwatch = Actor.define('Stopwatch', {
  state: Schema.TaggedUnion({
    Idle: {},
    Running: { since: Schema.Number },
    Paused: {},
  }),
  model: Schema.Struct({
    elapsed: Schema.Number,
    laps: Schema.Array(Schema.Number),
  }),
  message: Schema.TaggedUnion({
    Started: {},
    Ticked: {},
    Lapped: {},
    Paused: {},
    Reset: {},
  }),
});

// Every Update is handed `at`, the Message's time in milliseconds. So the
// time so far is what was banked, plus how long this stretch has run.
const total = (elapsed: number, since: number, at: number) =>
  elapsed + at - since;

export const StopwatchLive = Actor.build(Stopwatch, {
  init: () => ({ state: { _tag: 'Idle' }, model: { elapsed: 0, laps: [] } }),
  state: {
    Idle: {
      on: {
        Started: (_, { at }) => ({ state: { _tag: 'Running', since: at } }),
      },
    },
    Running: {
      // Lives only in Running: it starts with the stopwatch, and stops the
      // moment it leaves Running. One Tick a second keeps the History short.
      workers: {
        tick: {
          run: (self) =>
            Effect.forever(
              Effect.sleep('1 second').pipe(
                Effect.andThen(self.send({ _tag: 'Ticked' })),
              ),
            ),
        },
      },
      on: {
        // Bank the stretch so far and start a new one. Same State, new data:
        // the Worker keeps running.
        Ticked: (_, { model, state, at }) => ({
          state: { _tag: 'Running', since: at },
          model: { ...model, elapsed: total(model.elapsed, state.since, at) },
        }),
        Lapped: (_, { model, state, at }) => ({
          model: {
            ...model,
            laps: [...model.laps, total(model.elapsed, state.since, at)],
          },
        }),
        Paused: (_, { model, state, at }) => ({
          state: { _tag: 'Paused' },
          model: { ...model, elapsed: total(model.elapsed, state.since, at) },
        }),
      },
    },
    Paused: {
      on: {
        Started: (_, { at }) => ({ state: { _tag: 'Running', since: at } }),
        Reset: () => ({
          state: { _tag: 'Idle' },
          model: { elapsed: 0, laps: [] },
        }),
      },
    },
  },
});
