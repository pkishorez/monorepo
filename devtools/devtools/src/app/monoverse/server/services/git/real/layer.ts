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

/** A git failure, as the contract says it. */
function toGitUnavailable(cause: unknown): GitUnavailableError {
  return new GitUnavailableError({
    reason: cause instanceof GitError ? cause.reason : 'command-failed',
  });
}

/** Git, run as a child process in the folder each call names. */
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
