import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Steps } from './capabilities/steps.ts';

/*
 * The Timeline: every Step on the Branch in view, drawn by its View
 * (./ui), and what picking one asks of whoever placed it.
 *
 * 1. Step    one picked, or stepped back or forward to along the Branch
 *            in view; or the Head again. Where the History goes on from
 *            the Step shown in more than one way, any entry that follows
 *            it, its Branch brought into view.
 * 2. Play    each Step in turn, one every TICK, from the first when at
 *            the Head, and the Head again at the last. One wait per Step
 *            shown, so a busy app changing meanwhile never starts it over.
 * 3. Fork    move the app's Head to the Step shown, so the next Message
 *            grows a new Branch, and stop playing; or switch Travel the
 *            app.
 */

const TICK = 1400;

export const Tick = Schema.Struct({
  /** The entry the Step is right after. */
  id: Schema.Number,
  label: Schema.String,
  /** What came of its Message: a rule took it, or none did. */
  tone: Schema.Literals(['took', 'ignored']),
});

/** An entry that follows the Step shown, where more than one Branch goes on from it. */
export const Next = Schema.Struct({
  ...Tick.fields,
  /** Whether it is the next on the Branch in view. */
  on: Schema.Boolean,
});

export const Timeline = Actor.define('Timeline', {
  requires: [Steps],
  props: Schema.Struct({
    ticks: Schema.Array(Tick),
    /** The tick shown; -1 at the History's start, before the first; null at the Head. */
    at: Schema.NullOr(Schema.Number),
    /** Every entry that follows the Step shown, if more than one Branch goes on from it; else none. */
    next: Schema.Array(Next),
    /** Whether the app's Runtime is running, or stopped. */
    running: Schema.Boolean,
    /** Whether a Step picked Time Travels the app. */
    travel: Schema.Boolean,
    /** Under the canvas, or over it, right under the app it travels. */
    place: Schema.Literals(['top', 'bottom']),
  }),
  model: Schema.Struct({ playing: Schema.Boolean }),
  message: Schema.TaggedUnion({
    Picked: { at: Schema.NullOr(Schema.Number) },
    /** An entry that follows the Step shown, picked, by its id. */
    Branched: { id: Schema.Number },
    Played: { playing: Schema.Boolean },
    Forked: {},
    Travelled: { travel: Schema.Boolean },
  }),
});

const choose = Command.make('choose', {
  args: Schema.Struct({ step: Schema.NullOr(Schema.Number) }),
  run: ({ step }) => Effect.flatMap(Steps, (steps) => steps.choose(step)),
});

const branch = Command.make('branch', {
  args: Schema.Struct({ id: Schema.Number }),
  run: ({ id }) => Effect.flatMap(Steps, (steps) => steps.branch(id)),
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
        model.playing ? [`${props.at ?? 'head'}`] : [],
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
    Branched: ({ id }) => ({
      model: { playing: false },
      command: branch({ id }),
    }),
    // 2. Play: from the first Step when at the Head, which has nothing after it.
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
