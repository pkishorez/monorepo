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
 *            checks/sweep.ts); what it finds is `Loaded`.
 * - Ready    the Projects, added and removed on request, each change saved;
 *            removing one stops its Sessions and removes them. A new
 *            session starts here, already running its first message; a
 *            Fork joins idle. The Folder Check (see checks/folders.ts) keeps
 *            whether each Project's folder is there, saving only a change.
 */

const ProjectRecord = Schema.Struct(ProjectSchema.fields);

const Loaded = Schema.Struct({
  projects: Schema.Array(ProjectRecord),
  /** Each Session as it was first handed over; the Session keeps itself after. */
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
  FolderFound: {
    id: Schema.String,
    folder: Schema.Literals(PROJECT_FOLDERS),
  },
  FoldersAsked: {},
});

/** The folder of the Project a session is in; null when it is gone. */
const cwdOf = (model: Model, projectId: string) =>
  model.projects.find((project) => project.id === projectId)?.path ?? null;

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
    state: {
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
            const cwd = cwdOf(model, session.projectId);
            if (cwd === null) return {};
            return {
              model: {
                ...model,
                sessions: [...model.sessions, { session, cwd, first }],
              },
            };
          },
          AddSession: ({ session }, { model }) => {
            const cwd = cwdOf(model, session.projectId);
            if (cwd === null) return {};
            return {
              model: {
                ...model,
                sessions: [...model.sessions, { session, cwd, first: null }],
              },
            };
          },
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
        children: {
          sessions: {
            actor: Session,
            each: ({ model }) =>
              model.sessions.map(({ session }) => session.id),
            input: ({ model }, id) =>
              model.sessions.find(({ session }) => session.id === id)!,
          },
        },
      },
    },
  },
);
