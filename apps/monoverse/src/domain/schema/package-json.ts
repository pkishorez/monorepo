import { z } from "zod";

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
