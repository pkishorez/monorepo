import { isAbsolute, posix } from 'node:path';

import { Effect } from 'effect';

import { Git } from '../../../services/git/contract/index.js';
import { Snapshots } from '../../../services/snapshots/contract/index.js';
import { GitUnavailableError } from '../../project/contract/index.js';
import { readChangeSet, readFileDiff } from './change-set.js';

/*
 * Git's answers about a Project: its local branches and where each is
 * read, what a branch changed since it left another, and how one file
 * changed.
 */

export function getBranches(root: string) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const git = yield* Git;
    const folder = yield* snapshots.existingRoot(root);
    return yield* git.attempt(() => git.listBranches(folder));
  });
}

/** What `branch` (null: the folder as it is) changed since it left `base`. */
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
    // A path git would read outside the Project folder, or as a pathspec.
    if (
      isAbsolute(path) ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.startsWith(':')
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
