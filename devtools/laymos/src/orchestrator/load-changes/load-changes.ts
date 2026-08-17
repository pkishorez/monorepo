import { dirname, resolve } from 'node:path';

import { Effect } from 'effect';

import type { ChangeSet, FileDiff } from '../../change-set-schema/index.js';
import { Git, GitLive, type GitError } from '../../services/git/index.js';

export function loadChangeSet(
  configPath: string,
  baseRef = 'HEAD',
): Effect.Effect<ChangeSet, GitError> {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.changeSet(projectDir(configPath), baseRef);
  }).pipe(Effect.provide(GitLive));
}

export function loadFileDiff(
  configPath: string,
  path: string,
  baseRef = 'HEAD',
): Effect.Effect<FileDiff, GitError> {
  return Effect.gen(function* () {
    const git = yield* Git;
    return yield* git.fileDiff(projectDir(configPath), baseRef, path);
  }).pipe(Effect.provide(GitLive));
}

function projectDir(configPath: string): string {
  return dirname(resolve(configPath));
}
