import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { Effect } from 'effect';
import { GitError, loadBranches, loadChangeSet, loadFileDiff } from 'laymos';

import { GitUnavailableError, InvalidProjectPath } from '../../rpc/index.js';

export function getLaymosChanges(projectPath: string, baseRef?: string) {
  return Effect.gen(function* () {
    const configPath = yield* laymosConfigPath(projectPath);
    return yield* loadChangeSet(configPath, baseRef).pipe(
      Effect.mapError(toRpcError),
    );
  });
}

export function getLaymosBranches(projectPath: string) {
  return Effect.gen(function* () {
    const configPath = yield* laymosConfigPath(projectPath);
    return yield* loadBranches(configPath).pipe(Effect.mapError(toRpcError));
  });
}

export function getLaymosFileDiff(
  projectPath: string,
  path: string,
  baseRef?: string,
) {
  return Effect.gen(function* () {
    const configPath = yield* laymosConfigPath(projectPath);
    return yield* loadFileDiff(configPath, path, baseRef).pipe(
      Effect.mapError(toRpcError),
    );
  });
}

function laymosConfigPath(projectPath: string) {
  return Effect.gen(function* () {
    const expanded = expandHome(projectPath);
    if (!isAbsolute(expanded)) {
      return yield* new InvalidProjectPath({ reason: 'relative' });
    }

    const absolute = resolve(expanded);
    const project = yield* Effect.tryPromise({
      try: () => stat(absolute),
      catch: () => new InvalidProjectPath({ reason: 'not-found' }),
    });
    if (!project.isDirectory()) {
      return yield* new InvalidProjectPath({ reason: 'not-directory' });
    }

    return join(absolute, 'laymos.config.json');
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
