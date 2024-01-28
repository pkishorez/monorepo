import { uniq } from "lodash-es";
import { z } from "zod";
import type { monorepoSchema, workspaceSchema } from ".";
import type { packageMapSchema } from "./schema";
import { dependencySchema } from "./schema";
import { getMaxVersion, getMaxVersionFromRange } from "./version";

export const getPackagesFromMonorepo = (
  monorepo: z.infer<typeof monorepoSchema>,
) => {
  return uniq(monorepo.workspaces.flatMap(getPackagesFromWorkspace));
};

export const getPackagesFromWorkspace = (
  workspace: z.infer<typeof workspaceSchema>,
) => {
  return uniq(workspace.dependencies.map((dependency) => dependency.name));
};

export const getDependenciesFromWorkspace = (
  workspace: z.infer<typeof workspaceSchema>,
) => {
  return workspace.dependencies;
};

export const getWorkspace = (
  monorepo: z.infer<typeof monorepoSchema>,
  workspaceName: string,
) => {
  return monorepo.workspaces.find(
    (workspace) => workspace.name === workspaceName,
  );
};

const dependencyUpgradeInfoSchema = z
  .object({
    maxVersion: z.string(),
    latestVersion: z.string(),
  })
  .and(dependencySchema);

type UpgradesInfoResponse = {
  available: z.infer<typeof dependencyUpgradeInfoSchema>[];
  unavailable: z.infer<typeof dependencySchema>[];
};

export const getWorkspaceUpgradesInfo = (
  workspace: z.infer<typeof workspaceSchema>,
  packageMap: z.infer<typeof packageMapSchema>,
): UpgradesInfoResponse => {
  const result: UpgradesInfoResponse = { available: [], unavailable: [] };

  workspace.dependencies.forEach((dependency) => {
    const { versionRange } = dependency;
    const packageInfo = packageMap[dependency.name];
    if (!packageInfo) {
      result.unavailable.push(dependency);
      return;
    }

    result.available.push(
      dependencyUpgradeInfoSchema.parse({
        ...dependency,
        maxVersion: getMaxVersionFromRange(versionRange, packageInfo.versions),
        latestVersion: getMaxVersion(packageInfo.versions),
      } satisfies z.infer<typeof dependencyUpgradeInfoSchema>),
    );
  });

  return result;
};
