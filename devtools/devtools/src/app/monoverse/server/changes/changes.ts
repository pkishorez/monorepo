import { isAbsolute, posix } from 'node:path';

import { Effect } from 'effect';

import { GitUnavailableError } from '../../contract/index.js';
import { listBranches, placeBranch } from '../git/index.js';
import { existingRoot, toGitUnavailable } from '../snapshot/index.js';
import { readChangeSet, readFileDiff } from './change-set.js';

/*
 * Git's answers about a Project: its local branches and where each is
 * read, what a branch changed since it left another, and how one file
 * changed.
 */

export function getBranches(root: string) {
  return Effect.gen(function* () {
    const folder = yield* existingRoot(root);
    return yield* fromGit(() => listBranches(folder));
  });
}

/** What `branch` (null: the folder as it is) changed since it left `base`. */
export function getChanges(root: string, branch: string | null, base: string) {
  return Effect.gen(function* () {
    const folder = yield* existingRoot(root);
    return yield* fromGit(async () =>
      readChangeSet(folder, await placeBranch(folder, branch), base),
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
    const folder = yield* existingRoot(root);
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
    const hunks = yield* fromGit(async () =>
      readFileDiff(folder, await placeBranch(folder, branch), base, normalized),
    );
    return { path, hunks };
  });
}

function fromGit<A>(run: () => Promise<A>) {
  return Effect.tryPromise({ try: run, catch: toGitUnavailable });
}
