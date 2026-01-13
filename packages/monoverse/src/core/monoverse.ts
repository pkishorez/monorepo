import { Effect } from "effect";
import * as semver from "semver";
import {
  analyzeProject,
  type ProjectAnalysis,
  type Workspace,
  type DependencyType,
} from "./pipeline/analyze/index.js";
import {
  upsertDependency,
  removeDependency,
  formatPackageJson,
} from "./pipeline/modify/index.js";
import {
  detectVersionMismatches,
  detectUnpinnedVersions,
  detectFormatPackageJson,
  detectDuplicateWorkspaces,
  groupDependenciesByPackage,
  type Violation,
} from "./pipeline/validate/index.js";
import type { PackageGroup } from "./pipeline/validate/types.js";
import { fetchNpmPackage } from "./primitives/npm/npm-pkg.js";

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

export interface SemverUpdates {
  patch: string | null;
  minor: string | null;
  major: string | null;
}

export interface PackageUpdate {
  name: string;
  currentVersion: string;
  updates: SemverUpdates;
  instances: PackageGroup["instances"];
}

export interface LoadProgress {
  total: number;
  loaded: number;
  currentPackage: string;
}

function extractVersion(versionRange: string): string | null {
  const cleaned = versionRange.replace(/[\^~>=<\s]/g, "");
  return semver.valid(semver.coerce(cleaned));
}

function calculateSemverUpdates(
  currentVersion: string,
  allVersions: string[],
): SemverUpdates {
  const current = semver.parse(currentVersion);
  if (!current) {
    return { patch: null, minor: null, major: null };
  }

  const validVersions = allVersions
    .map((v) => semver.parse(v))
    .filter((v): v is semver.SemVer => v !== null && !v.prerelease.length)
    .filter((v) => semver.gt(v, current))
    .sort(semver.compare);

  let patch: string | null = null;
  let minor: string | null = null;
  let major: string | null = null;

  for (const v of validVersions) {
    if (v.major === current.major && v.minor === current.minor) {
      patch = v.version;
    } else if (v.major === current.major && v.minor > current.minor) {
      minor = v.version;
    } else if (v.major > current.major) {
      major = v.version;
    }
  }

  return { patch, minor, major };
}

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

    getUpdates: Effect.fn(function* (
      analysis: ProjectAnalysis,
      violations: Violation[],
    ) {
      const pkgs = groupDependenciesByPackage(analysis);

      const violatedPackages = new Set(violations.map((v) => v.package));

      const cleanPackages = pkgs.filter(
        (pkg) => !violatedPackages.has(pkg.name),
      );

      const results = yield* Effect.forEach(
        cleanPackages,
        (pkg) =>
          fetchNpmPackage(pkg.name).pipe(
            Effect.map((npmInfo) => ({ pkg, npmInfo })),
            Effect.catchAll(() => Effect.succeed(null)),
          ),
        { concurrency: 10 },
      );

      const updates: PackageUpdate[] = [];

      for (const result of results) {
        if (!result) continue;

        const { pkg, npmInfo } = result;
        const currentVersion = extractVersion(
          pkg.instances[0]?.versionRange ?? "",
        );

        if (!currentVersion) continue;

        const semverUpdates = calculateSemverUpdates(
          currentVersion,
          npmInfo.versions,
        );

        if (semverUpdates.patch || semverUpdates.minor || semverUpdates.major) {
          updates.push({
            name: pkg.name,
            currentVersion,
            updates: semverUpdates,
            instances: pkg.instances,
          });
        }
      }

      return updates;
    }),

    getUpdatesWithProgress: Effect.fn(function* (
      analysis: ProjectAnalysis,
      violations: Violation[],
      onProgress: (progress: LoadProgress) => void,
      onUpdate: (update: PackageUpdate) => void,
    ) {
      const pkgs = groupDependenciesByPackage(analysis);

      const violatedPackages = new Set(violations.map((v) => v.package));

      const cleanPackages = pkgs.filter(
        (pkg) => !violatedPackages.has(pkg.name),
      );

      const total = cleanPackages.length;
      let loaded = 0;

      yield* Effect.forEach(
        cleanPackages,
        (pkg) =>
          Effect.gen(function* () {
            onProgress({ total, loaded, currentPackage: pkg.name });

            const result = yield* fetchNpmPackage(pkg.name).pipe(
              Effect.map((npmInfo) => ({ pkg, npmInfo })),
              Effect.catchAll(() => Effect.succeed(null)),
            );

            loaded++;

            if (!result) return;

            const { pkg: p, npmInfo } = result;
            const currentVersion = extractVersion(
              p.instances[0]?.versionRange ?? "",
            );

            if (!currentVersion) return;

            const semverUpdates = calculateSemverUpdates(
              currentVersion,
              npmInfo.versions,
            );

            if (
              semverUpdates.patch ||
              semverUpdates.minor ||
              semverUpdates.major
            ) {
              onUpdate({
                name: p.name,
                currentVersion,
                updates: semverUpdates,
                instances: p.instances,
              });
            }
          }),
        { concurrency: 10 },
      );

      onProgress({ total, loaded: total, currentPackage: "" });
    }),
  },
}) {}
