import { join } from 'node:path';

import { Effect, FileSystem } from 'effect';
import { parse } from 'yaml';

import { MonorepoReadError } from './errors.js';

/**
 * The workspace globs of the Monorepo at `root`. `pnpm-workspace.yaml` lists
 * them under `packages:`, and wins when present. Otherwise the root
 * `package.json` lists them under `workspaces`, either as an array (npm, yarn,
 * bun) or as `{ packages: [...] }` (yarn; `nohoist` and other keys ignored).
 * A root with neither is not a Monorepo; a file present but not in one of
 * these shapes is a parse failure.
 */
export function readWorkspaceGlobs(
  root: string,
): Effect.Effect<readonly string[], MonorepoReadError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const pnpmPath = join(root, 'pnpm-workspace.yaml');
    const pnpmText = yield* readIfPresent(pnpmPath);
    if (pnpmText !== undefined) {
      return yield* Effect.try({
        try: () => pnpmGlobs(parse(pnpmText) as unknown),
        catch: (cause) => parseError(pnpmPath, cause),
      });
    }

    const manifestPath = join(root, 'package.json');
    const manifestText = yield* readIfPresent(manifestPath);
    if (manifestText === undefined) return yield* notAMonorepo(root);
    const manifest = yield* Effect.try({
      try: () => JSON.parse(manifestText) as unknown,
      catch: (cause) => parseError(manifestPath, cause),
    });
    if (!isRecord(manifest)) return yield* parseError(manifestPath);
    if (!('workspaces' in manifest)) return yield* notAMonorepo(root);
    const globs = workspacesGlobs(manifest.workspaces);
    if (globs === undefined) return yield* parseError(manifestPath);
    return globs;
  });
}

function readIfPresent(
  path: string,
): Effect.Effect<string | undefined, never, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem
      .readFileString(path)
      .pipe(Effect.orElseSucceed(() => undefined));
  });
}

function pnpmGlobs(document: unknown): readonly string[] {
  if (!isRecord(document)) return [];
  const packages = document.packages;
  if (!Array.isArray(packages)) return [];
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

function notAMonorepo(root: string): MonorepoReadError {
  return new MonorepoReadError({ reason: 'not-a-monorepo', path: root });
}

function parseError(path: string, cause?: unknown): MonorepoReadError {
  return new MonorepoReadError({ reason: 'workspace-parse', path, cause });
}
