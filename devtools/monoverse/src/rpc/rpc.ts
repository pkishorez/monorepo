import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { MonorepoAnalysisSchema } from '../domain/schema/index.js';

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

/** The contract DevTools merges into its RPC for the Monoverse Tool. */
export const MonoverseRpc = RpcGroup.make(
  Rpc.make('AnalyzeMonorepo', {
    payload: { monorepoPath: Schema.String },
    success: MonorepoAnalysisSchema,
    error: AnalyzeMonorepoError,
  }),
);
