import z from "zod";

export const packageSchema = z.object({
  name: z.string(),
  versions: z.array(z.string()),

  description: z.string().optional(),
  repository: z.string().optional(),
  licence: z.string().optional(),
});

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
  location: z.string(),
  dependencies: z.array(dependencySchema),
});

export const monorepoSchema = z.object({
  workspaces: z.array(workspaceSchema),
  packageManager: z.enum(["npm", "yarn", "pnpm"]).optional(),
});

const packageJsonDependencyListSchema = z.record(z.string()).optional();

export const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  dependencies: packageJsonDependencyListSchema,
  devDependencies: packageJsonDependencyListSchema,
  peerDependencies: packageJsonDependencyListSchema,
  optionalDependencies: packageJsonDependencyListSchema,
});
