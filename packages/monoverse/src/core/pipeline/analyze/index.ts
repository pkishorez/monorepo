import { Effect } from 'effect';
import { findMonorepoRoot } from './monorepo.js';
import { discoverWorkspaces } from './workspace.js';
import { findConfigRoot, analyzeFromConfig } from './config.js';
import type { ProjectAnalysis, NotAMonorepoError } from './types.js';

export const analyzeProject = (
  startPath: string,
): Effect.Effect<ProjectAnalysis, NotAMonorepoError> =>
  Effect.gen(function* () {
    const configRoot = yield* findConfigRoot(startPath);

    if (configRoot) {
      return yield* analyzeFromConfig(configRoot);
    }

    const { root, patterns } = yield* findMonorepoRoot(startPath);
    const { workspaces, errors } = yield* discoverWorkspaces(root, patterns);

    return {
      root,
      workspaces,
      errors,
    };
  });

export { NotAMonorepoError } from './types.js';
export { getPackageJsonStr } from './workspace.js';
export type {
  ProjectAnalysis,
  Workspace,
  DependencyType,
} from './types.js';
