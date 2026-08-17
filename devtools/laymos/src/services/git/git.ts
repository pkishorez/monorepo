import { Context, Effect, Layer } from 'effect';

import type { ChangeSet, FileDiff } from '../../change-set-schema/index.js';
import { readChangeSet, readFileDiff } from './changed-paths.js';
import { GitError } from './errors.js';

export class Git extends Context.Service<
  Git,
  {
    readonly changeSet: (
      baseDir: string,
      baseRef: string,
    ) => Effect.Effect<ChangeSet, GitError>;
    readonly fileDiff: (
      baseDir: string,
      baseRef: string,
      path: string,
    ) => Effect.Effect<FileDiff, GitError>;
  }
>()('Git') {}

export const GitLive = Layer.succeed(Git)({
  changeSet: (baseDir, baseRef) =>
    Effect.tryPromise({
      try: () => readChangeSet(baseDir, baseRef),
      catch: (cause) => asGitError(cause, baseDir),
    }),
  fileDiff: (baseDir, baseRef, path) =>
    Effect.tryPromise({
      try: async () => ({
        path,
        hunks: await readFileDiff(baseDir, baseRef, path),
      }),
      catch: (cause) => asGitError(cause, baseDir),
    }),
});

function asGitError(cause: unknown, baseDir: string): GitError {
  return cause instanceof GitError
    ? cause
    : new GitError({ reason: 'command-failed', baseDir, cause });
}
