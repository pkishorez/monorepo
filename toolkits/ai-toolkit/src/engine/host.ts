import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import {
  ProjectSchema,
  type Project as ProjectRecord,
} from '../records/index.js';
import { Store } from '../store/index.js';
import { Project, ProjectInput } from './project/index.js';

/*
 * The Host: the root of the engine, one Project child per project. It
 * starts empty and is handed what the Store holds once, as `Loaded`.
 */

const Model = Schema.Struct({ projects: Schema.Array(ProjectInput) });

const Message = Schema.TaggedUnion({
  Loaded: { projects: Schema.Array(ProjectInput) },
  AddProject: { project: Schema.Struct(ProjectSchema.fields) },
  RemoveProject: { id: Schema.String },
});

const Save = Command.make('SaveProject', {
  args: Schema.Struct(ProjectSchema.fields),
  run: (project: ProjectRecord) =>
    Effect.flatMap(Store, (store) => store.saveProject(project)),
});

const Remove = Command.make('RemoveProject', {
  args: Schema.String,
  run: (id: string) =>
    Effect.flatMap(Store, (store) => Effect.asVoid(store.removeProject(id))),
});

export const Host = Actor.build(
  Actor.define('Host', {
    requires: [Store],
    model: Model,
    message: Message,
  }),
  {
    init: () => ({ model: { projects: [] } }),
    on: {
      Loaded: ({ projects }) => ({ model: { projects } }),
      AddProject: ({ project }, { model }) => ({
        model: { projects: [...model.projects, { project, sessions: [] }] },
        command: Save(project),
      }),
      RemoveProject: ({ id }, { model }) => ({
        model: {
          projects: model.projects.filter(({ project }) => project.id !== id),
        },
        command: Remove(id),
      }),
    },
    children: {
      projects: {
        actor: Project,
        each: ({ model }) => model.projects.map(({ project }) => project.id),
        input: ({ model }, id) =>
          model.projects.find(({ project }) => project.id === id)!,
      },
    },
  },
);
