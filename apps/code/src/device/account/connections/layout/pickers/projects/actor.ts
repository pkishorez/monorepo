import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients, type Project, type Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { ConnectionFilter } from '../../../store.ts';
import { Connections } from '../../../connections.ts';
import { project } from '../../../../../routes/index.ts';
import {
  everything,
  type OnConnection,
} from '../../../connection/records/index.ts';
import { tilde } from '../../../../../../ui/labels/path/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';
import { FolderPicker } from './folders/index.ts';

/*
 * The Project Picker: where to work next.
 *
 * 1. Connection  the first Step picks the Connection, skipped while there is
 *             only one, or while the Connection Filter shows one listed:
 *             the Picker opens on that Connection's Projects.
 * 2. Recent   the Connection's Projects, the most recently active first: a
 *             Turn started or a Session made in it, else when it was
 *             added. One whose folder is missing shows so, and cannot be
 *             chosen. Followed while the Picker is open.
 * 3. Pick     a Project opens it, which is a new Session in it. After the
 *             Projects, "Open folder…" goes to the folder Steps
 *             (`folders/`), searching what was typed, so text that
 *             names no Project, then Enter, looks for it under the
 *             Connection's home.
 * 4. Folder   a folder chosen, or created, becomes a Project while the
 *             Picker waits, and opens as it closes; one whose `git init`
 *             failed opens with a warning.
 * Either way the keyboard goes on to the page, to write the first message,
 * wherever the Picker was opened from, and by touch as by keys: a Project
 * picked opens its new session's page.
 */

const OPEN_FOLDER = 'open-folder';

const Recent = Schema.Struct({
  connectionId: Schema.String,
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  /** Whether its folder is there, as its Connection last found it. */
  missing: Schema.Boolean,
});
type Recent = typeof Recent.Type;

/** A Connection, as the first Step lists it. */
const Listed = Schema.Struct({ id: Schema.String, name: Schema.String });

const sameListed = Schema.toEquivalence(Schema.Array(Listed));

/**
 * The Step it opens at: the Projects of the Connection the Connection Filter
 * shows, while it is listed, or of the only one; else the Connections.
 */
export const firstStep = (
  connections: ReadonlyArray<typeof Listed.Type>,
  filter: string | null,
) => {
  const [only, ...others] = connections;
  const one = connections.some(({ id }) => id === filter)
    ? filter
    : only !== undefined && others.length === 0
      ? only.id
      : null;
  return one === null
    ? { id: 'connection', key: '' }
    : { id: 'recent', key: one };
};

const Projects = Picker.make('ProjectPicker', {
  props: Schema.Struct({
    connections: Schema.Array(Listed),
    recent: Schema.NullOr(Schema.Array(Recent)),
  }),
  steps: {
    // 1. Connection
    connection: {
      placeholder: () => 'Search your Connections',
      empty: () => 'No Connection by that name',
      rows: ({ props }) => ({
        rows: props.connections.map(({ id, name }) => {
          const count =
            props.recent?.filter(({ connectionId }) => connectionId === id)
              .length ?? null;
          return {
            value: id,
            label: name,
            ...(count === null
              ? {}
              : {
                  detail: `${count} project${count === 1 ? '' : 's'}`,
                }),
          };
        }),
      }),
      next: (row) => ({ id: 'recent', key: row.value }),
    },
    // 2. Recent, 3. Pick: the Step's key is its Connection.
    recent: {
      placeholder: () => 'Search projects, or a folder under home',
      empty: () => 'No project by that name',
      rows: ({ props, key }) => ({
        rows: (props.recent ?? [])
          .filter(({ connectionId }) => connectionId === key)
          .map(({ id, name, path, missing }) => ({
            value: id,
            label: name,
            detail: tilde(path),
            ...(missing
              ? { unavailable: `Folder missing · ${tilde(path)}` }
              : {}),
            group: 'Recent projects',
            icon: 'project' as const,
          })),
        loading: props.recent === null,
      }),
      pinned: ({ query }) => [
        {
          value: OPEN_FOLDER,
          label: 'Open a folder…',
          group: 'New project',
          icon: 'add' as const,
          detail:
            query.trim() === ''
              ? 'Add a folder under home as a project'
              : `Look for “${query.trim()}” under home`,
        },
      ],
      next: (row, { key, query }) =>
        row.value === OPEN_FOLDER
          ? FolderPicker.opens(key, query.trim())
          : null,
    },
    // 4. Folder
    ...FolderPicker.steps,
  },
  // A Project chosen, or a folder made one, opens: the keyboard goes there.
  lands: () => true,
});

/** Projects by when they were last active, the latest first. */
const recentOf = (
  projects: ReadonlyArray<OnConnection<Project>>,
  sessions: ReadonlyArray<OnConnection<Session>>,
): ReadonlyArray<Recent> => {
  const keyOf = (connectionId: string, id: string) => `${connectionId}/${id}`;
  const active = new Map<string, number>();
  for (const { connectionId, projectId, activeAt } of sessions) {
    const key = keyOf(connectionId, projectId);
    active.set(key, Math.max(active.get(key) ?? 0, activeAt));
  }
  const at = (each: OnConnection<Project>) =>
    active.get(keyOf(each.connectionId, each.id)) ?? each.createdAt;
  return [...projects]
    .sort((a, b) => at(b) - at(a))
    .map(({ connectionId, id, name, path, folder }) => ({
      connectionId,
      id,
      name,
      path,
      missing: folder === 'missing',
    }));
};

export const ProjectPicker = Actor.define('ProjectPicker', {
  requires: [CodeClients, Navigation, Replicas, Connections, ConnectionFilter],
  props: Schema.Struct({
    /** The Account drawn, whose Connection Filter it opens on. */
    accountId: Schema.String,
  }),
  model: Schema.Struct({
    /** The Connections it opens projects on, as `Connections` lists them. */
    connections: Schema.Array(Listed),
    /** The Connection the Connection Filter shows, as its Account keeps it; null for every Connection. */
    filter: Schema.NullOr(Schema.String),
    /** How it is open; null while it is not. */
    picking: Schema.NullOr(Picker.How),
    /** Whether its button opened it, which then draws it; else the View Layout keeps does. */
    byButton: Schema.Boolean,
    /** How many times it was opened, so each is a fresh one. */
    opened: Schema.Finite,
    /** Null until read. */
    recent: Schema.NullOr(Schema.Array(Recent)),
    /** The Project a folder became, opened as the Picker closes. */
    added: Schema.NullOr(
      Schema.Struct({ connectionId: Schema.String, projectId: Schema.String }),
    ),
    /** A folder made whose `git init` failed, until dismissed. */
    warning: Schema.NullOr(
      Schema.Struct({ path: Schema.String, reason: Schema.String }),
    ),
  }),
  message: Schema.TaggedUnion({
    ConnectionsKnown: { connections: Schema.Array(Listed) },
    FilterRead: { filter: Schema.NullOr(Schema.String) },
    Open: { how: Picker.How, byButton: Schema.optional(Schema.Boolean) },
    Read: { recent: Schema.Array(Recent) },
    Closed: {},
    Chose: { connectionId: Schema.String, projectId: Schema.String },
    /** The Picker finished on a folder, which was Added. */
    Opened: {},
    Added: {
      connectionId: Schema.String,
      projectId: Schema.String,
      path: Schema.String,
      gitInitError: Schema.NullOr(Schema.String),
    },
    Dismiss: {},
  }),
});

export const ProjectPickerLive = Actor.build(ProjectPicker, {
  init: () => ({
    model: {
      connections: [],
      filter: null,
      picking: null,
      byButton: false,
      opened: 0,
      recent: null,
      added: null,
      warning: null,
    },
  }),
  children: (child) => ({
    picker: child(Projects.Live, {
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: firstStep(model.connections, model.filter),
        choices: [],
      }),
      props: ({ model }) => ({
        connections: model.connections,
        recent: model.recent,
      }),
    }),
  }),
  // The folder Steps call each Connection through the clients this actor has.
  provides: (self) =>
    Layer.unwrap(
      Effect.map(Effect.context<CodeClients>(), (client) =>
        Projects.owner({
          done: (choices, step) => {
            const chosen = choices?.at(-1)?.value;
            return self.send(
              chosen === undefined
                ? { _tag: 'Closed' }
                : step?.id === 'recent'
                  ? { _tag: 'Chose', connectionId: step.key, projectId: chosen }
                  : { _tag: 'Opened' },
            );
          },
          load: ({ key }, query) =>
            FolderPicker.load(key, query).pipe(Effect.provide(client)),
          make: ({ key }, name) =>
            FolderPicker.make(key, name).pipe(Effect.provide(client)),
          // The folder chosen, or made, becomes a Project while it waits.
          settle: (choices, { key }) =>
            FolderPicker.choose(choices, key).pipe(
              Effect.provide(client),
              Effect.flatMap((added) =>
                Effect.as(self.send({ _tag: 'Added', ...added }), null),
              ),
              Effect.catch((reason) => Effect.succeed(reason)),
            ),
        }),
      ),
    ),
  workers: {
    // 1. Connection: their ids and names only, so nothing else of a Connection
    // changes anything here.
    connections: {
      run: (self) =>
        Effect.flatMap(Connections, ({ state }) =>
          state.pipe(
            Stream.map(({ connections }) =>
              (connections ?? []).map(({ id, name }) => ({ id, name })),
            ),
            Stream.changesWith(sameListed),
            Stream.runForEach((connections) =>
              self.send({ _tag: 'ConnectionsKnown', connections }),
            ),
          ),
        ),
    },
    // 1. Connection: the one the Connection Filter shows.
    filter: {
      run: (self) =>
        Effect.flatMap(self.get, ({ props }) =>
          Stream.runForEach(
            ConnectionFilter.follow(props.accountId),
            (filter) => self.send({ _tag: 'FilterRead', filter }),
          ),
        ),
    },
    // 2. Recent, read for the Connections listed while it is open.
    recent: {
      each: ({ model }) =>
        model.picking === null
          ? []
          : [model.connections.map(({ id }) => id).join(' ')],
      run: (self, ids) =>
        Stream.runForEach(
          everything(ids === '' ? [] : ids.split(' ')),
          ({ projects, sessions }) =>
            self.send({ _tag: 'Read', recent: recentOf(projects, sessions) }),
        ),
    },
  },
  on: {
    ConnectionsKnown: ({ connections }, { model }) => ({
      model: { ...model, connections },
    }),
    FilterRead: ({ filter }, { model }) => ({ model: { ...model, filter } }),
    Open: ({ how, byButton }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: {
              ...model,
              picking: how,
              byButton: byButton === true,
              opened: model.opened + 1,
              added: null,
              warning: null,
            },
          },
    Read: ({ recent }, { model }) => ({ model: { ...model, recent } }),
    Closed: (_, { model }) => ({ model: { ...model, picking: null } }),
    // 2. Pick
    Chose: ({ connectionId, projectId }, { model }) => ({
      model: { ...model, picking: null },
      command: Router.push(project(connectionId, projectId)),
    }),
    // 3. Folder
    // Opened once the Picker has closed, so focus goes on to the new page.
    Added: ({ connectionId, projectId, path, gitInitError }, { model }) => ({
      model: {
        ...model,
        added: { connectionId, projectId },
        warning: gitInitError === null ? null : { path, reason: gitInitError },
      },
    }),
    Opened: (_, { model }) => ({
      model: { ...model, picking: null, added: null },
      ...(model.added === null
        ? {}
        : {
            command: Router.push(
              project(model.added.connectionId, model.added.projectId),
            ),
          }),
    }),
    Dismiss: (_, { model }) => ({ model: { ...model, warning: null } }),
  },
});

/** The Picker's own View, for this actor's View to draw. */
export const ProjectsView = Projects.View;
