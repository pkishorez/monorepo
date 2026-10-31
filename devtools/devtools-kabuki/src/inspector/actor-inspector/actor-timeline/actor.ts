import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Steps } from './capabilities/steps.ts';

/*
 * The Timeline: every Step on the Branch in view, drawn by its View
 * (./ui), and what picking one asks of whoever placed it.
 *
 * 1. Step    one picked, or stepped back or forward to; or live again.
 * 2. Play    each Step in turn, one every TICK, from the first when live,
 *            and live again at the last. One wait per Step shown, so a
 *            busy app changing meanwhile never starts it over.
 * 3. Fork    carry on from the Step shown, on a new Branch, and stop
 *            playing; or switch Travel the app.
 */

const TICK = 1400;

export const Tick = Schema.Struct({
  /** The entry the Step is right after. */
  id: Schema.Number,
  label: Schema.String,
  /** What came of its Message: a rule took it, or none did. */
  tone: Schema.Literals(['took', 'ignored']),
});

export const Timeline = Actor.define('Timeline', {
  requires: [Steps],
  props: Schema.Struct({
    ticks: Schema.Array(Tick),
    /** The tick shown; -1 at init, before the first; null while live. */
    at: Schema.NullOr(Schema.Number),
    /** Whether a Step picked Time Travels the app. */
    travel: Schema.Boolean,
    /** Under the canvas, or over it, right under the app it travels. */
    place: Schema.Literals(['top', 'bottom']),
  }),
  model: Schema.Struct({ playing: Schema.Boolean }),
  message: Schema.TaggedUnion({
    Picked: { at: Schema.NullOr(Schema.Number) },
    Played: { playing: Schema.Boolean },
    Forked: {},
    Travelled: { travel: Schema.Boolean },
  }),
});

const choose = Command.make('choose', {
  args: Schema.Struct({ step: Schema.NullOr(Schema.Number) }),
  run: ({ step }) => Effect.flatMap(Steps, (steps) => steps.choose(step)),
});

const fork = Command.make('fork', {
  run: () => Effect.flatMap(Steps, (steps) => steps.fork),
});

const travel = Command.make('travel', {
  args: Schema.Struct({ travel: Schema.Boolean }),
  run: ({ travel: on }) => Effect.flatMap(Steps, (steps) => steps.travel(on)),
});

export const TimelineLive = Timeline.build({
  init: () => ({ model: { playing: false } }),
  // 2. Play
  workers: {
    play: {
      each: ({ model, props }) =>
        model.playing ? [`${props.at ?? 'live'}`] : [],
      run: (self) =>
        Effect.gen(function* () {
          yield* Effect.sleep(TICK);
          const { props } = yield* self.get;
          const { ticks } = props;
          const from = props.at ?? ticks.length - 1;
          const next = ticks[from + 1];
          const steps = yield* Steps;
          if (next && from + 1 < ticks.length - 1)
            return yield* steps.choose(next.id);
          yield* steps.choose(null);
          yield* self.send({ _tag: 'Played', playing: false });
        }),
    },
  },
  on: {
    // 1. Step
    Picked: ({ at }, { props }) => ({
      model: { playing: false },
      command: choose({
        step: at === null ? null : (props.ticks[at]?.id ?? null),
      }),
    }),
    // 2. Play: from the first Step when live, which has nothing after it.
    Played: ({ playing }, { props }) => {
      const first = props.ticks[0];
      return {
        model: { playing },
        ...(playing && props.at === null && first
          ? { command: choose({ step: first.id }) }
          : {}),
      };
    },
    // 3. Fork
    Forked: () => ({ model: { playing: false }, command: fork() }),
    Travelled: ({ travel: on }) => ({ command: travel({ travel: on }) }),
  },
});
