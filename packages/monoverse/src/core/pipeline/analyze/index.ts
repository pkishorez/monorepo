import { Effect } from 'effect';
import { findMonorepoRoot } from './monorepo.js';
import { discoverWorkspaces } from './workspace.js';
import type { MonorepoAnalysis, NotAMonorepoError } from './types.js';

export const analyzeMonorepo = (
  startPath: string,
): Effect.Effect<MonorepoAnalysis, NotAMonorepoError> =>
  Effect.gen(function* () {
    const { root, packageManager, patterns } =
      yield* findMonorepoRoot(startPath);
    const { workspaces, errors } = yield* discoverWorkspaces(root, patterns);

    return {
      root,
      packageManager,
      workspaces,
      errors,
    };
  });

export { NotAMonorepoError } from './types.js';
export { getPackageJsonStr } from './workspace.js';
export type {
  MonorepoAnalysis,
  Workspace,
  DependencyType,
} from './types.js';
