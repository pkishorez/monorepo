import { Effect } from 'effect';
import type { DependencyType, Workspace } from '../../analyze/types.js';
import {
  ALL_DEPENDENCY_KEYS,
  type DependencyKey,
  readPackageJson,
  writePackageJson,
} from '../package-json.js';
import { ModifyError } from '../types.js';

export interface UpsertDependencyOptions {
  workspace: Workspace;
  dependencyName: string;
  versionRange: string;
  dependencyType: DependencyType;
}

const DEPENDENCY_TYPE_TO_KEY: Record<DependencyType, DependencyKey> = {
  dependency: 'dependencies',
  devDependency: 'devDependencies',
  peerDependency: 'peerDependencies',
  optionalDependency: 'optionalDependencies',
};

export const upsertDependency = (
  options: UpsertDependencyOptions,
): Effect.Effect<void, ModifyError> =>
  Effect.gen(function* () {
    const { workspace, dependencyName, versionRange, dependencyType } = options;

    const content = yield* readPackageJson(workspace).pipe(
      Effect.mapError(
        (e) =>
          new ModifyError({
            workspace: workspace.name,
            message: 'Failed to read package.json',
            cause: e,
          }),
      ),
    );

    const targetKey = DEPENDENCY_TYPE_TO_KEY[dependencyType];

    for (const key of ALL_DEPENDENCY_KEYS) {
      if (key === targetKey || key === 'peerDependencies') continue;
      const deps = content[key];
      if (deps && dependencyName in deps) {
        delete deps[dependencyName];
        if (Object.keys(deps).length === 0) {
          delete content[key];
        }
      }
    }

    if (!content[targetKey]) {
      content[targetKey] = {};
    }
    content[targetKey]![dependencyName] = versionRange;

    yield* writePackageJson(workspace, JSON.stringify(content)).pipe(
      Effect.mapError(
        (e) =>
          new ModifyError({
            workspace: workspace.name,
            message: 'Failed to write package.json',
            cause: e,
          }),
      ),
    );
  });
