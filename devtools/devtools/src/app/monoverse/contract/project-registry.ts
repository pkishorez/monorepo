import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

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

/** The saved Projects: listed newest first, added by folder, removed by id. */
export const ProjectRegistryRpc = RpcGroup.make(
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
);
