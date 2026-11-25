import { Effect } from 'effect';

import type { GitShape } from '../../git/contract/index.js';
import { gitSnapshot } from './from-git.js';
import { diskSnapshot } from './on-disk.js';
import { existingRoot } from './root.js';

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
