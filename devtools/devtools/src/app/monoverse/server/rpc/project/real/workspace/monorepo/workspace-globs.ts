import { join } from 'node:path';

import { Effect } from 'effect';
import { parse } from 'yaml';

import type { Snapshot } from '../../../../../services/snapshots/contract/index.js';
import { readText } from '../../read-text.js';
import { MonorepoReadError } from './errors.js';

export function readWorkspaceGlobs(
  snapshot: Snapshot,
): Effect.Effect<readonly string[] | undefined, MonorepoReadError> {
  return Effect.gen(function* () {
    const { root } = snapshot;
    const pnpmPath = join(root, 'pnpm-workspace.yaml');
    const pnpmText = yield* readIfPresent(snapshot, 'pnpm-workspace.yaml');
    if (pnpmText !== undefined) {
      return yield* Effect.try({
        try: () => pnpmGlobs(parse(pnpmText) as unknown),
        catch: (cause) => parseError(pnpmPath, cause),
      });
    }

    const manifestPath = join(root, 'package.json');
    const manifestText = yield* readIfPresent(snapshot, 'package.json');
    if (manifestText === undefined) return yield* noPackageJson(root);
    const manifest = yield* Effect.try({
      try: () => JSON.parse(manifestText) as unknown,
      catch: (cause) => parseError(manifestPath, cause),
    });
    if (!isRecord(manifest)) return yield* parseError(manifestPath);
    if (!('workspaces' in manifest)) return undefined;
    const globs = workspacesGlobs(manifest.workspaces);
    if (globs === undefined) return yield* parseError(manifestPath);
    return globs;
  });
}

function readIfPresent(
  snapshot: Snapshot,
  path: string,
): Effect.Effect<string | undefined> {
  return Effect.tryPromise(() => readText(snapshot, path)).pipe(
    Effect.orElseSucceed(() => undefined),
  );
}

function pnpmGlobs(document: unknown): readonly string[] | undefined {
  if (!isRecord(document)) return undefined;
  const packages = document.packages;
  if (!Array.isArray(packages)) return undefined;
  return packages.filter((entry): entry is string => typeof entry === 'string');
}

function workspacesGlobs(workspaces: unknown): readonly string[] | undefined {
  if (isStringArray(workspaces)) return workspaces;
  if (isRecord(workspaces) && isStringArray(workspaces.packages))
    return workspaces.packages;
  return undefined;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function noPackageJson(root: string): MonorepoReadError {
  return new MonorepoReadError({ reason: 'no-package-json', path: root });
}

function parseError(path: string, cause?: unknown): MonorepoReadError {
  return new MonorepoReadError({ reason: 'workspace-parse', path, cause });
}
