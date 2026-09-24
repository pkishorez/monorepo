import { resolve } from 'node:path';

import { Effect } from 'effect';

import type {
  Branch,
  ChangeSet,
  FileDiff,
} from '../../change-set-schema/index.js';
import { Git, GitLive, type GitError } from '../../services/git/index.js';

// Each loader works on any folder inside a git repository; paths are relative
// to that folder.
export function loadChangeSet(
  folder: string,
  baseRef = 'HEAD',
): Effect.Effect<ChangeSet, GitError> {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.changeSet(resolve(folder), baseRef);
  }).pipe(Effect.provide(GitLive));
}

export function loadFileDiff(
  folder: string,
  path: string,
  baseRef = 'HEAD',
): Effect.Effect<FileDiff, GitError> {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.fileDiff(resolve(folder), baseRef, path);
  }).pipe(Effect.provide(GitLive));
}

export function loadBranches(
  folder: string,
): Effect.Effect<readonly Branch[], GitError> {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.branches(resolve(folder));
  }).pipe(Effect.provide(GitLive));
}

export function loadKnownFiles(
  folder: string,
): Effect.Effect<readonly string[], GitError> {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.knownFiles(resolve(folder));
  }).pipe(Effect.provide(GitLive));
}
