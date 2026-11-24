import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { PackageContentsSchema, WorkspaceSchema } from './workspace.js';

/** The root is not an absolute folder that exists. */
export class InvalidRootError extends Schema.TaggedError<InvalidRootError>(
  'InvalidRootError',
)('InvalidRootError', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
  path: Schema.String,
}) {}

/** The folder has no `package.json` (nor a `pnpm-workspace.yaml`): it is not a Monorepo or a Single Package. */
export class NoPackageJsonError extends Schema.TaggedError<NoPackageJsonError>(
  'NoPackageJsonError',
)('NoPackageJsonError', { path: Schema.String }) {}

export class WorkspaceReadError extends Schema.TaggedError<WorkspaceReadError>(
  'WorkspaceReadError',
)('WorkspaceReadError', {
  reason: Schema.Literals([
    'workspace-parse',
    'glob',
    'manifest-read',
    'manifest-parse',
    'package-not-found',
    'files',
    'imports',
  ]),
  path: Schema.String,
  message: Schema.String,
}) {}

/**
 * Git could not answer: the folder is outside a repository, the branch is
 * unknown, or a git command failed. Reading at a branch other than the
 * folder's own may fail so too.
 */
export class GitUnavailableError extends Schema.TaggedError<GitUnavailableError>(
  'GitUnavailableError',
)('GitUnavailableError', {
  reason: Schema.Literals(['not-a-repo', 'unknown-ref', 'command-failed']),
}) {}

const OpenProjectError = Schema.Union([
  InvalidRootError,
  NoPackageJsonError,
  WorkspaceReadError,
  GitUnavailableError,
]);

/**
 * The Project's folder as one branch has it: `root` is the Project's
 * folder, absolute; `branch` a local branch of its repository, read from
 * the worktree that has it checked out, else from git at its last commit;
 * null reads `root` as it is on disk. Every group that reads a Project at
 * a branch takes it.
 */
export const At = { root: Schema.String, branch: Schema.NullOr(Schema.String) };

/**
 * Opening one Project for Monoverse, at a branch: what it is, and one
 * Package's files and imports. Every path is relative to the root.
 */
export const ProjectRpc = RpcGroup.make(
  Rpc.make('OpenProject', {
    payload: At,
    success: WorkspaceSchema,
    error: OpenProjectError,
  }),
  Rpc.make('ReadPackage', {
    payload: { ...At, path: Schema.String },
    success: PackageContentsSchema,
    error: OpenProjectError,
  }),
);
