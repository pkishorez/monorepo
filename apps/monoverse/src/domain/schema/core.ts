import { z } from "zod";

export const packageSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  repository: z.string().optional(),
  licence: z.string().optional(),

  versions: z.array(z.string()),
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
  dependencies: z.array(dependencySchema),
});

export const monorepoSchema = z.object({
  workspaces: z.array(workspaceSchema),
});
