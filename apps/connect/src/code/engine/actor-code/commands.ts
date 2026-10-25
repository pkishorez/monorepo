import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import {
  ProjectSchema,
  type Project as ProjectRecord,
} from '../../records/index.js';
import { Store } from '../capabilities/index.js';

export const Save = Command.make('SaveProject', {
  args: Schema.Struct(ProjectSchema.fields),
  run: (project: ProjectRecord) =>
    Effect.flatMap(Store, (store) => store.saveProject(project)),
});

export const Remove = Command.make('RemoveProject', {
  args: Schema.String,
  run: (id: string) =>
    Effect.flatMap(Store, (store) => Effect.asVoid(store.removeProject(id))),
});
