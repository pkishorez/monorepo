import { Effect } from "effect";
import {
  analyzeProject,
  type ProjectAnalysis,
  type Workspace,
} from "../pipeline/analyze/index.js";
import {
  upsertDependency,
  removeDependency,
  formatPackageJson,
} from "../pipeline/modify/index.js";
import {
  detectVersionMismatches,
  detectUnpinnedVersions,
  detectFormatPackageJson,
  detectDuplicateWorkspaces,
} from "../pipeline/validate/index.js";
import type { AddPackageOptions, RemovePackageOptions } from "./types.js";
import { getUpdates, getUpdatesWithProgress } from "./updates.js";

export type { SemverUpdates, PackageUpdate, LoadProgress } from "./types.js";

export class Monoverse extends Effect.Service<Monoverse>()("Monoverse", {
  succeed: {
    analyze: (startPath: string) => analyzeProject(startPath),

    validate: (analysis: ProjectAnalysis) =>
      Effect.gen(function* () {
        const duplicates = yield* detectDuplicateWorkspaces(analysis);
        const mismatches = yield* detectVersionMismatches(analysis);
        const unpinned = yield* detectUnpinnedVersions(analysis);
        const formatting = yield* detectFormatPackageJson(analysis);
        return [...duplicates, ...mismatches, ...unpinned, ...formatting];
      }),

    upsertDependency: (options: AddPackageOptions) =>
      upsertDependency({
        workspace: options.workspace,
        dependencyName: options.packageName,
        versionRange: options.versionRange,
        dependencyType: options.dependencyType,
      }),

    removeDependency: (options: RemovePackageOptions) =>
      removeDependency({
        workspace: options.workspace,
        dependencyName: options.packageName,
      }),

    formatWorkspace: (workspace: Workspace) => formatPackageJson(workspace),

    formatAllWorkspaces: (analysis: ProjectAnalysis) =>
      Effect.forEach(analysis.workspaces, formatPackageJson, {
        discard: true,
      }),

    getUpdates,

    getUpdatesWithProgress,
  },
}) {}
