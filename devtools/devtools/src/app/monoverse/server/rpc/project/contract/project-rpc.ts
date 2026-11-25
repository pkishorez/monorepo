import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { PackageContentsSchema, WorkspaceSchema } from './workspace.js';

export class InvalidRootError extends Schema.TaggedError<InvalidRootError>(
  'InvalidRootError',
)('InvalidRootError', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
  path: Schema.String,
}) {}

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

export const At = { root: Schema.String, branch: Schema.NullOr(Schema.String) };

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
