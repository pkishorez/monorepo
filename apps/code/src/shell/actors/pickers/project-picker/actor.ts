import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients, type Project, type Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Machines } from '../../../../layer/capabilities/index.ts';
import { project } from '../../../routes/index.ts';
import { everything, type OnMachine } from '../../../machines/index.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { FolderPicker } from './folder-picker/index.ts';

/*
 * The Project Picker: where to work next.
 *
 * 1. Machine  the first Step picks the Machine, skipped while there is
 *             only one.
 * 2. Recent   the Machine's Projects, the most recently active first: a
 *             Turn started or a Session made in it, else when it was
 *             added. Followed while the Picker is open.
 * 3. Pick     a Project opens it, which is a new Session in it. After the
 *             Projects, "Open folder…" goes to the folder Steps
 *             (`folder-picker/`), searching what was typed, so text that
 *             names no Project, then Enter, looks for it under the
 *             Machine's home.
 * 4. Folder   a folder chosen, or created, becomes a Project while the
 *             Picker waits, and opens as it closes; one whose `git init`
 *             failed opens with a warning.
 * Either way the keyboard goes on to the page, to write the first message,
 * wherever the Picker was opened from.
 */

const OPEN_FOLDER = 'open-folder';

const Recent = Schema.Struct({
  machineId: Schema.String,
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
});
type Recent = typeof Recent.Type;

/** A Machine, as the first Step lists it. */
const Listed = Schema.Struct({ id: Schema.String, name: Schema.String });

const sameListed = Schema.toEquivalence(Schema.Array(Listed));

/** The Step it opens at: the Machines, or the one Machine's Projects. */
const firstStep = (machines: ReadonlyArray<typeof Listed.Type>) => {
  const [only, ...others] = machines;
  return only !== undefined && others.length === 0
    ? { id: 'recent', key: only.id }
    : { id: 'machine', key: '' };
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
          .map(({ id, name, path }) => ({
            value: id,
            label: name,
            detail: path,
          })),
        loading: props.recent === null,
      }),
      pinned: ({ query }) => [
        {
          value: OPEN_FOLDER,
          label: 'Open folder…',
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
    .map(({ machineId, id, name, path }) => ({ machineId, id, name, path }));
};

export const ProjectPicker = Actor.define('ProjectPicker', {
  requires: [CodeClients, Navigation, Replicas, Machines],
  model: Schema.Struct({
    /** The Machines it opens projects on, as `Machines` lists them. */
    machines: Schema.Array(Listed),
    /** How it is open; null while it is not. */
    picking: Schema.NullOr(Picker.How),
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
    Open: { how: Picker.How },
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
      picking: null,
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
        step: firstStep(model.machines),
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
    Open: ({ how }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: {
              ...model,
              picking: how,
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
