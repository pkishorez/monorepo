import type { z } from "zod";
import type { monorepoSchema } from "~/domain";
import { getMonorepoInfo } from "./filesystem";

export const getMonorepo = (
  dirPath: string,
): z.infer<typeof monorepoSchema> | undefined => {
  const monorepoInfo = getMonorepoInfo(dirPath);

  if (!monorepoInfo) return undefined;

  const { workspaces } = monorepoInfo;

  return {
    workspaces,
  };
};
