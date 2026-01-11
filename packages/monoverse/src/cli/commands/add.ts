import { Args, Command, Options, Prompt } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { Monoverse } from "../../core/index.js";
import type { MonorepoAnalysis } from "../../core/pipeline/analyze/types.js";
import { groupDependenciesByPackage } from "../../core/pipeline/validate/group-by-package.js";
import { fetchNpmPackage } from "../../core/primitives/npm/npm-pkg.js";
import {
  findCurrentWorkspace,
  toDependencyType,
  type DependencyTypeShort,
} from "../helpers.js";

const packageArg = Args.text({ name: "package" });

const typeOption = Options.choice("type", [
  "dependency",
  "dev",
  "peer",
  "optional",
] as const).pipe(Options.withAlias("t"), Options.withDefault("dependency"));

const versionOption = Options.text("version").pipe(
  Options.withAlias("v"),
  Options.optional,
);

const findPackageVersionsInWorkspaces = (
  analysis: MonorepoAnalysis,
  packageName: string,
): string[] => {
  const groups = groupDependenciesByPackage(analysis, ["npm"]);
  const packageGroup = groups.find((g) => g.name === packageName);

  if (!packageGroup) {
    return [];
  }

  const versions = new Set(packageGroup.instances.map((i) => i.versionRange));
  return Array.from(versions);
};

const resolvePackageVersion = (
  analysis: MonorepoAnalysis,
  packageName: string,
) =>
  Effect.gen(function* () {
    const versions = findPackageVersionsInWorkspaces(analysis, packageName);

    if (versions.length === 0) {
      yield* Console.log(`Fetching latest version of ${packageName}...`);
      const npmInfo = yield* fetchNpmPackage(packageName);
      return npmInfo.latestVersion;
    }

    if (versions.length === 1) {
      yield* Console.log(`Using synced version ${versions[0]} from workspaces`);
      return versions[0]!;
    }

    const selected = yield* Prompt.select({
      message: `Multiple versions of "${packageName}" found. Select one:`,
      choices: versions.map((v) => ({ title: v, value: v })),
    });

    return selected;
  });

const handler = ({
  package: pkg,
  type,
  version,
}: {
  package: string;
  type: DependencyTypeShort;
  version: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const { analysis, workspace } = yield* findCurrentWorkspace;
    const dependencyType = toDependencyType(type);

    const resolvedVersion = Option.isSome(version)
      ? version.value
      : yield* resolvePackageVersion(analysis, pkg);

    yield* monoverse.addPackage({
      packageName: pkg,
      versionRange: resolvedVersion,
      dependencyType,
      workspace,
    });

    yield* Console.log(`Added ${pkg}@${resolvedVersion} to ${workspace.name}`);
  });

export const add = Command.make(
  "add",
  { package: packageArg, type: typeOption, version: versionOption },
  handler,
);
