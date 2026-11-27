import { Effect, Layer } from 'effect';

import { GitUnavailableError } from '../../../rpc/project/contract/index.js';
import { Git, GitError } from '../contract/index.js';
import {
  listBranches,
  locateRepository,
  placeBranch,
  worktreeFolder,
} from './repository.js';
import { requireGit, runGit, splitNul } from './run-git.js';

function toGitUnavailable(cause: unknown): GitUnavailableError {
  return new GitUnavailableError({
    reason: cause instanceof GitError ? cause.reason : 'command-failed',
  });
}

export const gitLayer = Layer.succeed(Git)({
  run: runGit,
  require: requireGit,
  splitNul,
  locateRepository,
  worktreeFolder,
  placeBranch,
  listBranches,
  attempt: (run) => Effect.tryPromise({ try: run, catch: toGitUnavailable }),
});
