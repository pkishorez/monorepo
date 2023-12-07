import { z } from "zod";

// Define a schema for request data validation using Zod
export const RequestSchema = z.object({
  type: z.literal("PACKAGE_INFO"),
  payload: z.object({
    pkgName: z.string(),
  }),
});
