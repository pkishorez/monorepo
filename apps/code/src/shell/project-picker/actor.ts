import { Effect, Layer, Schema, Stream } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import type { Project, Session } from '@kestack/ai-toolkit/api';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { project } from '../../places/index.ts';
import { everything } from '../../replica/index.ts';
import * as Picker from '../../ui/picker/index.ts';
import { FolderPicker } from './folder-picker/index.ts';

/*
 * The Project Picker: where to work next.
 *
 * 1. Recent   every Project, the most recently active first: a Turn started
 *             or a Session made in it, else when it was added. Followed
 *             while the Picker is open.
 * 2. Pick     a Project opens it, which is a new Session in it. After the
 *             Projects, "Open folder…" goes to the folder Steps
 *             (`folder-picker/`), searching what was typed, so text that
 *             names no Project, then Enter, looks for it under home.
 * 3. Folder   a folder chosen, or created, becomes a Project while the
 *             Picker waits, and opens as it closes; one whose `git init`
 *             failed opens with a warning.
 * Either way the keyboard goes on to the page, to write the first message,
 * wherever the Picker was opened from.
 */

const OPEN_FOLDER = 'open-folder';

const Recent = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
});
type Recent = typeof Recent.Type;

const Projects = Picker.make('ProjectPicker', {
  props: Schema.Struct({ recent: Schema.NullOr(Schema.Array(Recent)) }),
  steps: {
    // 1. Recent, 2. Pick
    recent: {
      placeholder: () => 'Search projects, or a folder under home',
      empty: () => 'No project by that name',
      rows: ({ props }) => ({
        rows: (props.recent ?? []).map(({ id, name, path }) => ({
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
      next: (row, { query }) =>
        row.value === OPEN_FOLDER ? FolderPicker.opens(query.trim()) : null,
    },
    // 3. Folder
    ...FolderPicker.steps,
  },
  // A Project chosen, or a folder made one, opens: the keyboard goes there.
  lands: () => true,
});

/** Projects by when they were last active, the latest first. */
const recentOf = (
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<Recent> => {
  const active = new Map<string, number>();
  for (const { projectId, activeAt } of sessions)
    active.set(projectId, Math.max(active.get(projectId) ?? 0, activeAt));
  const at = (each: Project) => active.get(each.id) ?? each.createdAt;
  return [...projects]
    .sort((a, b) => at(b) - at(a))
    .map(({ id, name, path }) => ({ id, name, path }));
};

export const ProjectPicker = Actor.define('ProjectPicker', {
  requires: [AiClient, Navigation, Replicas],
  model: Schema.Struct({
    /** How it is open; null while it is not. */
    picking: Schema.NullOr(Picker.How),
    /** How many times it was opened, so each is a fresh one. */
    opened: Schema.Finite,
    /** Null until read. */
    recent: Schema.NullOr(Schema.Array(Recent)),
    /** The Project a folder became, opened as the Picker closes. */
    added: Schema.NullOr(Schema.String),
    /** A folder made whose `git init` failed, until dismissed. */
    warning: Schema.NullOr(
      Schema.Struct({ path: Schema.String, reason: Schema.String }),
    ),
  }),
  message: Schema.TaggedUnion({
    Open: { how: Picker.How },
    Read: { recent: Schema.Array(Recent) },
    Closed: {},
    Chose: { projectId: Schema.String },
    /** The Picker finished on a folder, which was Added. */
    Opened: {},
    Added: {
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
        step: { id: 'recent', key: '' },
        choices: [],
      }),
      props: ({ model }) => ({ recent: model.recent }),
    },
  },
  // The folder Steps call the server through the client this actor has.
  provides: (self) =>
    Layer.unwrap(
      Effect.map(Effect.context<AiClient>(), (client) =>
        Projects.owner({
          done: (choices, step) => {
            const chosen = choices?.at(-1)?.value;
            return self.send(
              chosen === undefined
                ? { _tag: 'Closed' }
                : step?.id === 'recent'
                  ? { _tag: 'Chose', projectId: chosen }
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
    // 1. Recent
    recent: {
      while: ({ model }) => model.picking !== null,
      run: (self) =>
        Stream.runForEach(everything, ({ projects, sessions }) =>
          self.send({ _tag: 'Read', recent: recentOf(projects, sessions) }),
        ),
    },
  },
  on: {
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
    Chose: ({ projectId }, { model }) => ({
      model: { ...model, picking: null },
      command: Router.push(project(projectId)),
    }),
    // 3. Folder
    // Opened once the Picker has closed, so focus goes on to the new page.
    Added: ({ projectId, path, gitInitError }, { model }) => ({
      model: {
        ...model,
        added: projectId,
        warning: gitInitError === null ? null : { path, reason: gitInitError },
      },
    }),
    Opened: (_, { model }) => ({
      model: { ...model, picking: null, added: null },
      ...(model.added === null
        ? {}
        : { command: Router.push(project(model.added)) }),
    }),
    Dismiss: (_, { model }) => ({ model: { ...model, warning: null } }),
  },
});

/** The Picker's own View, for this actor's View to draw. */
export const ProjectsView = Projects.View;
