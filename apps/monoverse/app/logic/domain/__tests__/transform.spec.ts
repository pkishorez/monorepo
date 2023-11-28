import { describe, expect, test } from "vitest";
import type { z } from "zod";
import type { packageJsonSchema, workspaceSchema } from "../schema";
import { packageJsonToWorkspace } from "../transform";

describe("topic: transform", () => {
  test("package json transform", () => {
    const pkg: z.infer<typeof packageJsonSchema> = {
      name: "test",
    };

    const location = "/";
    const workspace: z.infer<typeof workspaceSchema> = {
      name: pkg.name,
      location,
      dependencies: [],
    };

    expect(packageJsonToWorkspace(pkg, location)).toStrictEqual(workspace);
  });
});
