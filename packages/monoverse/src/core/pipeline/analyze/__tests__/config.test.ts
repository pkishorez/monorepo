import * as path from "node:path";
import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { findConfigRoot, analyzeFromConfig } from "../config.js";

const fixtures = path.join(import.meta.dirname, "fixtures");
const options = { stopAt: fixtures };

describe("findConfigRoot", () => {
  it.effect("finds monoverse.json in current directory", () =>
    Effect.gen(function* () {
      const result = yield* findConfigRoot(
        path.join(fixtures, "with-config"),
        options,
      );

      expect(result).not.toBeNull();
      expect(result!.root).toBe(path.join(fixtures, "with-config"));
      expect(result!.config.projects).toContain("repo-a");
      expect(result!.config.projects).toContain("singles/*");
    }),
  );

  it.effect("walks up directory tree to find config", () =>
    Effect.gen(function* () {
      const result = yield* findConfigRoot(
        path.join(fixtures, "with-config", "repo-a", "packages"),
        options,
      );

      expect(result).not.toBeNull();
      expect(result!.root).toBe(path.join(fixtures, "with-config"));
    }),
  );

  it.effect("returns null when no config found", () =>
    Effect.gen(function* () {
      const result = yield* findConfigRoot(
        path.join(fixtures, "pnpm-monorepo"),
        options,
      );

      expect(result).toBeNull();
    }),
  );

  it.effect("respects stopAt boundary", () =>
    Effect.gen(function* () {
      const result = yield* findConfigRoot(
        path.join(fixtures, "with-config", "repo-a"),
        { stopAt: path.join(fixtures, "with-config", "repo-a") },
      );

      expect(result).toBeNull();
    }),
  );
});

describe("analyzeFromConfig", () => {
  it.effect("aggregates workspaces from multiple sources", () =>
    Effect.gen(function* () {
      const configRoot = yield* findConfigRoot(
        path.join(fixtures, "with-config"),
        options,
      );

      expect(configRoot).not.toBeNull();

      const result = yield* analyzeFromConfig(configRoot!);

      expect(result.root).toBe(path.join(fixtures, "with-config"));
      expect(result.workspaces.length).toBeGreaterThanOrEqual(4);

      const workspaceNames = result.workspaces.map((ws) => ws.name);
      expect(workspaceNames).toContain("repo-a-root");
      expect(workspaceNames).toContain("lib-a");
      expect(workspaceNames).toContain("app-1");
      expect(workspaceNames).toContain("app-2");
    }),
  );

  it.effect("returns flat workspace list", () =>
    Effect.gen(function* () {
      const configRoot = yield* findConfigRoot(
        path.join(fixtures, "with-config"),
        options,
      );

      const result = yield* analyzeFromConfig(configRoot!);

      expect(Array.isArray(result.workspaces)).toBe(true);
      for (const ws of result.workspaces) {
        expect(ws).toHaveProperty("name");
        expect(ws).toHaveProperty("path");
        expect(ws).toHaveProperty("dependencies");
      }
    }),
  );

  it.effect("deduplicates workspaces by path", () =>
    Effect.gen(function* () {
      const configRoot = yield* findConfigRoot(
        path.join(fixtures, "with-config"),
        options,
      );

      const result = yield* analyzeFromConfig(configRoot!);

      const paths = result.workspaces.map((ws) => ws.path);
      const uniquePaths = [...new Set(paths)];
      expect(paths.length).toBe(uniquePaths.length);
    }),
  );

  it.effect("handles monorepos in project paths", () =>
    Effect.gen(function* () {
      const configRoot = yield* findConfigRoot(
        path.join(fixtures, "with-config"),
        options,
      );

      const result = yield* analyzeFromConfig(configRoot!);

      const libA = result.workspaces.find((ws) => ws.name === "lib-a");
      expect(libA).toBeDefined();
      expect(libA!.dependencies).toHaveLength(1);
      expect(libA!.dependencies[0]!.name).toBe("effect");
    }),
  );

  it.effect("handles single packages in project paths", () =>
    Effect.gen(function* () {
      const configRoot = yield* findConfigRoot(
        path.join(fixtures, "with-config"),
        options,
      );

      const result = yield* analyzeFromConfig(configRoot!);

      const app1 = result.workspaces.find((ws) => ws.name === "app-1");
      expect(app1).toBeDefined();
      expect(app1!.dependencies).toHaveLength(1);
      expect(app1!.dependencies[0]!.name).toBe("react");
    }),
  );
});
