import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { FolderError, FolderListingSchema } from './folders.js';

/**
 * One Monorepo or Single Package added to Monoverse: one absolute folder,
 * named after it, and when it was added. Which branch is read is never
 * stored; it lives in the browser address.
 */
export const ProjectEntrySchema = Schema.Struct({
  id: Schema.String,
  /** The folder, absolute. */
  path: Schema.String,
  /** Its `package.json` name, else the folder's own. */
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

/**
 * What the Project picker asks: the saved Projects, listed newest first,
 * added by folder and removed by id, and the folders under home to find
 * one in.
 */
export const ProjectsRpc = RpcGroup.make(
  Rpc.make('ListProjects', {
    success: Schema.Array(ProjectEntrySchema),
    error: ProjectRegistryError,
  }),
  /** Adds the folder, or answers the entry it already is. */
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
  /**
   * The sub-folders of `path` (home when null) whose name holds `query`,
   * case-insensitively; hidden ones (`.name`) only when `hidden`.
   */
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
