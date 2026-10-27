import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { MachineFilter } from '../../store.ts';
import { Machines } from '../../machines.ts';
import { Preferences } from '../../../../store.ts';
import { session } from '../../../../routes/index.ts';
import {
  across,
  Intent,
  Moves,
  Projects,
  Sessions,
} from '../../machine/records/index.ts';
import {
  agreed,
  putMove,
  reload,
  setMachineFilter,
  setSidebarWidth,
} from './commands.ts';
import { SessionSync } from './session-sync/index.ts';
import { drawnOf, type Read } from './list/rows/drawn.ts';

/*
 * The sidebar: the Projects and Sessions of the Machine chosen, or of every
 * Machine, and what this device marks of them.
 *
 * 1. Machines  the list, as `Machines` says it, for the Machine Filter at
 *              its top, and Reload, which asks Cloud Connect again.
 * 2. Choose    the Machine chosen is the Account's Machine Filter, kept
 *              in its database; one no longer listed shows every Machine.
 *              Nothing is chosen until both the list kept on this device
 *              and the Filter are read. Only the Machines shown are read,
 *              one Query each, keyed by its id, so a Machine not shown
 *              syncs nothing here, and a Machine shown stays read, rows
 *              and all, as the list or the Filter changes around it.
 * 3. Marks     the Unseen marks of each Machine, as `Machines` says them,
 *              each read by its Machine again after every write, from this
 *              tab or another.
 * 4. Open      a Session the keyboard steps to.
 * 5. Move      a Session swiped to Settle or un-Settle it, its Undo, or
 *              the Settled List's Un-settle: each put through `Moves`,
 *              which asks its Machine at once. Every Session is drawn
 *              where `Moves` says it goes until the Session as synced
 *              agrees; a swipe is said with its Undo, which asks the
 *              Machine back, and a refusal says why.
 * 6. Width     its width on a wide screen, kept in Preferences: nothing
 *              is drawn until it is read; dragged, it shows at once and
 *              is kept once the drag rests.
 * 7. Sync      the messages of every session it shows are synced at once
 *              (`session-sync/`), whether or not it is on screen, so a
 *              session opened draws them from this device.
 * 8. Ready     once its width and every Machine shown are read from this
 *              device, rows and marks, it can be drawn whole, and its View
 *              says so (`readyOf`), once: Layout waits for it, never for
 *              Cloud Connect or a Machine to answer.
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
  /** Whether the list kept on this device has been read, kept or not. */
  listRead: Schema.Boolean,
  /** The listed Machines; null before any list. */
  machines: Schema.NullOr(Schema.Array(Listed)),
  /** Why Cloud Connect could not list them, while nothing is listed. */
  problem: Schema.NullOr(Schema.String),
  /** Whether the Machine Filter has been read. */
  filterRead: Schema.Boolean,
  /** The Machine chosen, as the Machine Filter keeps it; null for every Machine. */
  chosen: Schema.NullOr(Schema.String),
  /** Its width on a wide screen, as kept; null until read. */
  width: Schema.NullOr(Schema.Finite),
  /** Each Machine's Unseen marks, by Machine id and then Session id. */
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
  /** Whether it could once be drawn whole, from this device (8. Ready). */
  ready: Schema.Boolean,
});

/** A Session's key among the refusals: its Machine's and its own id. */
export const refusedKey = (machineId: string, sessionId: string) =>
  `${machineId} ${sessionId}`;
type Model = typeof Model.Type;

const Sidebar = Actor.define('Sidebar', {
  requires: [Machines, MachineFilter, Preferences, Moves, Navigation],
  props: Schema.Struct({
    /** The Account drawn, whose Machine Filter it keeps. */
    accountId: Schema.String,
  }),
  model: Model,
  message: Schema.TaggedUnion({
    MachinesKnown: {
      read: Schema.Boolean,
      machines: Schema.NullOr(Schema.Array(Listed)),
      problem: Schema.NullOr(Schema.String),
      unseen: Model.fields.unseen,
    },
    FilterRead: { chosen: Schema.NullOr(Schema.String) },
    WidthRead: { width: Schema.Finite },
    /** Dragged to a new width, once the drag rests. */
    Resized: { width: Schema.Finite },
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
    /** Its width and every Machine shown are read: it can be drawn whole. */
    Ready: {},
  }),
});

/** The Machine shown: the one chosen while it is listed, else none, for every Machine. */
export const shownOf = ({ machines, chosen }: Model) =>
  chosen !== null && machines?.some(({ id }) => id === chosen) === true
    ? chosen
    : null;

/** Whether the list and the Filter are read, so what is shown can be chosen. */
export const chosenRead = (model: Model) => model.listRead && model.filterRead;

/** The Machines whose Projects and Sessions are read: none until they can be chosen. */
export const readOf = (model: Model): ReadonlyArray<string> => {
  if (!chosenRead(model)) return [];
  const shown = shownOf(model);
  return shown === null ? (model.machines ?? []).map(({ id }) => id) : [shown];
};

// 8. Ready
/**
 * Whether it can be drawn whole: its width read, and every Machine shown
 * read from this device, its Projects, Sessions and Unseen marks
 * (`drawnOf`), so it never draws its header alone and then its rows.
 */
export const readyOf = <P, S>(
  model: Model,
  projects: ReadonlyArray<Read<P>>,
  sessions: ReadonlyArray<Read<S>>,
) =>
  model.width !== null &&
  chosenRead(model) &&
  drawnOf(
    readOf(model),
    projects,
    sessions,
    (machineId) => model.unseen[machineId] !== undefined,
  ) !== null;

const sameListed = Schema.toEquivalence(Model.fields.machines);
const sameUnseen = Schema.toEquivalence(Model.fields.unseen);

export const SidebarLive = Actor.build(Sidebar, {
  init: () => ({
    model: {
      listRead: false,
      machines: null,
      problem: null,
      filterRead: false,
      chosen: null,
      width: null,
      unseen: {},
      moving: [],
      told: null,
      refused: null,
      refusals: {},
      ready: false,
    },
  }),
  children: {
    projects: {
      actor: Projects,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, machineId) => across.props(machineId),
    },
    sessions: {
      actor: Sessions,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, machineId) => across.props(machineId),
    },
    // 7. Sync
    sessionSync: {
      actor: SessionSync.actor,
      props: ({ model }) => ({ machineIds: readOf(model) }),
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
    // 1. Machines, 3. Marks: only their ids and names, and their marks, so
    // a line or a Heartbeat changes nothing here.
    known: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ savedRead, machines, problem, seen }) => ({
              read: savedRead,
              machines: machines?.map(({ id, name }) => ({ id, name })) ?? null,
              problem: machines === null ? problem : null,
              unseen: seen,
            })),
            Stream.changesWith(
              (a, b) =>
                a.read === b.read &&
                a.problem === b.problem &&
                sameListed(a.machines, b.machines) &&
                sameUnseen(a.unseen, b.unseen),
            ),
            Stream.runForEach((known) =>
              self.send({ _tag: 'MachinesKnown', ...known }),
            ),
          ),
        ),
    },
    // 2. Choose
    filter: {
      run: (self) =>
        Effect.flatMap(self.get, ({ props }) =>
          Stream.runForEach(MachineFilter.follow(props.accountId), (chosen) =>
            self.send({ _tag: 'FilterRead', chosen }),
          ),
        ),
    },
    // 6. Width, now and after each change, here or in another tab.
    width: {
      run: (self) =>
        Stream.concat(Stream.make(undefined), Preferences.changes).pipe(
          Stream.mapEffect(() => Preferences.read),
          Stream.map(({ sidebarWidth }) => sidebarWidth),
          Stream.changes,
          Stream.runForEach((width) => self.send({ _tag: 'WidthRead', width })),
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
    MachinesKnown: ({ read, machines, problem, unseen }, { model }) => ({
      model: { ...model, listRead: read, machines, problem, unseen },
    }),
    FilterRead: ({ chosen }, { model }) => ({
      model: { ...model, filterRead: true, chosen },
    }),
    // Shown at once, and kept.
    MachineChosen: ({ machineId }, { model, props }) => ({
      model: { ...model, chosen: machineId },
      command: setMachineFilter({ accountId: props.accountId, machineId }),
    }),
    // 6. Width
    WidthRead: ({ width }, { model }) => ({ model: { ...model, width } }),
    Resized: ({ width }, { model }) =>
      width === model.width
        ? {}
        : {
            model: { ...model, width },
            command: setSidebarWidth({ width }),
          },
    ReloadAsked: () => ({ command: reload() }),
    // 8. Ready, once.
    Ready: (_, { model }) =>
      model.ready ? {} : { model: { ...model, ready: true } },
    SessionOpened: ({ machineId, projectId, sessionId }) => ({
      command: Router.push(session(machineId, projectId, sessionId)),
    }),
  },
});
