import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { ProjectSchema } from '../../api/records/index.js';
import { Store } from '../capabilities/index.js';
import { Prompt, Session, SessionInput } from './actor-session/index.js';
import { Remove, Save } from './commands.js';
import { sweep } from './sweep.js';

/*
 * Code: the root of the engine. It holds the Projects, each a folder, and
 * one Session child per session in them.
 *
 * - Loading  one Worker reads the Store and runs the Bootstrap Sweep (see
 *            sweep.ts); what it finds is `Loaded`.
 * - Ready    the Projects, added and removed on request, each change saved;
 *            removing one stops its Sessions. A new session starts here,
 *            already running its first message; a Fork joins idle.
 */

const ProjectRecord = Schema.Struct(ProjectSchema.fields);

export const Loaded = Schema.Struct({
  projects: Schema.Array(ProjectRecord),
  /** Each Session as it was first handed over; the Session keeps itself after. */
  sessions: Schema.Array(SessionInput),
});
export type Loaded = typeof Loaded.Type;

const State = Schema.TaggedUnion({ Loading: {}, Ready: {} });

const Message = Schema.TaggedUnion({
  Loaded: Loaded.fields,
  AddProject: { project: ProjectRecord },
  RemoveProject: { id: Schema.String },
  StartSession: { session: SessionInput.fields.session, first: Prompt },
  AddSession: { session: SessionInput.fields.session },
});

/** The folder of the Project a session is in; null when it is gone. */
const cwdOf = (model: Loaded, projectId: string) =>
  model.projects.find((project) => project.id === projectId)?.path ?? null;

export const Code = Actor.build(
  Actor.define('Code', {
    requires: [Store],
    model: Loaded,
    state: State,
    message: Message,
  }),
  {
    init: () => ({
      model: { projects: [], sessions: [] },
      state: { _tag: 'Loading' },
    }),
    state: {
      Loading: {
        on: {
          Loaded: (loaded) => ({
            model: { projects: loaded.projects, sessions: loaded.sessions },
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
