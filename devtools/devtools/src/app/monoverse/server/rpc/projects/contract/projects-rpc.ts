import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { FolderError, FolderListingSchema } from './folders.js';

export const ProjectEntrySchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  name: Schema.String,
  addedAt: Schema.Number,
});
export type ProjectEntry = typeof ProjectEntrySchema.Type;

export class ProjectRegistryError extends Schema.TaggedError<ProjectRegistryError>(
  'ProjectRegistryError',
)('ProjectRegistryError', {
  reason: Schema.Literals(['not-found', 'invalid-path', 'store']),
  message: Schema.String,
}) {}

export const ProjectsRpc = RpcGroup.make(
  Rpc.make('ListProjects', {
    success: Schema.Array(ProjectEntrySchema),
    error: ProjectRegistryError,
  }),
  Rpc.make('AddProject', {
    payload: { path: Schema.String },
    success: ProjectEntrySchema,
    error: ProjectRegistryError,
  }),
  Rpc.make('RemoveProject', {
    payload: { id: Schema.String },
    success: Schema.Struct({ removed: Schema.Boolean }),
    error: ProjectRegistryError,
  }),
  Rpc.make('ListFolders', {
    payload: {
      path: Schema.NullOr(Schema.String),
      query: Schema.String,
      hidden: Schema.Boolean,
    },
    success: FolderListingSchema,
    error: FolderError,
  }),
);
