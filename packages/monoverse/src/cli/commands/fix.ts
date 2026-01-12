import { Command, Options, Prompt } from "@effect/cli";
import { Console, Effect } from "effect";
import { Monoverse } from "../../core/index.js";
import type { Workspace } from "../../core/pipeline/analyze/index.js";
import type {
  ViolationUnpinnedVersion,
  ViolationVersionMismatch,
  ViolationDuplicateWorkspace,
} from "../../core/pipeline/validate/index.js";
import { normalizeSemver } from "../../core/primitives/semver/index.js";
import { theme as c } from "../../theme.js";

const interactiveOption = Options.boolean("interactive").pipe(
  Options.withAlias("i"),
  Options.withDefault(false),
);

interface MismatchInfo {
  versions: string[];
  workspacesByVersion: Map<string, ViolationVersionMismatch[]>;
}

const groupMismatchesByPackage = (
  violations: ViolationVersionMismatch[],
): Map<string, MismatchInfo> => {
  const result = new Map<string, MismatchInfo>();

  for (const v of violations) {
    if (!result.has(v.package)) {
      result.set(v.package, {
        versions: v.allVersions,
        workspacesByVersion: new Map(),
      });
    }

    const info = result.get(v.package)!;
    if (!info.workspacesByVersion.has(v.versionRange)) {
      info.workspacesByVersion.set(v.versionRange, []);
    }
    info.workspacesByVersion.get(v.versionRange)!.push(v);
  }

  return result;
};

export const fix = Command.make(
  "fix",
  { interactive: interactiveOption },
  ({ interactive }) =>
    Effect.gen(function* () {
      const monoverse = yield* Monoverse;

      let analysis = yield* monoverse.analyze(process.cwd());
      let violations = yield* monoverse.validate(analysis);

      if (violations.length === 0) {
        yield* Console.log(`${c.success}No issues found${c.reset}`);
        return;
      }

      const duplicateViolations = violations.filter(
        (v): v is ViolationDuplicateWorkspace =>
          v._tag === "ViolationDuplicateWorkspace",
      );

      if (duplicateViolations.length > 0) {
        yield* Console.error(
          `${c.warning}Cannot fix: duplicate workspace names detected${c.reset}\n`,
        );
        for (const v of duplicateViolations) {
          yield* Console.error(`${c.primary}${v.workspace}${c.reset}`);
          for (const path of v.paths) {
            yield* Console.error(`  ${c.accent}${path}${c.reset}`);
          }
        }
        yield* Console.error(
          `\n${c.muted}Rename the workspaces to have unique names.${c.reset}`,
        );
        return;
      }

      let formattedCount = 0;
      let pinnedCount = 0;
      let mismatchFixedCount = 0;

      const formatViolations = violations.filter(
        (v) => v._tag === "ViolationFormatPackageJson",
      );

      if (formatViolations.length > 0) {
        const workspacesByName = new Map<string, Workspace>(
          analysis.workspaces.map((w) => [w.name, w]),
        );
        const workspacesToFormat = new Set(
          formatViolations.map((v) => v.workspace),
        );

        for (const workspaceName of workspacesToFormat) {
          const workspace = workspacesByName.get(workspaceName);
          if (!workspace) continue;

          const result = yield* monoverse.formatWorkspace(workspace).pipe(
            Effect.map(() => true),
            Effect.catchAll(() => Effect.succeed(false)),
          );

          if (result) formattedCount++;
        }

        analysis = yield* monoverse.analyze(process.cwd());
        violations = yield* monoverse.validate(analysis);
      }

      const unpinnedViolations = violations.filter(
        (v): v is ViolationUnpinnedVersion =>
          v._tag === "ViolationUnpinnedVersion",
      );

      if (unpinnedViolations.length > 0) {
        const workspacesByName = new Map<string, Workspace>(
          analysis.workspaces.map((w) => [w.name, w]),
        );

        for (const violation of unpinnedViolations) {
          const workspace = workspacesByName.get(violation.workspace);
          if (!workspace) continue;

          const pinnedVersion = yield* normalizeSemver(
            violation.versionRange,
          ).pipe(Effect.catchAll(() => Effect.succeed(null)));
          if (!pinnedVersion) continue;

          const result = yield* monoverse
            .upsertDependency({
              workspace,
              packageName: violation.package,
              versionRange: pinnedVersion,
              dependencyType: violation.dependencyType,
            })
            .pipe(
              Effect.map(() => true),
              Effect.catchAll(() => Effect.succeed(false)),
            );

          if (result) pinnedCount++;
        }

        yield* monoverse.formatAllWorkspaces(analysis);

        analysis = yield* monoverse.analyze(process.cwd());
        violations = yield* monoverse.validate(analysis);
      }

      const mismatchViolations = violations.filter(
        (v): v is ViolationVersionMismatch =>
          v._tag === "ViolationVersionMismatch",
      );
      const mismatchesByPackage = groupMismatchesByPackage(mismatchViolations);

      if (interactive && mismatchesByPackage.size > 0) {
        yield* Console.log(`\nResolving version mismatches\n`);

        const workspacesByName = new Map<string, Workspace>(
          analysis.workspaces.map((w) => [w.name, w]),
        );

        for (const [pkg, info] of mismatchesByPackage) {
          const choices = info.versions.map((version) => {
            const workspaces = info.workspacesByVersion.get(version) ?? [];
            const workspaceNames = workspaces
              .map((w) => w.workspace)
              .join(", ");
            return {
              title: `${version} ${c.muted}(${workspaceNames})${c.reset}`,
              value: version,
            };
          });

          const selectedVersion = yield* Prompt.select({
            message: `Select version for "${pkg}":`,
            choices,
          });

          for (const [, workspaceViolations] of info.workspacesByVersion) {
            for (const violation of workspaceViolations) {
              const workspace = workspacesByName.get(violation.workspace);
              if (!workspace) continue;

              const result = yield* monoverse
                .upsertDependency({
                  workspace,
                  packageName: pkg,
                  versionRange: selectedVersion,
                  dependencyType: violation.dependencyType,
                })
                .pipe(
                  Effect.map(() => true),
                  Effect.catchAll(() => Effect.succeed(false)),
                );

              if (result) mismatchFixedCount++;
            }
          }
        }

        yield* monoverse.formatAllWorkspaces(analysis);
      }

      yield* Console.log(`\nSummary`);
      yield* Console.log(`${c.muted}${"─".repeat(40)}${c.reset}`);

      if (formattedCount > 0) {
        yield* Console.log(
          `${c.success}Fixed${c.reset}    ${formattedCount} formatting issue${formattedCount === 1 ? "" : "s"}`,
        );
      }

      if (pinnedCount > 0) {
        yield* Console.log(
          `${c.success}Fixed${c.reset}    ${pinnedCount} unpinned version${pinnedCount === 1 ? "" : "s"}`,
        );
      }

      if (mismatchFixedCount > 0) {
        yield* Console.log(
          `${c.success}Fixed${c.reset}    ${mismatchFixedCount} version mismatch${mismatchFixedCount === 1 ? "" : "es"}`,
        );
      }

      const skippedMismatches = interactive ? 0 : mismatchesByPackage.size;

      if (skippedMismatches > 0) {
        yield* Console.log(
          `${c.warning}Skipped${c.reset}  ${skippedMismatches} version mismatch${skippedMismatches === 1 ? "" : "es"} ${c.muted}(use -i to resolve)${c.reset}`,
        );

        for (const [pkg, info] of mismatchesByPackage) {
          yield* Console.log(
            `${c.muted}         ${pkg}: ${info.versions.join(", ")}${c.reset}`,
          );
        }
      }

      const totalFixed = formattedCount + pinnedCount + mismatchFixedCount;
      const totalSkipped = skippedMismatches;

      yield* Console.log(`${c.muted}${"─".repeat(40)}${c.reset}`);
      yield* Console.log(
        `Total    ${totalFixed} fixed, ${totalSkipped} skipped`,
      );
    }),
);
