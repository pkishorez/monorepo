import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { Effect } from 'effect';
import {
  GitError,
  loadBranches,
  loadChangeSet,
  loadFileDiff,
  loadKnownFiles,
} from 'laymos';

import { GitUnavailableError, InvalidFolderPath } from '../../rpc/index.js';

/**
 * Fulfils the Tool-neutral git contract for any folder inside a repository:
 * a Laymos Project's folder or a Monorepo root alike.
 */
export function getChanges(folder: string, baseRef?: string) {
  return Effect.gen(function* () {
    const directory = yield* existingFolder(folder);
    return yield* loadChangeSet(directory, baseRef).pipe(
      Effect.mapError(toRpcError),
    );
  });
}

export function getBranches(folder: string) {
  return Effect.gen(function* () {
    const directory = yield* existingFolder(folder);
    return yield* loadBranches(directory).pipe(Effect.mapError(toRpcError));
  });
}

export function getFileDiff(folder: string, path: string, baseRef?: string) {
  return Effect.gen(function* () {
    const directory = yield* existingFolder(folder);
    return yield* loadFileDiff(directory, path, baseRef).pipe(
      Effect.mapError(toRpcError),
    );
  });
}

export function getKnownFiles(folder: string) {
  return Effect.gen(function* () {
    const directory = yield* existingFolder(folder);
    return yield* loadKnownFiles(directory).pipe(Effect.mapError(toRpcError));
  });
}

function existingFolder(folder: string) {
  return Effect.gen(function* () {
    const expanded = expandHome(folder);
    if (!isAbsolute(expanded)) {
      return yield* new InvalidFolderPath({ reason: 'relative' });
    }

    const absolute = resolve(expanded);
    const entry = yield* Effect.tryPromise({
      try: () => stat(absolute),
      catch: () => new InvalidFolderPath({ reason: 'not-found' }),
    });
    if (!entry.isDirectory()) {
      return yield* new InvalidFolderPath({ reason: 'not-directory' });
    }
    return absolute;
  });
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function toRpcError(cause: unknown) {
  return new GitUnavailableError({
    reason: cause instanceof GitError ? cause.reason : 'command-failed',
  });
}
