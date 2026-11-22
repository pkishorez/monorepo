import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { BranchesSchema, ChangeSetSchema, FileDiffSchema } from './changes.js';
import { FoldersRpc } from './folders.js';
import { ProjectRegistryRpc } from './project-registry.js';
import {
  FileContentSchema,
  PackageContentsSchema,
  WorkspaceSchema,
} from './workspace.js';

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

export const OpenProjectError = Schema.Union([
  InvalidRootError,
  NoPackageJsonError,
  WorkspaceReadError,
  GitUnavailableError,
]);

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>(
  'FileNotFoundError',
)('FileNotFoundError', { path: Schema.String }) {}

export class FileOutsideError extends Schema.TaggedError<FileOutsideError>(
  'FileOutsideError',
)('FileOutsideError', { path: Schema.String }) {}

export class FileReadError extends Schema.TaggedError<FileReadError>(
  'FileReadError',
)('FileReadError', { path: Schema.String, message: Schema.String }) {}

export const ReadFileError = Schema.Union([
  InvalidRootError,
  FileNotFoundError,
  FileOutsideError,
  FileReadError,
  GitUnavailableError,
]);

export const GitError = Schema.Union([InvalidRootError, GitUnavailableError]);

/**
 * The Project's folder as one branch has it: `root` is the Project's
 * folder, absolute; `branch` a local branch of its repository, read from
 * the worktree that has it checked out, else from git at its last commit;
 * null reads `root` as it is on disk.
 */
const At = { root: Schema.String, branch: Schema.NullOr(Schema.String) };

/**
 * Reading one Project for Monoverse, at a branch: what it is, one
 * Package's files and imports, one file, its branches, and what a branch
 * changed since it left another. Every path is relative to the root.
 */
export const ExploreRpc = RpcGroup.make(
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
  Rpc.make('ReadFile', {
    payload: { ...At, path: Schema.String },
    success: FileContentSchema,
    error: ReadFileError,
  }),
  Rpc.make('GetBranches', {
    payload: { root: Schema.String },
    success: BranchesSchema,
    error: GitError,
  }),
  /** What `branch` changed since it left `base`. */
  Rpc.make('GetChanges', {
    payload: { ...At, base: Schema.String },
    success: ChangeSetSchema,
    error: GitError,
  }),
  Rpc.make('GetFileDiff', {
    payload: { ...At, base: Schema.String, path: Schema.String },
    success: FileDiffSchema,
    error: GitError,
  }),
);

/** Everything Monoverse asks its server, at `/rpc/monoverse`. */
export const MonoverseRpc = ProjectRegistryRpc.merge(FoldersRpc, ExploreRpc);
