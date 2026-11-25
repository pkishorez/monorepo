import { isAbsolute, posix } from 'node:path';

import { Effect } from 'effect';

import { Git } from '../../../services/git/contract/index.js';
import { Snapshots } from '../../../services/snapshots/contract/index.js';
import { GitUnavailableError } from '../../project/contract/index.js';
import { readChangeSet, readFileDiff } from './change-set.js';

const leavesFolder = (path: string) => path === '..' || path.startsWith('../');
const isGitPathspecMagic = (path: string) => path.startsWith(':');

export function getBranches(root: string) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const git = yield* Git;
    const folder = yield* snapshots.existingRoot(root);
    return yield* git.attempt(() => git.listBranches(folder));
  });
}

export function getChanges(root: string, branch: string | null, base: string) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const git = yield* Git;
    const folder = yield* snapshots.existingRoot(root);
    return yield* git.attempt(async () =>
      readChangeSet(git, folder, await git.placeBranch(folder, branch), base),
    );
  });
}

export function getFileDiff(
  root: string,
  branch: string | null,
  base: string,
  path: string,
) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const git = yield* Git;
    const folder = yield* snapshots.existingRoot(root);
    const normalized = posix.normalize(path);
    if (
      isAbsolute(path) ||
      leavesFolder(normalized) ||
      isGitPathspecMagic(normalized)
    ) {
      return yield* new GitUnavailableError({ reason: 'command-failed' });
    }
    const hunks = yield* git.attempt(async () =>
      readFileDiff(
        git,
        folder,
        await git.placeBranch(folder, branch),
        base,
        normalized,
      ),
    );
    return { path, hunks };
  });
}
