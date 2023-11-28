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

    const test = {
      name: "monoverse",
      private: true,
      sideEffects: false,
      type: "module",
      scripts: {
        build: "remix build",
        test: "vitest",
        dev: "remix dev --manual",
        start: "remix-serve ./build/index.js",
        typecheck: "tsc",
      },
      dependencies: {
        "@monorepo-utils/package-utils": "^2.10.4",
        "@remix-run/css-bundle": "^2.2.0",
        "@remix-run/node": "^2.2.0",
        "@remix-run/react": "^2.2.0",
        "@remix-run/serve": "^2.2.0",
        "@types/semver": "^7.5.4",
        isbot: "^3.6.8",
        react: "^18.2.0",
        "react-dom": "^18.2.0",
        semver: "^7.5.4",
        "tiny-invariant": "^1.3.1",
        zod: "^3.22.4",
      },
      devDependencies: {
        "@remix-run/dev": "^2.2.0",
        "@remix-run/eslint-config": "^2.2.0",
        "@types/eslint": "^8.44.7",
        "@types/react": "^18.2.20",
        "@types/react-dom": "^18.2.7",
        eslint: "^8.38.0",
        "eslint-plugin-import": "^2.29.0",
        tailwindcss: "^3.3.5",
        typescript: "^5.1.6",
        vitest: "^0.34.6",
      },
      engines: { node: ">=18.0.0" },
    };

    console.log(
      JSON.stringify(packageJsonToWorkspace(test, location), null, "  "),
    );
  });
});
