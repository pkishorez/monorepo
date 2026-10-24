import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { GESTURES, Gesture } from '../gestures/index.ts';
import { Delegate, Tracker } from '../tracker/index.ts';

/*
 * The playground, the app's one Actor: whether the camera is on, the
 * settings, and every gesture seen so far. Turning it on starts the
 * Tracker as a Worker of the `On` State; turning it off, or a failure,
 * leaves that State, which interrupts the Worker and lets the camera go.
 * Each gesture fired is a Message, so the Timeline in the devtools shows
 * them all. The points themselves, 30 times a second, never are: the
 * stage reads them from the Tracker straight.
 */

const Hand = Schema.NullOr(Schema.Literals(['A', 'B']));

const Seen = Schema.Struct({
  /** Its place among every gesture seen: what the log keys on. */
  n: Schema.Number,
  gesture: Gesture,
  hand: Hand,
  detail: Schema.String,
});

const Setting = Schema.Literals(['smoothing', 'skeleton']);

/** How many gestures the log keeps, newest first. */
const LOG = 12;

const none = Object.fromEntries(
  GESTURES.map((gesture) => [gesture, 0]),
) as Record<Gesture, number>;

export const Playground = Page.define({
  path: '/',
  requires: [Tracker],
  metadata: {
    title: 'Hands · a gesture playground',
    description:
      'A playground for hand gestures: your camera, MediaPipe on the GPU, and a checklist of every gesture it can read.',
    canonical: 'https://hands.kishore.app/',
  },
  model: Schema.Struct({
    smoothing: Schema.Boolean,
    skeleton: Schema.Boolean,
    /** How many times each gesture fired. */
    counts: Schema.Record(Gesture, Schema.Number),
    /** Every finger count seen, 0 to 5. */
    digits: Schema.Array(Schema.Number),
    log: Schema.Array(Seen),
    seen: Schema.Number,
  }),
  state: Schema.TaggedUnion({
    Off: {},
    /** `delegate` is where the model runs, once it has loaded. */
    On: { loading: Schema.Boolean, delegate: Schema.NullOr(Delegate) },
    Failed: { reason: Schema.String },
  }),
  message: Schema.TaggedUnion({
    Start: {},
    Stop: {},
    Loading: {},
    Ready: { delegate: Delegate },
    Fired: { gesture: Gesture, hand: Hand, detail: Schema.String },
    Failed: { reason: Schema.String },
    Toggled: { setting: Setting },
    Reset: {},
  }),
});

export const PlaygroundLive = Page.build(Playground, {
  init: () => ({
    model: {
      smoothing: true,
      skeleton: true,
      counts: none,
      digits: [],
      log: [],
      seen: 0,
    },
    state: { _tag: 'Off' },
  }),
  workers: {
    // The Tracker reads frames as the settings say, from the first one.
    configure: {
      run: (self) =>
        Effect.flatMap(Tracker, (tracker) =>
          self.changes.pipe(
            Stream.map(({ model }) => model.smoothing),
            Stream.changes,
            Stream.runForEach((smoothing) => tracker.configure({ smoothing })),
          ),
        ),
    },
  },
  on: {
    Toggled: ({ setting }, { model }) => ({
      model: { ...model, [setting]: !model[setting] },
    }),
    Reset: (_, { model }) => ({
      model: { ...model, counts: none, digits: [], log: [] },
    }),
  },
  state: {
    Off: {
      on: {
        Start: () => ({
          state: { _tag: 'On', loading: false, delegate: null },
        }),
      },
    },
    Failed: {
      on: {
        Start: () => ({
          state: { _tag: 'On', loading: false, delegate: null },
        }),
      },
    },
    On: {
      workers: {
        track: {
          run: (self) =>
            Effect.gen(function* () {
              const tracker = yield* Tracker;
              yield* tracker.track.pipe(
                Stream.runForEach((signal) =>
                  self.send(
                    signal._tag === 'Fired'
                      ? { _tag: 'Fired', ...signal.fired }
                      : signal,
                  ),
                ),
                Effect.catch((error) =>
                  self.send({ _tag: 'Failed', reason: error.reason }),
                ),
              );
            }),
        },
      },
      on: {
        Stop: () => ({ state: { _tag: 'Off' } }),
        Loading: (_, { state }) => ({ state: { ...state, loading: true } }),
        Ready: ({ delegate }) => ({
          state: { _tag: 'On', loading: false, delegate },
        }),
        Failed: ({ reason }) => ({ state: { _tag: 'Failed', reason } }),
        Fired: ({ gesture, hand, detail }, { model }) => {
          const n = model.seen + 1;
          const digit = Number(detail);
          return {
            model: {
              ...model,
              counts: { ...model.counts, [gesture]: model.counts[gesture] + 1 },
              digits:
                gesture === 'Count' && !model.digits.includes(digit)
                  ? [...model.digits, digit].sort()
                  : model.digits,
              log: [{ n, gesture, hand, detail }, ...model.log].slice(0, LOG),
              seen: n,
            },
          };
        },
      },
    },
  },
});
