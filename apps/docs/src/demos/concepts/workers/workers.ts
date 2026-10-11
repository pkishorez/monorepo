import { Duration, Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';

/** Milliseconds until the next multiple of `every` after `since`, from `now`. */
const untilNext = (now: number, since: number, every: number) =>
  Duration.millis(every - ((now - since) % every));

/**
 * A clock with one Worker per kind of Condition. Every Worker works out its
 * wait from the Time (self.now) and what is in the Model, so it waits only
 * what is left when it starts again after a stop or a fork.
 *
 * - tick: owned by the Instance itself; Ticked every second.
 * - run: written in the Running block, so owned by that State; Ran every
 *   250 ms, counted in the State.
 * - blink: owned by a yes or no, model.armed; Blinked every 400 ms.
 * - countdown: one per key in model.countdowns; CountedDown 3 s after it was
 *   added. Its Finalizer only logs: the Update that removed the key already
 *   recorded why, with its Time.
 */
export const Clock = Actor.make('Clock', {
  model: Schema.Struct({
    ticks: Schema.Number,
    armed: Schema.Boolean,
    blink: Schema.Boolean,
    countdowns: Schema.Array(
      Schema.Struct({ key: Schema.String, startedAt: Schema.Number }),
    ),
    nextCountdown: Schema.Number,
    done: Schema.Array(Schema.String),
  }),
  state: Schema.TaggedUnion({
    Stopped: {},
    Running: { since: Schema.Number, ran: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    Toggle: {},
    Arm: {},
    AddCountdown: {},
    Ticked: {},
    Ran: {},
    Blinked: {},
    CountedDown: { key: Schema.String },
  }),
}).build({
  init: () => ({
    model: {
      ticks: 0,
      armed: false,
      blink: false,
      countdowns: [],
      nextCountdown: 1,
      done: [],
    },
    state: { _tag: 'Stopped' },
  }),
  on: {
    Ticked: (_, { model }) => ({
      model: { ...model, ticks: model.ticks + 1 },
    }),
    Arm: (_, { model }) => ({ model: { ...model, armed: !model.armed } }),
    Blinked: (_, { model }) => ({ model: { ...model, blink: !model.blink } }),
    AddCountdown: (_, { model, at }) => ({
      model: {
        ...model,
        countdowns: [
          ...model.countdowns,
          { key: `c${model.nextCountdown}`, startedAt: at },
        ],
        nextCountdown: model.nextCountdown + 1,
      },
    }),
    CountedDown: ({ key }, { model }) => ({
      model: {
        ...model,
        countdowns: model.countdowns.filter((c) => c.key !== key),
        done: [...model.done, key],
      },
    }),
  },
  workers: {
    tick: {
      run: (self) =>
        Effect.gen(function* () {
          yield* Effect.sleep(untilNext(yield* self.now, 0, 1000));
          yield* self.send({ _tag: 'Ticked' });
        }).pipe(Effect.forever),
    },
    blink: {
      while: ({ model }) => model.armed,
      run: (self) =>
        Effect.gen(function* () {
          yield* Effect.sleep(untilNext(yield* self.now, 0, 400));
          yield* self.send({ _tag: 'Blinked' });
        }).pipe(Effect.forever),
    },
    countdown: {
      each: ({ model }) => model.countdowns.map((c) => c.key),
      run: (self, key) =>
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            Effect.logDebug(`countdown ${key} closed`),
          );
          const { model } = yield* self.get;
          const startedAt =
            model.countdowns.find((c) => c.key === key)?.startedAt ?? 0;
          const left = startedAt + 3000 - (yield* self.now);
          yield* Effect.sleep(Duration.millis(Math.max(0, left)));
          yield* self.send({ _tag: 'CountedDown', key });
        }),
    },
  },
  state: {
    Stopped: {
      on: {
        Toggle: (_, { at }) => ({
          state: { _tag: 'Running', since: at, ran: 0 },
        }),
      },
    },
    Running: {
      on: {
        Toggle: () => ({ state: { _tag: 'Stopped' } }),
        // New data in the same State: not a Transition, the Worker runs on.
        Ran: (_, { state }) => ({ state: { ...state, ran: state.ran + 1 } }),
      },
      workers: {
        run: {
          run: (self) =>
            Effect.gen(function* () {
              const { state } = yield* self.get;
              yield* Effect.sleep(untilNext(yield* self.now, state.since, 250));
              yield* self.send({ _tag: 'Ran' });
            }).pipe(Effect.forever),
        },
      },
    },
  },
});
