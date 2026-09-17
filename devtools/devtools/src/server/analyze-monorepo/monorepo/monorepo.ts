import { glob } from 'node:fs/promises';
import { basename, join, matchesGlob, relative, sep } from 'node:path';

import { Effect, FileSystem } from 'effect';
import { parse } from 'yaml';

import type { PackageManifest } from '../package-graph/index.js';
import { ManifestError, readPackageManifest } from '../package/index.js';
import { MonorepoReadError } from './errors.js';

export type LoadedMonorepo = {
  readonly name: string;
  readonly manifests: readonly PackageManifest[];
};

/**
 * Reads one pnpm Monorepo: its workspace globs, negations included, and the
 * manifest of every folder they match. The root's own manifest is not a
 * Package; its name, or the folder name, names the Monorepo.
 */
export function loadMonorepo(
  root: string,
): Effect.Effect<
  LoadedMonorepo,
  MonorepoReadError | ManifestError,
  FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePath = join(root, 'pnpm-workspace.yaml');
    const text = yield* fileSystem.readFileString(workspacePath).pipe(
      Effect.mapError(
        (cause) =>
          new MonorepoReadError({
            reason: 'not-a-workspace',
            path: workspacePath,
            cause,
          }),
      ),
    );
    const patterns = yield* Effect.try({
      try: () => workspacePatterns(parse(text) as unknown),
      catch: (cause) =>
        new MonorepoReadError({
          reason: 'workspace-parse',
          path: workspacePath,
          cause,
        }),
    });
    const folders = yield* Effect.tryPromise({
      try: () => expandPatterns(root, patterns),
      catch: (cause) =>
        new MonorepoReadError({ reason: 'glob', path: root, cause }),
    });
    const manifests = yield* Effect.forEach(folders, (folder) =>
      readPackageManifest(root, folder),
    );
    const name = yield* monorepoName(root);
    return {
      name,
      manifests: manifests.filter(
        (manifest): manifest is PackageManifest => manifest !== undefined,
      ),
    };
  });
}

function workspacePatterns(document: unknown): readonly string[] {
  if (typeof document !== 'object' || document === null) return [];
  const packages = (document as { packages?: unknown }).packages;
  if (!Array.isArray(packages)) return [];
  return packages.filter((entry): entry is string => typeof entry === 'string');
}

async function expandPatterns(
  root: string,
  patterns: readonly string[],
): Promise<readonly string[]> {
  const positive = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negative = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
  const folders = new Set<string>();
  for await (const match of glob(positive, {
    cwd: root,
    withFileTypes: true,
  })) {
    if (!match.isDirectory()) continue;
    const folder = relative(root, join(match.parentPath, match.name))
      .split(sep)
      .join('/');
    if (folder === '' || folder.includes('node_modules')) continue;
    if (negative.some((pattern) => matchesGlob(folder, pattern))) continue;
    folders.add(folder);
  }
  return [...folders].sort((left, right) => left.localeCompare(right));
}

function monorepoName(
  root: string,
): Effect.Effect<string, never, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const text = yield* fileSystem
      .readFileString(join(root, 'package.json'))
      .pipe(Effect.orElseSucceed(() => '{}'));
    const name = Effect.try(
      () => (JSON.parse(text) as { name?: unknown }).name,
    );
    const parsed = yield* name.pipe(Effect.orElseSucceed(() => undefined));
    return typeof parsed === 'string' && parsed !== ''
      ? parsed
      : basename(root);
  });
}
