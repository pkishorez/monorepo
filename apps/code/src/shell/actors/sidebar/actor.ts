import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { DeviceState, Machines } from '../../../layer/capabilities/index.ts';
import { session } from '../../routes/index.ts';
import { across, Projects, Sessions } from '../../replica/index.ts';
import { Intent, Moves } from '../../moves/index.ts';
import { agreed, putMove, reload, setSidebarMachine } from './commands.ts';

/*
 * The sidebar: the Projects and Sessions of the Machine chosen, or of every
 * Machine, and what this device marks of them.
 *
 * 1. Machines  the list, as `Machines` says it, for the Machine Filter at
 *              its top, and Reload, which asks Cloud Connect again.
 * 2. Choose    the Machine chosen is kept in Device State; one no longer
 *              listed shows every Machine. Only the Machines shown are
 *              read, so a Machine not shown syncs nothing here.
 * 3. Marks     the Unseen marks of this device, read again after every
 *              write, from this tab or another.
 * 4. Open      a Session the keyboard steps to.
 * 5. Move      a Session swiped to Settle or un-Settle it, its Undo, or
 *              the Settled List's Un-settle: each put through `Moves`,
 *              which asks its Machine at once. Every Session is drawn
 *              where `Moves` says it goes until the Session as synced
 *              agrees; a swipe is said with its Undo, which asks the
 *              Machine back, and a refusal says why.
 */

const Listed = Schema.Struct({ id: Schema.String, name: Schema.String });

/** A swipe, to say with its Undo, numbered so each is said once. */
const Told = Schema.Struct({
  n: Schema.Finite,
  machineId: Schema.String,
  sessionId: Schema.String,
  settled: Schema.Boolean,
  title: Schema.String,
});

const Model = Schema.Struct({
  /** The listed Machines; null before any list. */
  machines: Schema.NullOr(Schema.Array(Listed)),
  /** Why Cloud Connect could not list them, while nothing is listed. */
  problem: Schema.NullOr(Schema.String),
  /** The Machine chosen, as Device State keeps it; null for every Machine. */
  chosen: Schema.NullOr(Schema.String),
  /** This device's Unseen marks, by Machine id and then Session id. */
  unseen: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, Schema.Finite),
  ),
  /** Where each Session put is going, as `Moves` says, until synced. */
  moving: Schema.Array(Intent),
  /** The last swipe. */
  told: Schema.NullOr(Told),
  /** The last Move refused, numbered so each is said once. */
  refused: Schema.NullOr(
    Schema.Struct({
      n: Schema.Finite,
      settled: Schema.Boolean,
      reason: Schema.String,
    }),
  ),
  /** How many of each Session's Moves were refused, by `refusedKey`. */
  refusals: Schema.Record(Schema.String, Schema.Finite),
});

/** A Session's key among the refusals: its Machine's and its own id. */
export const refusedKey = (machineId: string, sessionId: string) =>
  `${machineId} ${sessionId}`;
type Model = typeof Model.Type;

const Sidebar = Actor.define('Sidebar', {
  requires: [Machines, DeviceState, Moves, Navigation],
  model: Model,
  message: Schema.TaggedUnion({
    MachinesKnown: {
      machines: Schema.NullOr(Schema.Array(Listed)),
      problem: Schema.NullOr(Schema.String),
    },
    DeviceRead: {
      chosen: Schema.NullOr(Schema.String),
      unseen: Model.fields.unseen,
    },
    MachineChosen: { machineId: Schema.NullOr(Schema.String) },
    ReloadAsked: {},
    SessionOpened: {
      machineId: Schema.String,
      projectId: Schema.String,
      sessionId: Schema.String,
    },
    /**
     * A Session put: by a swipe, which titles it to say with its Undo, or
     * by its Undo or the Settled List's Un-settle, which do not.
     */
    MoveAsked: {
      machineId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
      title: Schema.NullOr(Schema.String),
    },
    MovesShown: { moving: Schema.Array(Intent) },
    MoveRefused: {
      machineId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
      reason: Schema.String,
    },
    /** The Session as synced is where it was put. */
    MoveSeen: {
      machineId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
    },
  }),
});

/** The Machine shown: the one chosen while it is listed, else none, for every Machine. */
export const shownOf = ({ machines, chosen }: Model) =>
  chosen !== null && machines?.some(({ id }) => id === chosen) === true
    ? chosen
    : null;

/** The Machines whose Projects and Sessions are read. */
const readOf = (model: Model) => {
  const shown = shownOf(model);
  return shown === null ? (model.machines ?? []).map(({ id }) => id) : [shown];
};

const sameListed = Schema.toEquivalence(Model.fields.machines);

export const SidebarLive = Actor.build(Sidebar, {
  init: () => ({
    model: {
      machines: null,
      problem: null,
      chosen: null,
      unseen: {},
      moving: [],
      told: null,
      refused: null,
      refusals: {},
    },
  }),
  children: {
    projects: {
      actor: Projects,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, key) => across.props(key),
    },
    sessions: {
      actor: Sessions,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, key) => across.props(key),
    },
  },
  workers: {
    // 5. Move: where each Session put goes, and each refusal.
    moves: {
      run: (self) =>
        Effect.flatMap(Moves, ({ intents, refusals }) =>
          Effect.all(
            [
              Stream.runForEach(intents, (moving) =>
                self.send({ _tag: 'MovesShown', moving: [...moving] }),
              ),
              Stream.runForEach(refusals, (refused) =>
                self.send({ _tag: 'MoveRefused', ...refused }),
              ),
            ],
            { concurrency: 'unbounded', discard: true },
          ),
        ),
    },
    // 1. Machines: only their ids and names, so a line or a Heartbeat
    // changes nothing here.
    known: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ machines, problem }) => ({
              machines: machines?.map(({ id, name }) => ({ id, name })) ?? null,
              problem: machines === null ? problem : null,
            })),
            Stream.changesWith(
              (a, b) =>
                a.problem === b.problem && sameListed(a.machines, b.machines),
            ),
            Stream.runForEach((known) =>
              self.send({ _tag: 'MachinesKnown', ...known }),
            ),
          ),
        ),
    },
    // 2. Choose, 3. Marks
    device: {
      run: (self) =>
        Stream.concat(Stream.make(undefined), DeviceState.changes).pipe(
          Stream.runForEach(() =>
            Effect.flatMap(DeviceState.read, ({ sidebarMachine, unseen }) =>
              self.send({ _tag: 'DeviceRead', chosen: sidebarMachine, unseen }),
            ),
          ),
        ),
    },
  },
  on: {
    // 5. Move
    MoveAsked: ({ machineId, sessionId, settled, title }, { model }) => ({
      ...(title === null
        ? {}
        : {
            model: {
              ...model,
              told: {
                n: (model.told?.n ?? 0) + 1,
                machineId,
                sessionId,
                settled,
                title,
              },
            },
          }),
      command: putMove({ machineId, sessionId, settled }),
    }),
    MovesShown: ({ moving }, { model }) => ({ model: { ...model, moving } }),
    MoveRefused: ({ machineId, sessionId, settled, reason }, { model }) => {
      const key = refusedKey(machineId, sessionId);
      return {
        model: {
          ...model,
          refused: { n: (model.refused?.n ?? 0) + 1, settled, reason },
          refusals: {
            ...model.refusals,
            [key]: (model.refusals[key] ?? 0) + 1,
          },
        },
      };
    },
    MoveSeen: (seen) => ({ command: agreed(seen) }),
    MachinesKnown: ({ machines, problem }, { model }) => ({
      model: { ...model, machines, problem },
    }),
    DeviceRead: ({ chosen, unseen }, { model }) => ({
      model: { ...model, chosen, unseen },
    }),
    // Shown at once, and kept.
    MachineChosen: ({ machineId }, { model }) => ({
      model: { ...model, chosen: machineId },
      command: setSidebarMachine({ machineId }),
    }),
    ReloadAsked: () => ({ command: reload() }),
    SessionOpened: ({ machineId, projectId, sessionId }) => ({
      command: Router.push(session(machineId, projectId, sessionId)),
    }),
  },
});
