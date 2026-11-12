import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Step, Trail as Told } from '../../../api/index.ts';
import { KabukiSession } from '../../kabuki-session/index.ts';
import { Zoom } from './capabilities/zoom.ts';

/*
 * The Trail: one Instance zoomed in on, its story along the History as the
 * Kabuki Session tells it, drawn by its View (./ui).
 *
 * 1. Read   the Trail along the Branch in view, again at each change of
 *           the app, as it grows, and when another Branch comes into view.
 * 2. Pick   a moment: the app Time Travels to its Step, and the Inspector
 *           zooms back out to the whole tree there, the Instance's card
 *           open unless the moment stopped it; or back out as it was.
 */

const Props = Schema.Struct({
  /** Counts the app's changes, so the Trail is read again as it grows. */
  revision: Schema.Number,
  /** The Step shown; null for the Head. */
  at: Schema.NullOr(Step),
  /** An entry on the Branch in view, the Trail's; null for the Head's. */
  branch: Schema.NullOr(Schema.Number),
});

export const Trail = Actor.define('Trail', {
  requires: [KabukiSession, Zoom],
  input: Schema.Struct({ instance: Schema.String }),
  props: Props,
  model: Schema.Struct({
    instance: Schema.String,
    trail: Schema.NullOr(Told),
    /** Why the last read failed. */
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Read: { trail: Told },
    Failed: { problem: Schema.String },
    /** A moment picked: its Step, and whether its Instance is there to open. */
    Picked: { step: Step, open: Schema.Boolean },
    Closed: {},
  }),
});

const land = Command.make('land', {
  args: Schema.Struct({ id: Schema.NullOr(Schema.String), step: Step }),
  run: ({ id, step }) => Effect.flatMap(Zoom, (zoom) => zoom.land(id, step)),
});

const out = Command.make('out', {
  run: () => Effect.flatMap(Zoom, (zoom) => zoom.out),
});

export const TrailLive = Trail.build({
  init: ({ instance }) => ({ model: { instance, trail: null, problem: null } }),
  // 1. Read
  workers: {
    read: {
      each: ({ props }) => [`${props.revision}:${props.branch ?? 'head'}`],
      run: (self) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const session = yield* KabukiSession;
          const { instance } = model;
          yield* session
            .trail(
              props.branch === null
                ? { instance }
                : { instance, branch: props.branch },
            )
            .pipe(
              Effect.matchEffect({
                onSuccess: (trail) => self.send({ _tag: 'Read', trail }),
                onFailure: (error) =>
                  self.send({
                    _tag: 'Failed',
                    problem:
                      error._tag === 'InstanceNotFound'
                        ? 'This Instance has no place in the app.'
                        : error._tag === 'StepNotFound'
                          ? 'This Branch is no longer kept.'
                          : 'The Kabuki Session did not answer.',
                  }),
              }),
            );
        }),
    },
  },
  on: {
    Read: ({ trail }, { model }) => ({
      model: { ...model, trail, problem: null },
    }),
    Failed: ({ problem }, { model }) => ({ model: { ...model, problem } }),
    // 2. Pick
    Picked: ({ step, open }, { model }) => ({
      command: land({ id: open ? model.instance : null, step }),
    }),
    Closed: () => ({ command: out() }),
  },
});
