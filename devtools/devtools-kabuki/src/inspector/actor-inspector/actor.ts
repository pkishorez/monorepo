import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Entry, Now, Step } from '../../api/index.ts';
import { KabukiSession } from '../kabuki-session/index.ts';
import { CanvasLive, Opening } from './actor-canvas/index.ts';
import { TimelineLive, Steps } from './actor-timeline/index.ts';
import type { Tick } from './actor-timeline/index.ts';

/*
 * The Inspector: one Kabuki Session at any Step of its History, read and
 * moved only through the Kabuki Session Api (`KabukiSession`), drawn as
 * the canvas over the Timeline.
 *
 * 1. Watch    where the app is, and its Branch, as the Kabuki Session
 *             tells it: now, and after every change.
 * 2. Step     the newest as it comes, or one picked on the Timeline. With
 *             Travel the app on, as it is at first unless placed otherwise,
 *             the Step shown is the app's own: picking one Time Travels the
 *             app, read only until it goes live again, and Fork carries on
 *             from it on a new Branch. Off, only the Inspector looks back;
 *             the app runs on. Switched, the Step shown stays shown.
 * 3. Opened   the cards open, as many as the reader opened, by Instance.
 *             A Step looked back at opens the card its Message was for and
 *             brings it into view; moving on closes it again, unless the
 *             reader opened it, and the reader closing it keeps it closed
 *             for that Step.
 * 4. Present  only the canvas, the Step the app shows, the whole tree kept
 *             in view as it changes, nothing to press.
 */

const Look = Schema.Struct({
  /** Only the canvas, for a talk or a recording. */
  presenting: Schema.Boolean,
  /** Where the Timeline sits: under the canvas, or over it. */
  place: Schema.Literals(['top', 'bottom']),
});

const Model = Schema.Struct({
  look: Look,
  travel: Schema.Boolean,
  /** The Step the Inspector shows on its own, Travel the app off; null live. */
  own: Schema.NullOr(Step),
  /** Where the app is, as last told; null until it first is. */
  now: Schema.NullOr(Now),
  /** The Head's Branch, oldest first. */
  entries: Schema.Array(Entry),
  /** The cards the reader opened, by Instance. */
  opened: Schema.Array(Schema.String),
  /** The Step whose card, opened by looking back at it, the reader closed. */
  closed: Schema.NullOr(Schema.Number),
  /** Why the Kabuki Session did not answer, last time it was asked. */
  problem: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

export const Inspector = Actor.define('Inspector', {
  requires: [KabukiSession],
  input: Schema.Struct({
    /** Whether a Step picked Time Travels the app at first. */
    travel: Schema.Boolean,
    look: Look,
  }),
  model: Model,
  message: Schema.TaggedUnion({
    Heard: { now: Now, entries: Schema.Array(Entry) },
    Failed: { problem: Schema.String },
    Chosen: { step: Schema.NullOr(Schema.Number) },
    Forked: {},
    Travelled: { travel: Schema.Boolean },
    Opened: { id: Schema.String, open: Schema.Boolean },
  }),
});

const problemOf = (error: { readonly _tag: string }) =>
  error._tag === 'StepNotFound'
    ? 'This Step is no longer kept.'
    : 'The Kabuki Session did not answer.';

const short = (id: string) => id.split('/').at(-1) ?? id;

/** What came of a Step's Message: a rule took it, or none did, its Instance there or gone. */
const outcomeOf = (outcome: Entry['outcome']) =>
  outcome === 'handled'
    ? { tone: 'took' as const, said: '' }
    : outcome === 'ignored'
      ? { tone: 'ignored' as const, said: ' · no rule took it' }
      : { tone: 'ignored' as const, said: ' · its Instance was gone' };

/** What the Inspector shows, from its Model: the Step, and the cards open at it. */
export const shownOf = (model: Model) => {
  const { entries, now } = model;
  const app = now?.shown ?? null;
  // 4. Present: the Step the app shows, init included.
  if (model.look.presenting)
    return {
      shown: null,
      index: entries.length - 1,
      at: typeof app === 'number' || app === 'init' ? app : null,
      followed: undefined,
      open: [],
    };
  // 2. Step: the app's own, or the Inspector's own; init is before the first.
  const shown = model.travel ? app : model.own;
  const index =
    shown === null
      ? entries.length - 1
      : entries.findIndex(({ id }) => id === shown);
  const step = entries[index];
  // 3. Opened: the reader's, and the card the Step looked back at was for.
  const followed =
    shown !== null && step && model.closed !== step.id
      ? step.destination
      : undefined;
  return {
    shown,
    index,
    at: shown === null ? null : (step?.id ?? ('init' as const)),
    followed,
    open: [
      ...model.opened.filter((one) => one !== followed),
      ...(followed ? [followed] : []),
    ],
  };
};

const ticksOf = (
  entries: ReadonlyArray<Entry>,
): ReadonlyArray<typeof Tick.Type> =>
  entries.map((entry) => {
    const { tone, said } = outcomeOf(entry.outcome);
    return {
      id: entry.id,
      label: `${entry.tag.split('/').at(-1)} → ${short(entry.destination)}${said}`,
      tone,
    };
  });

// 2. Step
const travel = Command.make('travel', {
  args: Schema.Struct({ step: Schema.NullOr(Step) }),
  run: ({ step }) =>
    Effect.flatMap(KabukiSession, (session) => session.travel({ step })).pipe(
      Effect.matchEffect({
        onSuccess: () => Effect.void,
        onFailure: (error) =>
          Effect.succeed({
            _tag: 'Failed' as const,
            problem: problemOf(error),
          }),
      }),
    ),
});

const fork = Command.make('fork', {
  args: Schema.Struct({ from: Schema.NullOr(Schema.Number) }),
  run: ({ from }) =>
    Effect.flatMap(KabukiSession, (session) => session.fork({ from })).pipe(
      Effect.matchEffect({
        onSuccess: () => Effect.void,
        onFailure: (error) =>
          Effect.succeed({
            _tag: 'Failed' as const,
            problem: problemOf(error),
          }),
      }),
    ),
});

export const InspectorLive = Actor.build(Inspector, {
  init: (input) => ({
    model: {
      look: input.look,
      travel: input.travel,
      own: null,
      now: null,
      entries: [],
      opened: [],
      closed: null,
      problem: null,
    },
  }),
  provides: (self) =>
    Layer.mergeAll(
      Layer.succeed(Steps, {
        choose: (step) => self.send({ _tag: 'Chosen', step }),
        fork: self.send({ _tag: 'Forked' }),
        travel: (on) => self.send({ _tag: 'Travelled', travel: on }),
      }),
      Layer.succeed(Opening, {
        open: (id, open) => self.send({ _tag: 'Opened', id, open }),
      }),
    ),
  children: (child) => ({
    // Once the Kabuki Session first says where the app is.
    canvas: child(CanvasLive, {
      while: ({ model }) => model.now !== null,
      props: ({ model }) => {
        const { at, followed, open } = shownOf(model);
        return {
          at,
          revision: model.now?.revision ?? 0,
          opened: open,
          bring:
            followed && typeof at === 'number'
              ? { id: followed, key: `step:${at}` }
              : null,
          follow: model.look.presenting,
        };
      },
    }),
    timeline: child(TimelineLive, {
      while: ({ model }) => model.now !== null && !model.look.presenting,
      props: ({ model }) => {
        const { shown, index } = shownOf(model);
        return {
          ticks: ticksOf(model.entries),
          at: shown === null ? null : index,
          travel: model.travel,
          place: model.look.place,
        };
      },
    }),
  }),
  // 1. Watch
  workers: {
    watch: {
      run: (self) =>
        Effect.gen(function* () {
          const session = yield* KabukiSession;
          yield* session.watch().pipe(
            Stream.mapEffect((now) =>
              Effect.map(session.history({}), ({ entries }) => ({
                now,
                entries,
              })),
            ),
            Stream.runForEach(({ now, entries }) =>
              self.send({ _tag: 'Heard', now, entries }),
            ),
            Effect.catch((error) =>
              self.send({ _tag: 'Failed', problem: problemOf(error) }),
            ),
          );
        }),
    },
  },
  on: {
    Heard: ({ now, entries }, { model }) => ({
      model: { ...model, now, entries, problem: null },
    }),
    Failed: ({ problem }, { model }) => ({ model: { ...model, problem } }),
    // 2. Step
    Chosen: ({ step }, { model }) =>
      model.travel
        ? { command: travel({ step }) }
        : { model: { ...model, own: step } },
    Forked: (_, { model }) => {
      const { shown } = shownOf(model);
      return { command: fork({ from: shown === 'init' ? null : shown }) };
    },
    Travelled: ({ travel: on }, { model }) => {
      if (on)
        return {
          model: { ...model, travel: on },
          ...(model.own !== null
            ? { command: travel({ step: model.own }) }
            : {}),
        };
      return {
        model: { ...model, travel: on, own: shownOf(model).shown },
        command: travel({ step: null }),
      };
    },
    // 3. Opened
    Opened: ({ id, open }, { model }) => {
      const { followed, at } = shownOf(model);
      const rest = model.opened.filter((one) => one !== id);
      return {
        model: {
          ...model,
          opened: open ? [...rest, id] : rest,
          closed:
            !open && id === followed && typeof at === 'number'
              ? at
              : model.closed,
        },
      };
    },
  },
});
