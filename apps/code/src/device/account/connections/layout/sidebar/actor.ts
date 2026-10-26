import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { ConnectionFilter } from '../../store.ts';
import { Connections } from '../../connections.ts';
import { Preferences } from '../../../../store.ts';
import { session } from '../../../../routes/index.ts';
import {
  across,
  Intent,
  Moves,
  Projects,
  Sessions,
} from '../../connection/records/index.ts';
import {
  agreed,
  putMove,
  reload,
  setConnectionFilter,
  setSidebarWidth,
} from './commands.ts';
import { SessionSync } from './session-sync/index.ts';
import { drawnOf, type Read } from './list/rows/drawn.ts';

/*
 * The sidebar: the Projects and Sessions of the Connection chosen, or of every
 * Connection, and what this device marks of them.
 *
 * 1. Connections  the list, as `Connections` says it, for the Connection Filter at
 *              its top, and Reload, which asks Cloud Connect again.
 * 2. Choose    the Connection chosen is the Account's Connection Filter, kept
 *              in its database; one no longer listed shows every Connection.
 *              Nothing is chosen until both the list kept on this device
 *              and the Filter are read. Only the Connections shown are read,
 *              one Query each, keyed by its id, so a Connection not shown
 *              syncs nothing here, and a Connection shown stays read, rows
 *              and all, as the list or the Filter changes around it.
 * 3. Marks     the Unseen marks of each Connection, as `Connections` says them,
 *              each read by its Connection again after every write, from this
 *              tab or another.
 * 4. Open      a Session the keyboard steps to.
 * 4b. Asking   the Sessions whose agent waits on an Agent Question, as
 *              each Connection says them in `Connections`, for their mark.
 * 5. Move      a Session swiped to Settle or un-Settle it, its Undo, or
 *              the Settled List's Un-settle: each put through `Moves`,
 *              which asks its Connection at once. Every Session is drawn
 *              where `Moves` says it goes until the Session as synced
 *              agrees; a swipe is said with its Undo, which asks the
 *              Connection back, and a refusal says why.
 * 6. Width     its width on a wide screen, kept in Preferences: nothing
 *              is drawn until it is read; dragged, it shows at once and
 *              is kept once the drag rests.
 * 7. Sync      the messages of every session it shows are synced at once
 *              (`session-sync/`), whether or not it is on screen, so a
 *              session opened draws them from this device.
 * 8. Ready     once its width and every Connection shown are read from this
 *              device, rows and marks, it can be drawn whole, and its View
 *              says so (`readyOf`), once: Layout waits for it, never for
 *              Cloud Connect or a Connection to answer.
 */

const Listed = Schema.Struct({ id: Schema.String, name: Schema.String });

/** A swipe, to say with its Undo, numbered so each is said once. */
const Told = Schema.Struct({
  n: Schema.Finite,
  connectionId: Schema.String,
  sessionId: Schema.String,
  settled: Schema.Boolean,
  title: Schema.String,
});

const Model = Schema.Struct({
  /** Whether the list kept on this device has been read, kept or not. */
  listRead: Schema.Boolean,
  /** The listed Connections; null before any list. */
  connections: Schema.NullOr(Schema.Array(Listed)),
  /** Why Cloud Connect could not list them, while nothing is listed. */
  problem: Schema.NullOr(Schema.String),
  /** Whether the Connection Filter has been read. */
  filterRead: Schema.Boolean,
  /** The Connection chosen, as the Connection Filter keeps it; null for every Connection. */
  chosen: Schema.NullOr(Schema.String),
  /** Its width on a wide screen, as kept; null until read. */
  width: Schema.NullOr(Schema.Finite),
  /** Each Connection's Unseen marks, by Connection id and then Session id. */
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
  /** The Sessions whose agent waits on an Agent Question, by Connection id. */
  asking: Schema.Record(Schema.String, Schema.Array(Schema.String)),
});

/** A Session's key among the refusals: its Connection's and its own id. */
export const refusedKey = (connectionId: string, sessionId: string) =>
  `${connectionId} ${sessionId}`;
type Model = typeof Model.Type;

const Sidebar = Actor.define('Sidebar', {
  requires: [Connections, ConnectionFilter, Preferences, Moves, Navigation],
  props: Schema.Struct({
    /** The Account drawn, whose Connection Filter it keeps. */
    accountId: Schema.String,
  }),
  model: Model,
  message: Schema.TaggedUnion({
    ConnectionsKnown: {
      read: Schema.Boolean,
      connections: Schema.NullOr(Schema.Array(Listed)),
      problem: Schema.NullOr(Schema.String),
      unseen: Model.fields.unseen,
    },
    FilterRead: { chosen: Schema.NullOr(Schema.String) },
    AskingKnown: { asking: Model.fields.asking },
    WidthRead: { width: Schema.Finite },
    /** Dragged to a new width, once the drag rests. */
    Resized: { width: Schema.Finite },
    ConnectionChosen: { connectionId: Schema.NullOr(Schema.String) },
    ReloadAsked: {},
    SessionOpened: {
      connectionId: Schema.String,
      projectId: Schema.String,
      sessionId: Schema.String,
    },
    /**
     * A Session put: by a swipe, which titles it to say with its Undo, or
     * by its Undo or the Settled List's Un-settle, which do not.
     */
    MoveAsked: {
      connectionId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
      title: Schema.NullOr(Schema.String),
    },
    MovesShown: { moving: Schema.Array(Intent) },
    MoveRefused: {
      connectionId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
      reason: Schema.String,
    },
    /** The Session as synced is where it was put. */
    MoveSeen: {
      connectionId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
    },
    /** Its width and every Connection shown are read: it can be drawn whole. */
    Ready: {},
  }),
});

/** The Connection shown: the one chosen while it is listed, else none, for every Connection. */
export const shownOf = ({ connections, chosen }: Model) =>
  chosen !== null && connections?.some(({ id }) => id === chosen) === true
    ? chosen
    : null;

/** Whether the list and the Filter are read, so what is shown can be chosen. */
export const chosenRead = (model: Model) => model.listRead && model.filterRead;

/** The Connections whose Projects and Sessions are read: none until they can be chosen. */
export const readOf = (model: Model): ReadonlyArray<string> => {
  if (!chosenRead(model)) return [];
  const shown = shownOf(model);
  return shown === null
    ? (model.connections ?? []).map(({ id }) => id)
    : [shown];
};

// 8. Ready
/**
 * Whether it can be drawn whole: its width read, and every Connection shown
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
    (connectionId) => model.unseen[connectionId] !== undefined,
  ) !== null;

const sameListed = Schema.toEquivalence(Model.fields.connections);
const sameUnseen = Schema.toEquivalence(Model.fields.unseen);
const sameAsking = Schema.toEquivalence(Model.fields.asking);

export const SidebarLive = Actor.build(Sidebar, {
  init: () => ({
    model: {
      listRead: false,
      connections: null,
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
      asking: {},
    },
  }),
  children: {
    projects: {
      actor: Projects,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, connectionId) => across.props(connectionId),
    },
    sessions: {
      actor: Sessions,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, connectionId) => across.props(connectionId),
    },
    // 7. Sync
    sessionSync: {
      actor: SessionSync.actor,
      props: ({ model }) => ({ connectionIds: readOf(model) }),
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
    // 1. Connections, 3. Marks: only their ids and names, and their marks, so
    // a link or a Heartbeat changes nothing here.
    known: {
      run: (self) =>
        Effect.flatMap(Connections, ({ state }) =>
          state.pipe(
            Stream.map(({ savedRead, connections, problem, seen }) => ({
              read: savedRead,
              connections:
                connections?.map(({ id, name }) => ({ id, name })) ?? null,
              problem: connections === null ? problem : null,
              unseen: seen,
            })),
            Stream.changesWith(
              (a, b) =>
                a.read === b.read &&
                a.problem === b.problem &&
                sameListed(a.connections, b.connections) &&
                sameUnseen(a.unseen, b.unseen),
            ),
            Stream.runForEach((known) =>
              self.send({ _tag: 'ConnectionsKnown', ...known }),
            ),
          ),
        ),
    },
    // 4b. Asking: only which Sessions ask, so a question's answer as it
    // is typed elsewhere changes nothing here.
    asking: {
      run: (self) =>
        Effect.flatMap(Connections, ({ state }) =>
          state.pipe(
            Stream.map(({ questions }) =>
              Object.fromEntries(
                Object.entries(questions).map(([connectionId, all]) => [
                  connectionId,
                  all
                    .filter(({ questions }) => questions.length > 0)
                    .map(({ sessionId }) => sessionId),
                ]),
              ),
            ),
            Stream.changesWith(sameAsking),
            Stream.runForEach((asking) =>
              self.send({ _tag: 'AskingKnown', asking }),
            ),
          ),
        ),
    },
    // 2. Choose
    filter: {
      run: (self) =>
        Effect.flatMap(self.get, ({ props }) =>
          Stream.runForEach(
            ConnectionFilter.follow(props.accountId),
            (chosen) => self.send({ _tag: 'FilterRead', chosen }),
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
    MoveAsked: ({ connectionId, sessionId, settled, title }, { model }) => ({
      ...(title === null
        ? {}
        : {
            model: {
              ...model,
              told: {
                n: (model.told?.n ?? 0) + 1,
                connectionId,
                sessionId,
                settled,
                title,
              },
            },
          }),
      command: putMove({ connectionId, sessionId, settled }),
    }),
    MovesShown: ({ moving }, { model }) => ({ model: { ...model, moving } }),
    MoveRefused: ({ connectionId, sessionId, settled, reason }, { model }) => {
      const key = refusedKey(connectionId, sessionId);
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
    ConnectionsKnown: ({ read, connections, problem, unseen }, { model }) => ({
      model: { ...model, listRead: read, connections, problem, unseen },
    }),
    AskingKnown: ({ asking }, { model }) => ({ model: { ...model, asking } }),
    FilterRead: ({ chosen }, { model }) => ({
      model: { ...model, filterRead: true, chosen },
    }),
    // Shown at once, and kept.
    ConnectionChosen: ({ connectionId }, { model, props }) => ({
      model: { ...model, chosen: connectionId },
      command: setConnectionFilter({
        accountId: props.accountId,
        connectionId,
      }),
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
    SessionOpened: ({ connectionId, projectId, sessionId }) => ({
      command: Router.push(session(connectionId, projectId, sessionId)),
    }),
  },
});
