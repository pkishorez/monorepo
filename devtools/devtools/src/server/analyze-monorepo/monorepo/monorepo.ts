import { glob } from 'node:fs/promises';
import { basename, join, matchesGlob, relative, sep } from 'node:path';

import { Effect, FileSystem } from 'effect';

import type { PackageManifest } from '../package-graph/index.js';
import { ManifestError, readPackageManifest } from '../package/index.js';
import { MonorepoReadError } from './errors.js';
import { readWorkspaceGlobs } from './workspace-globs.js';

export type LoadedMonorepo = {
  readonly kind: 'monorepo' | 'single-package';
  readonly name: string;
  readonly manifests: readonly PackageManifest[];
};

/**
 * Reads one Monorepo: its workspace globs, from `pnpm-workspace.yaml` or the
 * root `package.json` `workspaces` field, negations included, and the
 * manifest of every folder they match. The root's own manifest is not a
 * Package; its name, or the folder name, names the Monorepo. A root
 * `package.json` that lists no workspace globs is a Single Package: its own
 * manifest is its one Package, at path `.`, named by the folder when it
 * names nothing.
 */
export function loadMonorepo(
  root: string,
): Effect.Effect<
  LoadedMonorepo,
  MonorepoReadError | ManifestError,
  FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    const patterns = yield* readWorkspaceGlobs(root);
    const name = yield* monorepoName(root);
    if (patterns === undefined) {
      const manifest = yield* readPackageManifest(root, '.', name);
      return {
        kind: 'single-package',
        name,
        manifests: manifest === undefined ? [] : [manifest],
      } as const;
    }
    const folders = yield* Effect.tryPromise({
      try: () => expandPatterns(root, patterns),
      catch: (cause) =>
        new MonorepoReadError({ reason: 'glob', path: root, cause }),
    });
    const manifests = yield* Effect.forEach(folders, (folder) =>
      readPackageManifest(root, folder),
    );
    return {
      kind: 'monorepo',
      name,
      manifests: manifests.filter(
        (manifest): manifest is PackageManifest => manifest !== undefined,
      ),
    };
  });
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
