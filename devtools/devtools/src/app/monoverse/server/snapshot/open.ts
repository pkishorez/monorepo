import { Effect } from 'effect';

import { GitUnavailableError } from '../../contract/index.js';
import { GitError, placeBranch } from '../git/index.js';
import { gitSnapshot } from './from-git.js';
import { diskSnapshot } from './on-disk.js';
import { existingRoot } from './root.js';

/**
 * The Project folder `root` at `branch`: null is the folder as it is on
 * disk; a branch some worktree has checked out is that worktree's copy of
 * the folder, uncommitted work included; any other is read from git at its
 * last commit.
 */
export function openSnapshot(root: string, branch: string | null) {
  return Effect.gen(function* () {
    const folder = yield* existingRoot(root);
    const placement = yield* Effect.tryPromise({
      try: () => placeBranch(folder, branch),
      catch: toGitUnavailable,
    });
    if (placement.kind === 'worktree')
      return diskSnapshot(folder, placement.folder);
    return gitSnapshot({
      root: folder,
      toplevel: placement.repository.toplevel,
      prefix: placement.repository.prefix,
      commit: placement.commit,
    });
  });
}

/** A git failure, as the contract says it. */
export function toGitUnavailable(cause: unknown): GitUnavailableError {
  return new GitUnavailableError({
    reason: cause instanceof GitError ? cause.reason : 'command-failed',
  });
}
