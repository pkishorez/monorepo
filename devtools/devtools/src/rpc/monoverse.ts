import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { FileContentSchema } from 'laymos/architecture-analysis-schema';

import { MonorepoAnalysisSchema } from './monorepo-schema.js';

export class InvalidMonorepoPathError extends Schema.TaggedError<InvalidMonorepoPathError>(
  'InvalidMonorepoPathError',
)('InvalidMonorepoPathError', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
  path: Schema.String,
}) {}

/** The folder has no `package.json` (nor a `pnpm-workspace.yaml`): it is not a Monorepo or a Single Package. */
export class NoPackageJsonError extends Schema.TaggedError<NoPackageJsonError>(
  'NoPackageJsonError',
)('NoPackageJsonError', { path: Schema.String }) {}

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
  NoPackageJsonError,
  MonorepoReadFailure,
]);

export class MonorepoFileNotFoundError extends Schema.TaggedError<MonorepoFileNotFoundError>(
  'MonorepoFileNotFoundError',
)('MonorepoFileNotFoundError', { path: Schema.String }) {}

export class MonorepoFileOutsideError extends Schema.TaggedError<MonorepoFileOutsideError>(
  'MonorepoFileOutsideError',
)('MonorepoFileOutsideError', { path: Schema.String }) {}

export class MonorepoFileReadError extends Schema.TaggedError<MonorepoFileReadError>(
  'MonorepoFileReadError',
)('MonorepoFileReadError', { path: Schema.String, message: Schema.String }) {}

export const GetMonorepoFileError = Schema.Union([
  MonorepoFileNotFoundError,
  MonorepoFileOutsideError,
  MonorepoFileReadError,
]);

/** The contract DevTools merges into its RPC for the Monoverse Tool. */
export const MonoverseRpc = RpcGroup.make(
  Rpc.make('AnalyzeMonorepo', {
    payload: { monorepoPath: Schema.String },
    success: MonorepoAnalysisSchema,
    error: AnalyzeMonorepoError,
  }),
  Rpc.make('GetMonorepoFile', {
    payload: { monorepoRoot: Schema.String, path: Schema.String },
    success: FileContentSchema,
    error: GetMonorepoFileError,
  }),
);
