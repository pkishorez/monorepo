import { Effect } from 'effect';

import type { GitShape } from '../../git/contract/index.js';
import { gitSnapshot } from './from-git.js';
import { diskSnapshot } from './on-disk.js';
import { existingRoot } from './root.js';

/**
 * The Project folder `root` at `branch`: null is the folder as it is on
 * disk; a branch some worktree has checked out is that worktree's copy of
 * the folder, uncommitted work included; any other is read from git at its
 * last commit, and copied into `copies` when asked for on disk.
 */
export function openSnapshot(
  git: GitShape,
  root: string,
  branch: string | null,
  copies: string,
) {
  return Effect.gen(function* () {
    const folder = yield* existingRoot(root);
    const placement = yield* git.attempt(() => git.placeBranch(folder, branch));
    if (placement.kind === 'worktree')
      return diskSnapshot(git, folder, placement.folder);
    return gitSnapshot(git, {
      root: folder,
      toplevel: placement.repository.toplevel,
      prefix: placement.repository.prefix,
      commit: placement.commit,
      copies,
    });
  });
}
