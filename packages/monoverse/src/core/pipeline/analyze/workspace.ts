import { Effect, Either, Schema } from 'effect';
import {
  basename,
  dirname,
  glob,
  joinPath,
  readFile,
} from '../../primitives/fs/index.js';
import { parseDependencies } from './dependency.js';
import type { AnalysisError, Workspace } from './types.js';

const RawPackageJsonSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  private: Schema.optional(Schema.Boolean),
  dependencies: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
  devDependencies: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
  peerDependencies: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
  optionalDependencies: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
});

type RawPackageJson = typeof RawPackageJsonSchema.Type;

interface DiscoverResult {
  workspaces: Workspace[];
  errors: AnalysisError[];
}

const parseWorkspace = (
  pkgPath: string,
  raw: RawPackageJson,
  workspaceNames: Set<string>,
): Workspace => ({
  name: raw.name ?? basename(dirname(pkgPath)),
  version: raw.version ?? '0.0.0',
  path: dirname(pkgPath),
  private: raw.private ?? false,
  dependencies: [
    ...parseDependencies(raw.dependencies, 'dependency', workspaceNames),
    ...parseDependencies(raw.devDependencies, 'devDependency', workspaceNames),
    ...parseDependencies(
      raw.peerDependencies,
      'peerDependency',
      workspaceNames,
    ),
    ...parseDependencies(
      raw.optionalDependencies,
      'optionalDependency',
      workspaceNames,
    ),
  ],
});

const parsePackageJson = (content: string) =>
  Effect.try(() => JSON.parse(content) as unknown).pipe(
    Effect.flatMap(Schema.decodeUnknown(RawPackageJsonSchema)),
  );

export const discoverWorkspaces = (
  root: string,
  patterns: string[],
): Effect.Effect<DiscoverResult> =>
  Effect.gen(function* () {
    const workspaces: Workspace[] = [];
    const errors: AnalysisError[] = [];

    const workspacePaths = yield* glob(patterns, {
      cwd: root,
      ignore: ['**/node_modules/**'],
      absolute: true,
    }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

    const rawPackages: Array<{ path: string; raw: RawPackageJson }> = [];
    const workspaceNames = new Set<string>();

    for (const workspacePath of workspacePaths) {
      const result = yield* readFile(workspacePath).pipe(
        Effect.flatMap(parsePackageJson),
        Effect.either,
      );

      if (Either.isRight(result)) {
        const rawPackageJson = result.right;
        const name = rawPackageJson.name ?? basename(dirname(workspacePath));
        workspaceNames.add(name);
        rawPackages.push({ path: workspacePath, raw: rawPackageJson });
      } else {
        errors.push({
          path: workspacePath,
          message: 'Failed to parse package.json',
          cause: result.left,
        });
      }
    }

    for (const { path: pkgPath, raw } of rawPackages) {
      workspaces.push(parseWorkspace(pkgPath, raw, workspaceNames));
    }

    return { workspaces, errors };
  });

export const getPackageJsonStr = (workspace: Workspace) =>
  readFile(joinPath(workspace.path, 'package.json'));
