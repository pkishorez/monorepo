import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Entry, Now, Split, Step } from '../../api/index.ts';
import { KabukiSession } from '../kabuki-session/index.ts';
import { CanvasLive, Opening } from './actor-canvas/index.ts';
import { TimelineLive, Steps } from './actor-timeline/index.ts';
import type { Tick } from './actor-timeline/index.ts';
import { TrailLive, Zoom } from './actor-trail/index.ts';

/*
 * The Inspector: one Kabuki Session at any Step of its History, read and
 * moved only through the Kabuki Session Api (`KabukiSession`), drawn as
 * the canvas over the Timeline.
 *
 * 1. Watch    where the app is, and the Branch in view, as the Kabuki
 *             Session tells it: now, and after every change. The Branch in
 *             view is the Head's until another is picked, and the one the
 *             app Seeks when it Seeks a Step off it.
 * 2. Step     the Head as it moves, or one picked on the Timeline: on the
 *             Branch in view, or one that follows the Step shown on
 *             another Branch, which then comes into view. With Travel the
 *             app on, as it is at first unless placed otherwise, the Step
 *             shown is the one the app Seeks: picking one Time Travels the
 *             app, read only until it draws its Head again, and Fork moves
 *             the app's Head to it, so the next Message grows a new Branch.
 *             Off, only the Inspector looks back; the app runs on.
 *             Switched, the Step shown stays shown.
 * 3. Opened   the cards open, as many as the reader opened, by Instance.
 *             A Step looked back at opens the card its Message was for and
 *             brings it into view; moving on closes it again, unless the
 *             reader opened it, and the reader closing it keeps it closed
 *             for that Step.
 * 4. Present  only the canvas, the Step the app shows, the whole tree kept
 *             in view as it changes, nothing to press.
 * 5. View     the app Running, at a Step, over the Timeline; or its
 *             Blueprint, every Actor its root can grow, with no Timeline.
 *             Each keeps its own cards open.
 * 6. Zoom     one Instance zoomed in on, its Trail in place of the canvas,
 *             over the Timeline; a moment picked shows its Step, zoomed
 *             back out, with that Instance's card open.
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
  /** The Step the Inspector shows on its own, Travel the app off; null for the Head. */
  own: Schema.NullOr(Step),
  /** Where the app is, as last told; null until it first is. */
  now: Schema.NullOr(Now),
  /** An entry on the Branch in view; null for the Head's. */
  branch: Schema.NullOr(Schema.Number),
  /** The Branch in view, oldest first. */
  entries: Schema.Array(Entry),
  /** Where it goes on in more than one way. */
  splits: Schema.Array(Split),
  /** The cards the reader opened, by Instance. */
  opened: Schema.Array(Schema.String),
  /** The app Running, or its Blueprint. */
  view: Schema.Literals(['running', 'blueprint']),
  /** The Blueprint's cards the reader opened, by where each sits in the tree. */
  printed: Schema.Array(Schema.String),
  /** The Step whose card, opened by looking back at it, the reader closed. */
  closed: Schema.NullOr(Schema.Number),
  /** The Instance zoomed in on, by Address, its Trail shown; null for the whole tree. */
  trail: Schema.NullOr(Schema.String),
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
    Heard: {
      now: Now,
      entries: Schema.Array(Entry),
      splits: Schema.Array(Split),
    },
    Failed: { problem: Schema.String },
    Chosen: { step: Schema.NullOr(Step) },
    /** An entry that follows the Step shown, picked: its Branch comes into view. */
    Branched: { id: Schema.Number },
    Forked: {},
    Travelled: { travel: Schema.Boolean },
    Opened: { id: Schema.String, open: Schema.Boolean },
    Viewed: { view: Schema.Literals(['running', 'blueprint']) },
    Zoomed: { id: Schema.NullOr(Schema.String) },
    Landed: { id: Schema.NullOr(Schema.String), step: Step },
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

const tickOf = (entry: Entry): typeof Tick.Type => {
  const { tone, said } = outcomeOf(entry.outcome);
  return {
    id: entry.id,
    label: `${entry.tag.split('/').at(-1)} → ${short(entry.to)}${said}`,
    tone,
  };
};

/** What the Inspector shows, from its Model: the Step, and the cards open at it. */
export const shownOf = (model: Model) => {
  const { entries, now } = model;
  const app = now?.seeking ?? null;
  // 4. Present: the Step the app shows, init included.
  if (model.look.presenting)
    return {
      shown: null,
      index: entries.length - 1,
      at: typeof app === 'number' || app === 'init' ? app : null,
      followed: undefined,
      open: [],
      next: [],
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
    shown !== null && step && model.closed !== step.id ? step.to : undefined;
  // Where the Step shown goes on to, if the History goes on from it in more than one way.
  const here = step?.id ?? ('init' as const);
  return {
    shown,
    index,
    at: shown === null ? null : here,
    next: (model.splits.find((split) => split.at === here)?.next ?? []).map(
      (entry) => ({
        ...tickOf(entry),
        on: entries[index + 1]?.id === entry.id,
      }),
    ),
    followed,
    open: [
      ...model.opened.filter((one) => one !== followed),
      ...(followed ? [followed] : []),
    ],
  };
};

// 2. Step
const seek = Command.make('seek', {
  args: Schema.Struct({ step: Schema.NullOr(Step) }),
  run: ({ step }) =>
    Effect.flatMap(KabukiSession, (session) => session.seek({ step })).pipe(
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

export const InspectorLive = Inspector.build({
  init: (input) => ({
    model: {
      look: input.look,
      travel: input.travel,
      own: null,
      now: null,
      branch: null,
      entries: [],
      splits: [],
      opened: [],
      view: 'running',
      printed: [],
      closed: null,
      trail: null,
      problem: null,
    },
  }),
  provides: {
    capabilities: [Steps, Opening, Zoom],
    layer: (self) =>
      Layer.mergeAll(
        Layer.succeed(Steps, {
          choose: (step) => self.send({ _tag: 'Chosen', step }),
          branch: (id) => self.send({ _tag: 'Branched', id }),
          fork: self.send({ _tag: 'Forked' }),
          travel: (on) => self.send({ _tag: 'Travelled', travel: on }),
        }),
        Layer.succeed(Opening, {
          open: (id, open) => self.send({ _tag: 'Opened', id, open }),
          zoom: (id) => self.send({ _tag: 'Zoomed', id }),
        }),
        Layer.succeed(Zoom, {
          land: (id, step) => self.send({ _tag: 'Landed', id, step }),
          out: self.send({ _tag: 'Zoomed', id: null }),
        }),
      ),
  },
  children: {
    // Once the Kabuki Session first says where the app is.
    canvas: Actor.child(CanvasLive, {
      while: ({ model }) => model.now !== null,
      props: ({ model }) => {
        const { at, followed, open } = shownOf(model);
        // 5. View
        const blueprint = model.view === 'blueprint' && !model.look.presenting;
        return {
          at,
          revision: model.now?.revision ?? 0,
          opened: blueprint ? model.printed : open,
          bring:
            !blueprint && followed && typeof at === 'number'
              ? { id: followed, key: `step:${at}` }
              : null,
          follow: model.look.presenting,
          blueprint,
        };
      },
    }),
    // 6. Zoom: keyed by the Instance, so another is read afresh.
    trail: Actor.child(TrailLive, {
      each: ({ model }) =>
        model.trail !== null &&
        model.now !== null &&
        !model.look.presenting &&
        model.view === 'running'
          ? [model.trail]
          : [],
      input: (_, instance) => ({ instance }),
      props: ({ model }) => ({
        revision: model.now?.revision ?? 0,
        at: shownOf(model).at,
        branch: model.branch,
      }),
    }),
    timeline: Actor.child(TimelineLive, {
      while: ({ model }) =>
        model.now !== null &&
        !model.look.presenting &&
        model.view === 'running',
      props: ({ model }) => {
        const { shown, index, next } = shownOf(model);
        return {
          ticks: model.entries.map(tickOf),
          at: shown === null ? null : index,
          next,
          running: model.now?.running ?? true,
          travel: model.travel,
          place: model.look.place,
        };
      },
    }),
  },
  // 1. Watch: again from the start for each Branch in view.
  workers: {
    watch: {
      each: ({ model }) => [model.branch === null ? 'head' : `${model.branch}`],
      run: (self, key) =>
        Effect.gen(function* () {
          const session = yield* KabukiSession;
          const read =
            key === 'head'
              ? session.history({})
              : session.history({ branch: Number(key) }).pipe(
                  // Its entry is no longer kept: the Head's, then.
                  Effect.catchTag('StepNotFound', () => session.history({})),
                );
          yield* session.watch().pipe(
            Stream.mapEffect((now) =>
              Effect.map(read, ({ entries, splits }) => ({
                now,
                entries,
                splits,
              })),
            ),
            Stream.runForEach(({ now, entries, splits }) =>
              self.send({ _tag: 'Heard', now, entries, splits }),
            ),
            Effect.catch((error) =>
              self.send({ _tag: 'Failed', problem: problemOf(error) }),
            ),
          );
        }),
    },
  },
  on: {
    Heard: ({ now, entries, splits }, { model }) => {
      // The app Seeks a Step off the Branch in view: its Branch comes into view.
      const seeking = model.travel ? now.seeking : null;
      const off =
        typeof seeking === 'number' &&
        !entries.some(({ id }) => id === seeking);
      return {
        model: {
          ...model,
          now,
          entries,
          splits,
          branch: off ? seeking : model.branch,
          problem: null,
        },
      };
    },
    Failed: ({ problem }, { model }) => ({ model: { ...model, problem } }),
    // 2. Step: the Head is on the Head's Branch.
    Chosen: ({ step }, { model }) => {
      const branch = step === null ? null : model.branch;
      return model.travel
        ? { model: { ...model, branch }, command: seek({ step }) }
        : { model: { ...model, branch, own: step } };
    },
    Branched: ({ id }, { model }) =>
      model.travel
        ? { model: { ...model, branch: id }, command: seek({ step: id }) }
        : { model: { ...model, branch: id, own: id } },
    // The app's Head moves to the Step shown: its Branch is in view again.
    Forked: (_, { model }) => {
      const { shown } = shownOf(model);
      return {
        model: { ...model, branch: null },
        command: fork({ from: shown === 'init' ? null : shown }),
      };
    },
    Travelled: ({ travel: on }, { model }) => {
      if (on)
        return {
          model: { ...model, travel: on },
          ...(model.own !== null ? { command: seek({ step: model.own }) } : {}),
        };
      return {
        model: { ...model, travel: on, own: shownOf(model).shown },
        command: seek({ step: null }),
      };
    },
    // 3. Opened
    Opened: ({ id, open }, { model }) => {
      if (model.view === 'blueprint') {
        const rest = model.printed.filter((one) => one !== id);
        return { model: { ...model, printed: open ? [...rest, id] : rest } };
      }
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
    // 5. View
    Viewed: ({ view }, { model }) => ({ model: { ...model, view } }),
    // 6. Zoom
    Zoomed: ({ id }, { model }) => ({ model: { ...model, trail: id } }),
    Landed: ({ id, step }, { model }) => {
      const out = {
        ...model,
        trail: null,
        opened: id
          ? [...model.opened.filter((one) => one !== id), id]
          : model.opened,
      };
      return model.travel
        ? { model: out, command: seek({ step }) }
        : { model: { ...out, own: step } };
    },
  },
});
