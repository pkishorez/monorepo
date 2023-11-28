import { getPackages as getWorkspaces } from "@monorepo-utils/package-utils";
import fs from "fs";
import path from "path";
import invariant from "tiny-invariant";
import type { z } from "zod";
import type { monorepoSchema, workspaceSchema } from "../domain";
import { packageJsonSchema, packageJsonToWorkspace } from "../domain";

export const getMonorepo = (
  dirPath: string,
): z.infer<typeof monorepoSchema> | undefined => {
  const monorepoDir = detectMonorepoDir(dirPath);

  if (monorepoDir) {
    const monorepo = getMonorepoAtDir(monorepoDir);
    invariant(monorepo !== undefined, "monorepo should be defined");

    return {
      ...monorepo,
      packageManager: detectPackageManager(monorepoDir),
    };
  }

  const workspaceDir = detectWorkspaceDir(dirPath);

  if (workspaceDir) {
    const workspace = getWorkspaceAtDir(workspaceDir);
    invariant(workspace !== undefined, "workspace should be defined");

    return {
      workspaces: [workspace],
    };
  }

  return undefined;
};

const detectMonorepoDir = (dirPath: string): string | undefined => {
  dirPath = path.resolve(dirPath);
  while (true) {
    const monorepo = getMonorepoAtDir(dirPath);
    if (monorepo) return dirPath;

    const parentDir = path.dirname(dirPath);
    if (parentDir === dirPath) return undefined;

    dirPath = parentDir;
  }
};

function getMonorepoAtDir(
  dir: string,
): z.infer<typeof monorepoSchema> | undefined {
  const workspaces = getWorkspaces(dir);

  if (!workspaces || workspaces.length === 0) return undefined;

  return {
    workspaces: workspaces.map((workspace) => {
      const { packageJSON } = workspace;
      const packageJson = packageJsonSchema.parse(packageJSON);

      return packageJsonToWorkspace(packageJson);
    }),
  };
}

function detectWorkspaceDir(dir: string): string | undefined {
  while (true) {
    const workspace = getWorkspaceAtDir(dir);
    if (workspace) return dir;

    const parentDir = path.dirname(dir);
    if (parentDir === dir) return undefined;

    dir = parentDir;
  }
}

function detectPackageManager(
  dir: string,
): z.infer<typeof monorepoSchema>["packageManager"] {
  const isPackageLockJsonPresent = fs.existsSync(
    path.resolve(dir, "package-lock.json"),
  );
  const isYarnLockPresent = fs.existsSync(path.resolve(dir, "yarn.lock"));
  const isPnpmLockPresent = fs.existsSync(path.resolve(dir, "pnpm-lock.yaml"));

  if (isPackageLockJsonPresent) return "npm";
  if (isYarnLockPresent) return "yarn";
  if (isPnpmLockPresent) return "pnpm";
  return undefined;
}

function getWorkspaceAtDir(
  dir: string,
): z.infer<typeof workspaceSchema> | undefined {
  const workspacePackageJson = path.resolve(dir, "package.json");

  try {
    const packageJson = JSON.parse(
      fs.readFileSync(workspacePackageJson, "utf-8"),
    );
    return packageJsonToWorkspace(packageJson);
  } catch {
    return undefined;
  }
}
