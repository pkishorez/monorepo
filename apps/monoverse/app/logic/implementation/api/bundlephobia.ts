import { z } from "zod";
import { packageSchema } from "../../domain";

export const bundlePhobia = (() => {
  const requestSchema = z.string();
  const responseSchema = z.object({
    assets: z.array(
      z.object({
        gzip: z.number(),
        name: z.string(),
        size: z.number(),
        type: z.string(),
      }),
    ),
    dependencyCount: z.number(),
    dependencySizes: z.array(
      z.object({ approximateSize: z.number(), name: z.string() }),
    ),
    description: z.string().optional(),
    name: z.string(),
    version: z.string(),
  });

  const fetchBundleInfo = async (input: unknown) => {
    const packageName = requestSchema.parse(input);
    const response = await fetch(
      `https://bundlephobia.com/api/size?package=${packageName}`,
    );
    const json = await response.json();

    return responseSchema.parse(json);
  };

  return {
    requestSchema,
    responeSchema: packageSchema,
    request: fetchBundleInfo,
  };
})();
