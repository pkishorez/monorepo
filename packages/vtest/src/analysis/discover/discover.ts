import { Effect } from 'effect';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Feature, TestGroupRef } from '../model/index.js';
import { parseDirectives } from '../parse/index.js';

/** Error raised when the filesystem cannot be read during discovery. */
export class DiscoverError extends Error {
  readonly _tag = 'DiscoverError';
  readonly reason: unknown;
  constructor(
    readonly pathName: string,
    reason: unknown,
  ) {
    super(`failed to read ${pathName}`);
    this.reason = reason;
  }
}

const readDir = (
  dir: string,
): Effect.Effect<ReadonlyArray<Dirent>, DiscoverError> =>
  Effect.tryPromise({
    try: () => fs.readdir(dir, { withFileTypes: true }),
    catch: (cause) => new DiscoverError(dir, cause),
  });

const readDirOptional = (
  dir: string,
): Effect.Effect<ReadonlyArray<Dirent>, DiscoverError> =>
  readDir(dir).pipe(
    Effect.catch((error) =>
      isMissing(error.reason)
        ? Effect.succeed([] as ReadonlyArray<Dirent>)
        : Effect.fail(error),
    ),
  );

const readFile = (file: string): Effect.Effect<string, DiscoverError> =>
  Effect.tryPromise({
    try: () => fs.readFile(file, 'utf8'),
    catch: (cause) => new DiscoverError(file, cause),
  });

const isMissing = (cause: unknown): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  (cause as { code?: string }).code === 'ENOENT';

const discoverGroups = (
  testsDir: string,
): Effect.Effect<ReadonlyArray<TestGroupRef>, DiscoverError> =>
  Effect.gen(function* () {
    const entries = yield* readDirOptional(testsDir);
    const groups: Array<TestGroupRef> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(testsDir, entry.name);
      const files = yield* readDirOptional(dir);
      const testFiles = files
        .filter((f) => f.isFile() && f.name.endsWith('.test.ts'))
        .map((f) => f.name)
        .sort();
      groups.push({ id: entry.name, dir, testFiles });
    }
    return groups.sort((a, b) => a.id.localeCompare(b.id));
  });

const discoverFeature = (
  featuresDir: string,
  name: string,
): Effect.Effect<Feature, DiscoverError> =>
  Effect.gen(function* () {
    const dir = path.join(featuresDir, name);
    const docPath = path.join(dir, 'doc.md');
    const doc = yield* readFile(docPath).pipe(
      Effect.catch((error) =>
        isMissing(error.reason) ? Effect.succeed('') : Effect.fail(error),
      ),
    );
    const directives = parseDirectives(doc);
    const groups = yield* discoverGroups(path.join(dir, 'tests'));
    return { name, dir, docPath, doc, directives, groups };
  });

/**
 * Read a package's `vtest/home.md` overview, or `null` when the package does
 * not ship one. This is the landing prose shown above the feature list — it is
 * intentionally outside `toc.ts` (which lists only features).
 */
export const loadHome = (
  packageRoot: string,
): Effect.Effect<string | null, DiscoverError> =>
  readFile(path.join(packageRoot, 'vtest', 'home.md')).pipe(
    Effect.catch((error) =>
      isMissing(error.reason) ? Effect.succeed(null) : Effect.fail(error),
    ),
  );

/**
 * Scan a package root's `vtest/features/*` tree, returning one {@link Feature}
 * per folder with its parsed `doc.md` directives and discovered test groups.
 */
export const discoverFeatures = (
  packageRoot: string,
): Effect.Effect<ReadonlyArray<Feature>, DiscoverError> =>
  Effect.gen(function* () {
    const featuresDir = path.join(packageRoot, 'vtest', 'features');
    const entries = yield* readDirOptional(featuresDir);
    const names = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    return yield* Effect.forEach(names, (name) =>
      discoverFeature(featuresDir, name),
    );
  });
