import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { PROJECT_FOLDERS, ProjectSchema } from '../../records/index.js';
import { Store } from '../capabilities/index.js';
import { Prompt, Session, SessionInput } from './actor-session/index.js';
import { check, failures, sweep } from './checks/index.js';
import { Remove, Save } from './commands.js';

/*
 * Code: the root of the engine. It holds the Projects, each a folder, and
 * one Session child per session in them.
 *
 * - Loading  one Worker reads the Store and runs the Bootstrap Sweep (see
 *            checks/sweep.ts); what it finds is `Loaded`, each Session it Resumes
 *            with the Prompt to start Running.
 * - Ready    the Projects, added and removed on request, each change saved;
 *            removing one stops its Sessions and removes them. A new
 *            session starts here, already running its first message, in
 *            its Worktree or else its Project's folder, and is dropped
 *            if its Agent fails to open; a Fork joins idle,
 *            in the original's. The Folder Check (see checks/folders.ts) keeps
 *            whether each Project's folder is there, saving only a change.
 */

const ProjectRecord = Schema.Struct(ProjectSchema.fields);

const Loaded = Schema.Struct({
  projects: Schema.Array(ProjectRecord),
  /**
   * Each Session as it was first handed over, with the Prompt it starts
   * Running, if any; the Session keeps itself after.
   */
  sessions: Schema.Array(SessionInput),
});

const Model = Schema.Struct({
  ...Loaded.fields,
  /** How many times the Folder Check was asked for at once; each starts it over. */
  folderAsks: Schema.Finite,
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({ Loading: {}, Ready: {} });

const Message = Schema.TaggedUnion({
  Loaded: Loaded.fields,
  AddProject: { project: ProjectRecord },
  RemoveProject: { id: Schema.String },
  StartSession: { session: SessionInput.fields.session, first: Prompt },
  AddSession: { session: SessionInput.fields.session },
  /** A new Session whose start failed: it stops, and was never saved. */
  DropSession: { id: Schema.String },
  FolderFound: {
    id: Schema.String,
    folder: Schema.Literals(PROJECT_FOLDERS),
  },
  FoldersAsked: {},
});

/**
 * Where a session runs: its Worktree, or its Project's folder when it has
 * none; null when its Project is gone.
 */
const cwdOf = (
  model: Model,
  session: { readonly projectId: string; readonly worktree: string | null },
) => {
  const project = model.projects.find(({ id }) => id === session.projectId);
  return project ? (session.worktree ?? project.path) : null;
};

export const Code = Actor.build(
  Actor.define('Code', {
    requires: [Store],
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: () => ({
      model: { projects: [], sessions: [], folderAsks: 0 },
      state: { _tag: 'Loading' },
    }),
    states: {
      Loading: {
        on: {
          Loaded: (loaded, { model }) => ({
            model: {
              ...model,
              projects: loaded.projects,
              sessions: loaded.sessions,
            },
            state: { _tag: 'Ready' },
          }),
        },
        workers: {
          load: {
            run: (self) =>
              Effect.flatMap(sweep, (loaded) =>
                self.send({ _tag: 'Loaded', ...loaded }),
              ),
          },
        },
      },
      Ready: {
        on: {
          AddProject: ({ project }, { model }) => ({
            model: { ...model, projects: [...model.projects, project] },
            command: Save(project),
          }),
          RemoveProject: ({ id }, { model }) => ({
            model: {
              ...model,
              projects: model.projects.filter((project) => project.id !== id),
              sessions: model.sessions.filter(
                ({ session }) => session.projectId !== id,
              ),
            },
            command: Remove(id),
          }),
          StartSession: ({ session, first }, { model }) => {
            const cwd = cwdOf(model, session);
            if (cwd === null) return {};
            return {
              model: {
                ...model,
                sessions: [...model.sessions, { session, cwd, first }],
              },
            };
          },
          AddSession: ({ session }, { model }) => {
            const cwd = cwdOf(model, session);
            if (cwd === null) return {};
            return {
              model: {
                ...model,
                sessions: [...model.sessions, { session, cwd, first: null }],
              },
            };
          },
          DropSession: ({ id }, { model }) => ({
            model: {
              ...model,
              sessions: model.sessions.filter(
                ({ session }) => session.id !== id,
              ),
            },
          }),
          FolderFound: ({ id, folder }, { model }) => {
            const found = model.projects.find((project) => project.id === id);
            if (found === undefined || found.folder === folder) return {};
            const project = { ...found, folder };
            return {
              model: {
                ...model,
                projects: model.projects.map((each) =>
                  each.id === id ? project : each,
                ),
              },
              command: Save(project),
            };
          },
          FoldersAsked: (_, { model }) => ({
            model: { ...model, folderAsks: model.folderAsks + 1 },
          }),
        },
        workers: {
          check: {
            each: ({ model }) => [String(model.folderAsks)],
            run: (self) => check(self),
          },
          failures: { run: (self) => failures(self) },
        },
        children: (child) => ({
          sessions: child(Session, {
            each: ({ model }) =>
              model.sessions.map(({ session }) => session.id),
            input: ({ model }, id) =>
              model.sessions.find(({ session }) => session.id === id)!,
          }),
        }),
      },
    },
  },
);
