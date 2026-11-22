import { basename, matchesGlob } from 'node:path';

import { Effect } from 'effect';

import { readText, type Snapshot } from '../../snapshot/index.js';
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
 * Reads one Monorepo at a branch: its workspace globs, from
 * `pnpm-workspace.yaml` or the root `package.json` `workspaces` field,
 * negations included, and the manifest of every folder they match that
 * holds a `package.json` among `files`, never inside `node_modules`. The
 * root's own manifest is not a Package; its name, or the folder name, names
 * the Monorepo. A root
 * `package.json` that lists no workspace globs is a Single Package: its own
 * manifest is its one Package, at path `.`, named by the folder when it
 * names nothing.
 */
export function loadMonorepo(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
): Effect.Effect<LoadedMonorepo, MonorepoReadError | ManifestError> {
  return Effect.gen(function* () {
    const patterns = yield* readWorkspaceGlobs(snapshot);
    const name = yield* monorepoName(snapshot);
    if (patterns === undefined) {
      const manifest = yield* readPackageManifest(snapshot, '.', name);
      return {
        kind: 'single-package',
        name,
        manifests: manifest === undefined ? [] : [manifest],
      } as const;
    }
    const folders = yield* Effect.try({
      try: () => matchFolders(files, patterns),
      catch: (cause) =>
        new MonorepoReadError({ reason: 'glob', path: snapshot.root, cause }),
    });
    const manifests = yield* Effect.forEach(
      folders,
      (folder) => readPackageManifest(snapshot, folder),
      { concurrency: 16 },
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

/** The folders holding a `package.json` that the workspace globs match, sorted. */
function matchFolders(
  files: ReadonlyArray<string>,
  patterns: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const positive = patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .map(normalizePattern);
  const negative = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => normalizePattern(pattern.slice(1)));
  const matches = (folder: string, globs: ReadonlyArray<string>) =>
    globs.some(
      (pattern) =>
        matchesGlob(folder, pattern) ||
        // `packages/**` holds `packages` itself, as a glob walk finds it.
        (pattern.endsWith('/**') && folder === pattern.slice(0, -3)),
    );
  const folders = new Set<string>();
  for (const path of files) {
    if (!path.endsWith('/package.json')) continue;
    const folder = path.slice(0, -'/package.json'.length);
    if (folder.split('/').includes('node_modules')) continue;
    if (!matches(folder, positive) || matches(folder, negative)) continue;
    folders.add(folder);
  }
  return [...folders].sort((left, right) => left.localeCompare(right));
}

// `./packages/*/` and `packages/*` are one glob.
function normalizePattern(pattern: string): string {
  return pattern.replace(/^\.\//, '').replace(/\/+$/, '');
}

function monorepoName(snapshot: Snapshot): Effect.Effect<string> {
  return Effect.gen(function* () {
    const text = yield* Effect.tryPromise(() =>
      readText(snapshot, 'package.json'),
    ).pipe(Effect.orElseSucceed(() => undefined));
    const parsed = yield* Effect.try(
      () => (JSON.parse(text ?? '{}') as { name?: unknown }).name,
    ).pipe(Effect.orElseSucceed(() => undefined));
    return typeof parsed === 'string' && parsed !== ''
      ? parsed
      : basename(snapshot.root);
  });
}
