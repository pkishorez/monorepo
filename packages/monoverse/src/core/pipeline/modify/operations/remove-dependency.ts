import { Effect } from 'effect';
import type { Workspace } from '../../analyze/types.js';
import { ALL_DEPENDENCY_KEYS, readPackageJson, writePackageJson } from '../package-json.js';
import { DependencyNotFoundError, ModifyError } from '../types.js';

export interface RemoveDependencyOptions {
  workspace: Workspace;
  dependencyName: string;
}

export const removeDependency = (
  options: RemoveDependencyOptions,
): Effect.Effect<void, DependencyNotFoundError | ModifyError> =>
  Effect.gen(function* () {
    const { workspace, dependencyName } = options;

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

    let removed = false;

    for (const key of ALL_DEPENDENCY_KEYS) {
      const deps = content[key];
      if (deps && dependencyName in deps) {
        delete deps[dependencyName];
        removed = true;
        if (Object.keys(deps).length === 0) {
          delete content[key];
        }
      }
    }

    if (!removed) {
      return yield* Effect.fail(
        new DependencyNotFoundError({
          workspace: workspace.name,
          dependencyName,
        }),
      );
    }

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
