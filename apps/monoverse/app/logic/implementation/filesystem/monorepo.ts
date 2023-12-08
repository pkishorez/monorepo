import type { z } from "zod";
import type { monorepoSchema } from "~/logic/domain";
import { getMonorepoInfo } from "./fs";

export const getMonorepo = (
  dirPath: string,
): z.infer<typeof monorepoSchema> | undefined => {
  const monorepoInfo = getMonorepoInfo(dirPath);

  if (!monorepoInfo) return undefined;

  const { workspaces, packageManager } = monorepoInfo;

  return {
    workspaces,
    packageManager,
  };
};
