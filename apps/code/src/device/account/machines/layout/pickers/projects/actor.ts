import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients, type Project, type Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { MachineFilter } from '../../../store.ts';
import { Machines } from '../../../machines.ts';
import { project } from '../../../../../routes/index.ts';
import { everything, type OnMachine } from '../../../machine/records/index.ts';
import { tilde } from '../../../../../../ui/labels/path/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';
import { FolderPicker } from './folders/index.ts';

/*
 * The Project Picker: where to work next.
 *
 * 1. Machine  the first Step picks the Machine, skipped while there is
 *             only one, or while the Machine Filter shows one listed:
 *             the Picker opens on that Machine's Projects.
 * 2. Recent   the Machine's Projects, the most recently active first: a
 *             Turn started or a Session made in it, else when it was
 *             added. One whose folder is missing shows so, and cannot be
 *             chosen. Followed while the Picker is open.
 * 3. Pick     a Project opens it, which is a new Session in it. After the
 *             Projects, "Open folder…" goes to the folder Steps
 *             (`folders/`), searching what was typed, so text that
 *             names no Project, then Enter, looks for it under the
 *             Machine's home.
 * 4. Folder   a folder chosen, or created, becomes a Project while the
 *             Picker waits, and opens as it closes; one whose `git init`
 *             failed opens with a warning.
 * Either way the keyboard goes on to the page, to write the first message,
 * wherever the Picker was opened from, and by touch as by keys: a Project
 * picked opens its new session's page.
 */

const OPEN_FOLDER = 'open-folder';

const Recent = Schema.Struct({
  machineId: Schema.String,
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  /** Whether its folder is there, as its Machine last found it. */
  missing: Schema.Boolean,
});
type Recent = typeof Recent.Type;

/** A Machine, as the first Step lists it. */
const Listed = Schema.Struct({ id: Schema.String, name: Schema.String });

const sameListed = Schema.toEquivalence(Schema.Array(Listed));

/**
 * The Step it opens at: the Projects of the Machine the Machine Filter
 * shows, while it is listed, or of the only one; else the Machines.
 */
export const firstStep = (
  machines: ReadonlyArray<typeof Listed.Type>,
  filter: string | null,
) => {
  const [only, ...others] = machines;
  const one = machines.some(({ id }) => id === filter)
    ? filter
    : only !== undefined && others.length === 0
      ? only.id
      : null;
  return one === null ? { id: 'machine', key: '' } : { id: 'recent', key: one };
};

const Projects = Picker.make('ProjectPicker', {
  props: Schema.Struct({
    machines: Schema.Array(Listed),
    recent: Schema.NullOr(Schema.Array(Recent)),
  }),
  steps: {
    // 1. Machine
    machine: {
      placeholder: () => 'Search your Machines',
      empty: () => 'No Machine by that name',
      rows: ({ props }) => ({
        rows: props.machines.map(({ id, name }) => {
          const count =
            props.recent?.filter(({ machineId }) => machineId === id).length ??
            null;
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
    // 2. Recent, 3. Pick: the Step's key is its Machine.
    recent: {
      placeholder: () => 'Search projects, or a folder under home',
      empty: () => 'No project by that name',
      rows: ({ props, key }) => ({
        rows: (props.recent ?? [])
          .filter(({ machineId }) => machineId === key)
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
  projects: ReadonlyArray<OnMachine<Project>>,
  sessions: ReadonlyArray<OnMachine<Session>>,
): ReadonlyArray<Recent> => {
  const keyOf = (machineId: string, id: string) => `${machineId}/${id}`;
  const active = new Map<string, number>();
  for (const { machineId, projectId, activeAt } of sessions) {
    const key = keyOf(machineId, projectId);
    active.set(key, Math.max(active.get(key) ?? 0, activeAt));
  }
  const at = (each: OnMachine<Project>) =>
    active.get(keyOf(each.machineId, each.id)) ?? each.createdAt;
  return [...projects]
    .sort((a, b) => at(b) - at(a))
    .map(({ machineId, id, name, path, folder }) => ({
      machineId,
      id,
      name,
      path,
      missing: folder === 'missing',
    }));
};

export const ProjectPicker = Actor.define('ProjectPicker', {
  requires: [CodeClients, Navigation, Replicas, Machines, MachineFilter],
  props: Schema.Struct({
    /** The Account drawn, whose Machine Filter it opens on. */
    accountId: Schema.String,
  }),
  model: Schema.Struct({
    /** The Machines it opens projects on, as `Machines` lists them. */
    machines: Schema.Array(Listed),
    /** The Machine the Machine Filter shows, as its Account keeps it; null for every Machine. */
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
      Schema.Struct({ machineId: Schema.String, projectId: Schema.String }),
    ),
    /** A folder made whose `git init` failed, until dismissed. */
    warning: Schema.NullOr(
      Schema.Struct({ path: Schema.String, reason: Schema.String }),
    ),
  }),
  message: Schema.TaggedUnion({
    MachinesKnown: { machines: Schema.Array(Listed) },
    FilterRead: { filter: Schema.NullOr(Schema.String) },
    Open: { how: Picker.How, byButton: Schema.optional(Schema.Boolean) },
    Read: { recent: Schema.Array(Recent) },
    Closed: {},
    Chose: { machineId: Schema.String, projectId: Schema.String },
    /** The Picker finished on a folder, which was Added. */
    Opened: {},
    Added: {
      machineId: Schema.String,
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
      machines: [],
      filter: null,
      picking: null,
      byButton: false,
      opened: 0,
      recent: null,
      added: null,
      warning: null,
    },
  }),
  children: {
    picker: {
      actor: Projects.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: firstStep(model.machines, model.filter),
        choices: [],
      }),
      props: ({ model }) => ({
        machines: model.machines,
        recent: model.recent,
      }),
    },
  },
  // The folder Steps call each Machine through the clients this actor has.
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
                  ? { _tag: 'Chose', machineId: step.key, projectId: chosen }
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
    // 1. Machine: their ids and names only, so nothing else of a Machine
    // changes anything here.
    machines: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ machines }) =>
              (machines ?? []).map(({ id, name }) => ({ id, name })),
            ),
            Stream.changesWith(sameListed),
            Stream.runForEach((machines) =>
              self.send({ _tag: 'MachinesKnown', machines }),
            ),
          ),
        ),
    },
    // 1. Machine: the one the Machine Filter shows.
    filter: {
      run: (self) =>
        Effect.flatMap(self.get, ({ props }) =>
          Stream.runForEach(MachineFilter.follow(props.accountId), (filter) =>
            self.send({ _tag: 'FilterRead', filter }),
          ),
        ),
    },
    // 2. Recent, read for the Machines listed while it is open.
    recent: {
      each: ({ model }) =>
        model.picking === null
          ? []
          : [model.machines.map(({ id }) => id).join(' ')],
      run: (self, ids) =>
        Stream.runForEach(
          everything(ids === '' ? [] : ids.split(' ')),
          ({ projects, sessions }) =>
            self.send({ _tag: 'Read', recent: recentOf(projects, sessions) }),
        ),
    },
  },
  on: {
    MachinesKnown: ({ machines }, { model }) => ({
      model: { ...model, machines },
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
    Chose: ({ machineId, projectId }, { model }) => ({
      model: { ...model, picking: null },
      command: Router.push(project(machineId, projectId)),
    }),
    // 3. Folder
    // Opened once the Picker has closed, so focus goes on to the new page.
    Added: ({ machineId, projectId, path, gitInitError }, { model }) => ({
      model: {
        ...model,
        added: { machineId, projectId },
        warning: gitInitError === null ? null : { path, reason: gitInitError },
      },
    }),
    Opened: (_, { model }) => ({
      model: { ...model, picking: null, added: null },
      ...(model.added === null
        ? {}
        : {
            command: Router.push(
              project(model.added.machineId, model.added.projectId),
            ),
          }),
    }),
    Dismiss: (_, { model }) => ({ model: { ...model, warning: null } }),
  },
});

/** The Picker's own View, for this actor's View to draw. */
export const ProjectsView = Projects.View;
