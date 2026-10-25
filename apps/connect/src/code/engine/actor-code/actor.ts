import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { ProjectSchema } from '../../api/records/index.js';
import { Store } from '../services/store/index.js';
import { Project, ProjectInput } from './actor-project/index.js';
import { Remove, Save } from './commands.js';
import { sweep } from './sweep.js';

/*
 * Code: the root of the engine, one Project child per project.
 *
 * - Loading  one Worker reads the Store and runs the Bootstrap Sweep (see
 *            sweep.ts); what it finds is `Loaded`.
 * - Ready    the Projects, added and removed on request, each change saved.
 */

const Model = Schema.Struct({ projects: Schema.Array(ProjectInput) });

const State = Schema.TaggedUnion({ Loading: {}, Ready: {} });

const Message = Schema.TaggedUnion({
  Loaded: { projects: Schema.Array(ProjectInput) },
  AddProject: { project: Schema.Struct(ProjectSchema.fields) },
  RemoveProject: { id: Schema.String },
});

export const Code = Actor.build(
  Actor.define('Code', {
    requires: [Store],
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: () => ({ model: { projects: [] }, state: { _tag: 'Loading' } }),
    state: {
      Loading: {
        on: {
          Loaded: ({ projects }) => ({
            model: { projects },
            state: { _tag: 'Ready' },
          }),
        },
        workers: {
          load: {
            run: (self) =>
              Effect.flatMap(sweep, (projects) =>
                self.send({ _tag: 'Loaded', projects }),
              ),
          },
        },
      },
      Ready: {
        on: {
          AddProject: ({ project }, { model }) => ({
            model: {
              projects: [...model.projects, { project, sessions: [] }],
            },
            command: Save(project),
          }),
          RemoveProject: ({ id }, { model }) => ({
            model: {
              projects: model.projects.filter(
                ({ project }) => project.id !== id,
              ),
            },
            command: Remove(id),
          }),
        },
        children: {
          projects: {
            actor: Project,
            each: ({ model }) =>
              model.projects.map(({ project }) => project.id),
            input: ({ model }, id) =>
              model.projects.find(({ project }) => project.id === id)!,
          },
        },
      },
    },
  },
);
