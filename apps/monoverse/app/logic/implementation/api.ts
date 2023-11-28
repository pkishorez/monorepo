import { z } from "zod";
import type { packageSchema } from "../domain";

const pkgSchema = z.object({
  name: z.string(),
  versions: z.record(z.any()),

  description: z.string().optional(),
  repository: z
    .object({
      url: z.string().optional(),
    })
    .optional(),
  licence: z.string().optional(),
});
export const fetchPackageInfo = async (packageName: string) => {
  const response = await fetch(`https://registry.npmjs.org/${packageName}`);
  const json = await response.json();

  const pkg = pkgSchema.parse(json);

  return {
    name: pkg.name,
    versions: Object.keys(pkg.versions),
    description: pkg.description,
    repository: pkg.repository?.url,
    licence: pkg.licence,
  } satisfies z.infer<typeof packageSchema>;
};
