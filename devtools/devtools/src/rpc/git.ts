import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  BranchSchema,
  ChangeSetSchema,
  FileDiffSchema,
} from 'laymos/change-set-schema';

export class InvalidFolderPath extends Schema.TaggedError<InvalidFolderPath>(
  'InvalidFolderPath',
)('InvalidFolderPath', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
}) {}

export class GitUnavailableError extends Schema.TaggedError<GitUnavailableError>(
  'GitUnavailableError',
)('GitUnavailableError', {
  reason: Schema.Literals(['not-a-repo', 'unknown-ref', 'command-failed']),
}) {}

const GitChangesError = Schema.Union([InvalidFolderPath, GitUnavailableError]);

/**
 * The Tool-neutral git contract: branches, Change sets, and file diffs for any
 * folder inside a git repository, such as a Laymos Project or a Monorepo root.
 * Paths are relative to that folder.
 */
export const GitRpc = RpcGroup.make(
  Rpc.make('GetBranches', {
    payload: { folder: Schema.String },
    success: Schema.Array(BranchSchema),
    error: GitChangesError,
  }),
  Rpc.make('GetChanges', {
    payload: { folder: Schema.String, baseRef: Schema.optional(Schema.String) },
    success: ChangeSetSchema,
    error: GitChangesError,
  }),
  Rpc.make('GetFileDiff', {
    payload: {
      folder: Schema.String,
      path: Schema.String,
      baseRef: Schema.optional(Schema.String),
    },
    success: FileDiffSchema,
    error: GitChangesError,
  }),
  // Every path git knows beneath the folder, tracked or untracked but not
  // ignored, so a Tool can tell an owner whose files are all added.
  Rpc.make('GetKnownFiles', {
    payload: { folder: Schema.String },
    success: Schema.Array(Schema.String),
    error: GitChangesError,
  }),
);
