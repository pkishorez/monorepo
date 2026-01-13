import { Effect } from "effect";
import type { ProjectAnalysis } from "../pipeline/analyze/index.js";
import {
  groupDependenciesByPackage,
  type Violation,
} from "../pipeline/validate/index.js";
import { fetchNpmPackage } from "../primitives/npm/npm-pkg.js";
import { extractVersion, calculateSemverUpdates } from "./semver.js";
import type { PackageUpdate, LoadProgress } from "./types.js";

export const getUpdates = Effect.fn(function* (
  analysis: ProjectAnalysis,
  violations: Violation[]
) {
  const pkgs = groupDependenciesByPackage(analysis);

  const violatedPackages = new Set(violations.map((v) => v.package));

  const cleanPackages = pkgs.filter(
    (pkg) => !violatedPackages.has(pkg.name)
  );

  const results = yield* Effect.forEach(
    cleanPackages,
    (pkg) =>
      fetchNpmPackage(pkg.name).pipe(
        Effect.map((npmInfo) => ({ pkg, npmInfo })),
        Effect.catchAll(() => Effect.succeed(null))
      ),
    { concurrency: 10 }
  );

  const updates: PackageUpdate[] = [];

  for (const result of results) {
    if (!result) continue;

    const { pkg, npmInfo } = result;
    const currentVersion = extractVersion(
      pkg.instances[0]?.versionRange ?? ""
    );

    if (!currentVersion) continue;

    const semverUpdates = calculateSemverUpdates(
      currentVersion,
      npmInfo.versions
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
});

export const getUpdatesWithProgress = Effect.fn(function* (
  analysis: ProjectAnalysis,
  violations: Violation[],
  onProgress: (progress: LoadProgress) => void,
  onUpdate: (update: PackageUpdate) => void
) {
  const pkgs = groupDependenciesByPackage(analysis);

  const violatedPackages = new Set(violations.map((v) => v.package));

  const cleanPackages = pkgs.filter(
    (pkg) => !violatedPackages.has(pkg.name)
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
          Effect.catchAll(() => Effect.succeed(null))
        );

        loaded++;

        if (!result) return;

        const { pkg: p, npmInfo } = result;
        const currentVersion = extractVersion(
          p.instances[0]?.versionRange ?? ""
        );

        if (!currentVersion) return;

        const semverUpdates = calculateSemverUpdates(
          currentVersion,
          npmInfo.versions
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
    { concurrency: 10 }
  );

  onProgress({ total, loaded: total, currentPackage: "" });
});
