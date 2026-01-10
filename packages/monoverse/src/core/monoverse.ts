import { Effect } from 'effect';
import {
  analyzeMonorepo,
  type MonorepoAnalysis,
  type Workspace,
  type DependencyType,
} from './pipeline/analyze/index.js';
import {
  upsertDependency,
  removeDependency,
  formatPackageJson,
} from './pipeline/modify/index.js';
import {
  detectVersionMismatches,
  detectUnpinnedVersions,
  detectFormatPackageJson,
} from './pipeline/validate/index.js';

interface AddPackageOptions {
  packageName: string;
  versionRange: string;
  dependencyType: DependencyType;
  workspace: Workspace;
}

interface RemovePackageOptions {
  packageName: string;
  workspace: Workspace;
}

export class Monoverse extends Effect.Service<Monoverse>()('Monoverse', {
  succeed: {
    analyze: (startPath: string) => analyzeMonorepo(startPath),

    validate: (analysis: MonorepoAnalysis) =>
      Effect.gen(function* () {
        const mismatches = yield* detectVersionMismatches(analysis);
        const unpinned = yield* detectUnpinnedVersions(analysis);
        const formatting = yield* detectFormatPackageJson(analysis);
        return [...mismatches, ...unpinned, ...formatting];
      }),

    addPackage: (options: AddPackageOptions) =>
      upsertDependency({
        workspace: options.workspace,
        dependencyName: options.packageName,
        versionRange: options.versionRange,
        dependencyType: options.dependencyType,
      }),

    removePackage: (options: RemovePackageOptions) =>
      removeDependency({
        workspace: options.workspace,
        dependencyName: options.packageName,
      }),

    formatWorkspace: (workspace: Workspace) => formatPackageJson(workspace),

    formatAllWorkspaces: (analysis: MonorepoAnalysis) =>
      Effect.forEach(analysis.workspaces, formatPackageJson, {
        discard: true,
      }),
  },
}) {}
