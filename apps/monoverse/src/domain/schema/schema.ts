import { z } from "zod";

export const packageSchema = z.object({
  name: z.string(),
  versions: z.array(z.string()),

  description: z.string().optional(),
  repository: z.string().optional(),
  licence: z.string().optional(),
});

export const packageMapSchema = z.record(packageSchema.or(z.undefined()));

export const dependencySchema = z.object({
  name: z.string(),
  versionRange: z.string(),
  type: z.enum([
    "dependency",
    "devDependency",
    "peerDependency",
    "optionalDependency",
  ]),
});

export const workspaceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  dependencies: z.array(dependencySchema),
});

export const monorepoSchema = z.object({
  workspaces: z.array(workspaceSchema),
  packageManager: z.enum(["npm", "yarn", "pnpm"]).optional(),
});

export const packageJsonSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),

  // Dependencies
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  optionalDependencies: z.record(z.string()).optional(),
});
