import { Effect, Schema, Stream } from 'effect';
import type { Project, Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Connections } from '../../../connections.ts';
import { session } from '../../../../../routes/index.ts';
import {
  everything,
  type OnConnection,
} from '../../../connection/records/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';

/*
 * The Session Switcher: every Session to go back to, across Projects and
 * Connections.
 *
 * 1. Read    every Session and its Project's name, and its Connection's while
 *            there is more than one, followed while open:
 *            the unsettled ones, most recently active first, then the
 *            Settled ones, drawn quieter, most recently Settled first.
 * 2. Pick    a Session opens it, and the keyboard goes on to the page,
 *            wherever it was opened from; the one open is checked.
 */

const STATUS = {
  idle: null,
  running: 'running',
  cancelled: 'stopped',
  failed: 'failed',
  interrupted: 'interrupted',
} as const;

const Listed = Schema.Struct({
  connectionId: Schema.String,
  id: Schema.String,
  projectId: Schema.String,
  title: Schema.String,
  project: Schema.String,
  /** How its last Turn stands, when worth saying. */
  status: Schema.NullOr(Schema.String),
  settled: Schema.Boolean,
});
type Listed = typeof Listed.Type;

/** A Session, by its Connection and its id. */
const Here = Schema.Struct({ connectionId: Schema.String, id: Schema.String });

/** A row's value: its Session's Connection and id, which no id holds a space of. */
const valueOf = ({ connectionId, id }: typeof Here.Type) =>
  `${connectionId} ${id}`;

const Sessions = Picker.make('SessionSwitcher', {
  props: Schema.Struct({
    sessions: Schema.NullOr(Schema.Array(Listed)),
    /** The Session open, if one is. */
    open: Schema.NullOr(Here),
  }),
  steps: {
    session: {
      placeholder: () => 'Search sessions',
      empty: () => 'No session by that name',
      rows: ({ props }) => ({
        rows: (props.sessions ?? []).map((each) => ({
          value: valueOf(each),
          label: each.title || 'Untitled session',
          hint:
            each.status === null
              ? each.project
              : `${each.project} · ${each.status}`,
          checked:
            props.open !== null &&
            each.connectionId === props.open.connectionId &&
            each.id === props.open.id,
          ...(each.settled ? { group: 'Settled', quiet: true } : {}),
        })),
        loading: props.sessions === null,
      }),
    },
  },
  // A Session chosen opens: the keyboard goes there.
  lands: () => true,
});

/** 1. Read: the unsettled by activity, then the Settled by when. */
const listOf = (
  projects: ReadonlyArray<OnConnection<Project>>,
  sessions: ReadonlyArray<OnConnection<Session>>,
  connections: ReadonlyMap<string, string>,
): ReadonlyArray<Listed> => {
  const names = new Map(
    projects.map(({ connectionId, id, name }) => [
      `${connectionId}/${id}`,
      name,
    ]),
  );
  const by =
    (at: (each: Session) => number) =>
    (a: OnConnection<Session>, b: OnConnection<Session>) =>
      at(b) - at(a);
  const unsettled = sessions
    .filter(({ settledAt }) => settledAt === null)
    .sort(by(({ activeAt }) => activeAt));
  const settled = sessions
    .filter(({ settledAt }) => settledAt !== null)
    .sort(by(({ settledAt }) => settledAt ?? 0));
  return [...unsettled, ...settled].map((each) => {
    const project = names.get(`${each.connectionId}/${each.projectId}`) ?? '';
    const connection =
      connections.size < 2 ? undefined : connections.get(each.connectionId);
    return {
      connectionId: each.connectionId,
      id: each.id,
      projectId: each.projectId,
      title: each.title,
      project:
        connection === undefined ? project : `${project} · ${connection}`,
      status: STATUS[each.status],
      settled: each.settledAt !== null,
    };
  });
};

/** A Connection, as the Switcher names it. */
const Connection = Schema.Struct({ id: Schema.String, name: Schema.String });
const sameConnections = Schema.toEquivalence(Schema.Array(Connection));

export const SessionSwitcher = Actor.define('SessionSwitcher', {
  requires: [Navigation, Replicas, Connections],
  model: Schema.Struct({
    /** The Connections its Sessions are on, as `Connections` lists them. */
    connections: Schema.Array(Connection),
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    /** The Session open when it was opened. */
    open: Schema.NullOr(Here),
    sessions: Schema.NullOr(Schema.Array(Listed)),
  }),
  message: Schema.TaggedUnion({
    ConnectionsKnown: { connections: Schema.Array(Connection) },
    Open: { how: Picker.How, open: Schema.NullOr(Here) },
    Read: { sessions: Schema.Array(Listed) },
    Closed: {},
    /** The row chosen, by `valueOf`. */
    Chose: { value: Schema.String },
  }),
});

export const SessionSwitcherLive = SessionSwitcher.build({
  init: () => ({
    model: {
      connections: [],
      picking: null,
      opened: 0,
      open: null,
      sessions: null,
    },
  }),
  children: {
    picker: Actor.child(Sessions.Live, {
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: { id: 'session', key: '' },
        choices: [],
      }),
      props: ({ model }) => ({ sessions: model.sessions, open: model.open }),
    }),
  },
  provides: (self) =>
    Sessions.owner({
      done: (choices) => {
        const chosen = choices?.at(-1)?.value;
        return self.send(
          chosen === undefined
            ? { _tag: 'Closed' }
            : { _tag: 'Chose', value: chosen },
        );
      },
    }),
  workers: {
    // 1. Read: the Connections' ids and names only, so nothing else of a
    // Connection changes anything here.
    connections: {
      run: (self) =>
        Effect.flatMap(Connections, ({ state }) =>
          state.pipe(
            Stream.map(({ connections }) =>
              (connections ?? []).map(({ id, name }) => ({ id, name })),
            ),
            Stream.changesWith(sameConnections),
            Stream.runForEach((connections) =>
              self.send({ _tag: 'ConnectionsKnown', connections }),
            ),
          ),
        ),
    },
    // Read again for the Connections listed, while it is open.
    sessions: {
      each: ({ model }) =>
        model.picking === null
          ? []
          : [model.connections.map(({ id }) => id).join(' ')],
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) => {
          const connections = new Map(
            model.connections.map(({ id, name }) => [id, name]),
          );
          return Stream.runForEach(
            everything([...connections.keys()]),
            ({ projects, sessions }) =>
              self.send({
                _tag: 'Read',
                sessions: listOf(projects, sessions, connections),
              }),
          );
        }),
    },
  },
  on: {
    ConnectionsKnown: ({ connections }, { model }) => ({
      model: { ...model, connections },
    }),
    Open: ({ how, open }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: { ...model, picking: how, open, opened: model.opened + 1 },
          },
    Read: ({ sessions }, { model }) => ({ model: { ...model, sessions } }),
    Closed: (_, { model }) => ({ model: { ...model, picking: null } }),
    // 2. Pick
    Chose: ({ value }, { model }) => {
      const found = model.sessions?.find((each) => valueOf(each) === value);
      return {
        model: { ...model, picking: null },
        ...(found === undefined
          ? {}
          : {
              command: Router.push(
                session(found.connectionId, found.projectId, found.id),
              ),
            }),
      };
    },
  },
});

export const SessionsView = Sessions.View;
