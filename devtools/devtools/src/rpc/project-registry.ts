import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

/** One git checkout of a repository. */
export const WorktreeSchema = Schema.Struct({
  /** Absolute folder of the checkout. */
  root: Schema.String,
  /** Short branch name, or null when HEAD is detached. */
  branch: Schema.NullOr(Schema.String),
  head: Schema.String,
  /** True for the repository's primary checkout. */
  primary: Schema.Boolean,
  /** The Worktree sibling: the Project's folder inside this checkout. */
  siblingPath: Schema.String,
  /** False when this checkout does not contain the Project folder. */
  present: Schema.Boolean,
});
export type Worktree = typeof WorktreeSchema.Type;

/**
 * The Worktrees of the repository one folder lives in, and which of them is
 * the folder itself. `repositoryPath` is the folder relative to the checkout
 * root; empty when the folder is the root.
 */
export const WorktreeResolutionSchema = Schema.Struct({
  repositoryPath: Schema.String,
  current: Schema.NullOr(Schema.String),
  worktrees: Schema.Array(WorktreeSchema),
});
export type WorktreeResolution = typeof WorktreeResolutionSchema.Type;

/**
 * One Monorepo or Single Package added to Monoverse: one absolute folder, an
 * optional label, and when it was added, with the Worktrees of its
 * repository. The Worktree in use is never stored; it lives in the browser
 * address.
 */
export const ProjectEntrySchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  label: Schema.NullOr(Schema.String),
  addedAt: Schema.Number,
  /** Null when the folder is not inside a git repository. */
  worktrees: Schema.NullOr(WorktreeResolutionSchema),
});
export type ProjectEntry = typeof ProjectEntrySchema.Type;

export class ProjectRegistryError extends Schema.TaggedError<ProjectRegistryError>(
  'ProjectRegistryError',
)('ProjectRegistryError', {
  reason: Schema.Literals(['not-found', 'invalid-path', 'store']),
  message: Schema.String,
}) {}

export const ProjectRegistryRpc = RpcGroup.make(
  Rpc.make('ListProjects', {
    success: Schema.Array(ProjectEntrySchema),
    error: ProjectRegistryError,
  }),
  Rpc.make('AddProject', {
    payload: {
      path: Schema.String,
      label: Schema.NullOr(Schema.String),
    },
    success: ProjectEntrySchema,
    error: ProjectRegistryError,
  }),
  Rpc.make('UpdateProject', {
    payload: {
      id: Schema.String,
      path: Schema.String,
      label: Schema.NullOr(Schema.String),
    },
    success: ProjectEntrySchema,
    error: ProjectRegistryError,
  }),
  Rpc.make('RemoveProject', {
    payload: { id: Schema.String },
    success: Schema.Struct({ removed: Schema.Boolean }),
    error: ProjectRegistryError,
  }),
  Rpc.make('ResolveWorktrees', {
    payload: { path: Schema.String },
    success: Schema.NullOr(WorktreeResolutionSchema),
    error: ProjectRegistryError,
  }),
);
