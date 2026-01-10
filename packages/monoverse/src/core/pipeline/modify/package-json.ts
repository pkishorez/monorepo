import { Effect } from 'effect';
import sortPackageJson from 'sort-package-json';
import type { Workspace } from '../analyze/types.js';
import { joinPath, readFile, writeFile } from '../../primitives/fs/index.js';
import { PackageJsonParseError, PackageJsonWriteError } from './types.js';

export interface PackageDependencies {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export type DependencyKey = keyof PackageDependencies;

export const ALL_DEPENDENCY_KEYS: DependencyKey[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

export const readPackageJson = (
  workspace: Workspace,
): Effect.Effect<PackageDependencies, PackageJsonParseError> =>
  Effect.gen(function* () {
    const filePath = joinPath(workspace.path, 'package.json');
    const raw = yield* readFile(filePath).pipe(
      Effect.mapError(
        (e) => new PackageJsonParseError({ workspace: workspace.name, cause: e }),
      ),
    );

    return yield* Effect.try({
      try: () => JSON.parse(raw) as PackageDependencies,
      catch: (cause) =>
        new PackageJsonParseError({ workspace: workspace.name, cause }),
    });
  });

export const writePackageJson = (
  workspace: Workspace,
  content: string,
): Effect.Effect<void, PackageJsonWriteError> =>
  Effect.gen(function* () {
    const filePath = joinPath(workspace.path, 'package.json');
    const formatted = sortPackageJson(content);

    const current = yield* readFile(filePath).pipe(
      Effect.mapError(
        (e) =>
          new PackageJsonWriteError({ workspace: workspace.name, cause: e }),
      ),
    );

    if (current === formatted) {
      return;
    }

    yield* writeFile(filePath, formatted).pipe(
      Effect.mapError(
        (e) =>
          new PackageJsonWriteError({ workspace: workspace.name, cause: e }),
      ),
    );
  });
