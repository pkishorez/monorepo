import z from "zod";

export const monorepo = z.object({
  name: z.string(),
  description: z.string(),
  packages: z.array(z.string()),
});
