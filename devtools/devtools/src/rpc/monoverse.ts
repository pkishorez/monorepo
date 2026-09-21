import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { MonorepoAnalysisSchema } from './monorepo-schema.js';

export class InvalidMonorepoPathError extends Schema.TaggedError<InvalidMonorepoPathError>(
  'InvalidMonorepoPathError',
)('InvalidMonorepoPathError', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
  path: Schema.String,
}) {}

export class NotPnpmWorkspaceError extends Schema.TaggedError<NotPnpmWorkspaceError>(
  'NotPnpmWorkspaceError',
)('NotPnpmWorkspaceError', { path: Schema.String }) {}

export class MonorepoReadFailure extends Schema.TaggedError<MonorepoReadFailure>(
  'MonorepoReadFailure',
)('MonorepoReadFailure', {
  reason: Schema.Literals([
    'workspace-parse',
    'glob',
    'manifest-read',
    'manifest-parse',
  ]),
  path: Schema.String,
  message: Schema.String,
}) {}

export const AnalyzeMonorepoError = Schema.Union([
  InvalidMonorepoPathError,
  NotPnpmWorkspaceError,
  MonorepoReadFailure,
]);

export class PackageReadmeNotFoundError extends Schema.TaggedError<PackageReadmeNotFoundError>(
  'PackageReadmeNotFoundError',
)('PackageReadmeNotFoundError', { path: Schema.String }) {}

export class PackageReadmeOutsidePackageError extends Schema.TaggedError<PackageReadmeOutsidePackageError>(
  'PackageReadmeOutsidePackageError',
)('PackageReadmeOutsidePackageError', { relativePath: Schema.String }) {}

export class PackageReadmeReadError extends Schema.TaggedError<PackageReadmeReadError>(
  'PackageReadmeReadError',
)('PackageReadmeReadError', { path: Schema.String, message: Schema.String }) {}

export const GetPackageReadmeError = Schema.Union([
  PackageReadmeNotFoundError,
  PackageReadmeOutsidePackageError,
  PackageReadmeReadError,
]);

export const PackageReadmeSchema = Schema.Struct({
  path: Schema.String,
  markdown: Schema.String,
}).annotate({
  title: 'Package README',
  description:
    'One markdown file inside a Package. `path` is relative to the Package folder.',
});

export type PackageReadme = typeof PackageReadmeSchema.Type;

/** The contract DevTools merges into its RPC for the Monoverse Tool. */
export const MonoverseRpc = RpcGroup.make(
  Rpc.make('AnalyzeMonorepo', {
    payload: { monorepoPath: Schema.String },
    success: MonorepoAnalysisSchema,
    error: AnalyzeMonorepoError,
  }),
  Rpc.make('GetPackageReadme', {
    payload: {
      monorepoRoot: Schema.String,
      packagePath: Schema.String,
      relativePath: Schema.optional(Schema.String),
    },
    success: PackageReadmeSchema,
    error: GetPackageReadmeError,
  }),
);
