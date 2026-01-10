import { Effect, Schema } from 'effect';
import yaml from 'js-yaml';
import {
  fileExists,
  getParentDirectory,
  isRootPath,
  joinPath,
  readFile,
} from '../../primitives/fs/index.js';
import type { PackageManager } from './types.js';
import { NotAMonorepoError } from './types.js';

interface MonorepoRoot {
  root: string;
  packageManager: PackageManager;
  patterns: string[];
}

const PackageJsonSchema = Schema.Struct({
  workspaces: Schema.optional(
    Schema.Union(
      Schema.mutable(Schema.Array(Schema.String)),
      Schema.Struct({
        packages: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
      }),
    ),
  ),
});

const PnpmWorkspaceSchema = Schema.Struct({
  packages: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
});

const LOCK_FILES: { file: string; pm: PackageManager }[] = [
  { file: 'pnpm-lock.yaml', pm: 'pnpm' },
  { file: 'yarn.lock', pm: 'yarn' },
  { file: 'package-lock.json', pm: 'npm' },
  { file: 'bun.lockb', pm: 'bun' },
];

const detectPackageManager = (dirPath: string): Effect.Effect<PackageManager> =>
  Effect.gen(function* () {
    for (const { file, pm } of LOCK_FILES) {
      const exists = yield* fileExists(joinPath(dirPath, file));
      if (exists) return pm;
    }
    return 'unknown' as PackageManager;
  });

const parseYaml = (content: string) =>
  Effect.try(() => yaml.load(content) as unknown).pipe(
    Effect.flatMap(Schema.decodeUnknown(PnpmWorkspaceSchema)),
  );

const parsePackageJson = (content: string) =>
  Effect.try(() => JSON.parse(content) as unknown).pipe(
    Effect.flatMap(Schema.decodeUnknown(PackageJsonSchema)),
  );

const getPnpmWorkspacePatterns = (
  dirPath: string,
): Effect.Effect<string[] | null> =>
  Effect.gen(function* () {
    const wsPath = joinPath(dirPath, 'pnpm-workspace.yaml');
    const exists = yield* fileExists(wsPath);
    if (!exists) return null;

    const content = yield* readFile(wsPath).pipe(
      Effect.catchAll(() => Effect.succeed('')),
    );
    if (!content) return null;

    const result = yield* parseYaml(content).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );

    return result?.packages ?? null;
  });

const getPackageJsonWorkspacePatterns = (
  dirPath: string,
): Effect.Effect<string[] | null> =>
  Effect.gen(function* () {
    const pkgPath = joinPath(dirPath, 'package.json');
    const exists = yield* fileExists(pkgPath);
    if (!exists) return null;

    const content = yield* readFile(pkgPath).pipe(
      Effect.catchAll(() => Effect.succeed('')),
    );
    if (!content) return null;

    const pkg = yield* parsePackageJson(content).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (!pkg) return null;

    if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
    if (Array.isArray(pkg.workspaces?.packages)) return pkg.workspaces.packages;
    return null;
  });

const hasPackageJson = (dirPath: string): Effect.Effect<boolean> =>
  fileExists(joinPath(dirPath, 'package.json'));

const toPackageJsonGlob = (patterns: string[]): string[] =>
  patterns.map((p) => joinPath(p, 'package.json'));

interface FindMonorepoRootOptions {
  stopAt?: string;
}

export const findMonorepoRoot = (
  startPath: string,
  options: FindMonorepoRootOptions = {},
): Effect.Effect<MonorepoRoot, NotAMonorepoError> =>
  Effect.gen(function* () {
    let currentPath = startPath;
    let singleRepoCandidate: string | null = null;
    const stopAt = options.stopAt;

    while (true) {
      const pnpmPatterns = yield* getPnpmWorkspacePatterns(currentPath);
      if (pnpmPatterns) {
        return {
          root: currentPath,
          packageManager: 'pnpm' as PackageManager,
          patterns: toPackageJsonGlob(pnpmPatterns),
        };
      }

      const pkgPatterns = yield* getPackageJsonWorkspacePatterns(currentPath);
      if (pkgPatterns) {
        const pm = yield* detectPackageManager(currentPath);
        return {
          root: currentPath,
          packageManager: pm,
          patterns: toPackageJsonGlob(pkgPatterns),
        };
      }

      if (!singleRepoCandidate) {
        const hasPkg = yield* hasPackageJson(currentPath);
        if (hasPkg) {
          singleRepoCandidate = currentPath;
        }
      }

      if (isRootPath(currentPath)) break;
      if (stopAt && currentPath === stopAt) break;

      currentPath = yield* getParentDirectory(currentPath);
    }

    if (singleRepoCandidate) {
      const pm = yield* detectPackageManager(singleRepoCandidate);
      return {
        root: singleRepoCandidate,
        packageManager: pm,
        patterns: ['./package.json'],
      };
    }

    return yield* Effect.fail(
      new NotAMonorepoError({
        startPath,
        message: 'No package.json found in directory tree',
      }),
    );
  });
