import { Effect, Schema } from "effect";
import {
  fileExists,
  getParentDirectory,
  isRootPath,
  joinPath,
  readFile,
  glob,
  dirname,
} from "../../primitives/fs/index.js";
import { findMonorepoRoot } from "./monorepo.js";
import { discoverWorkspaces } from "./workspace.js";
import type { MonoverseConfig, ProjectAnalysis } from "./types.js";

const MonoverseConfigSchema = Schema.Struct({
  projects: Schema.mutable(Schema.Array(Schema.String)),
});

export interface ConfigRoot {
  root: string;
  config: MonoverseConfig;
}

const parseConfig = (content: string) =>
  Effect.try(() => JSON.parse(content) as unknown).pipe(
    Effect.flatMap(Schema.decodeUnknown(MonoverseConfigSchema)),
  );

export const findConfigRoot = (
  startPath: string,
  options: { stopAt?: string } = {},
): Effect.Effect<ConfigRoot | null> =>
  Effect.gen(function* () {
    let currentPath = startPath;

    while (true) {
      const configPath = joinPath(currentPath, "monoverse.json");
      if (yield* fileExists(configPath)) {
        const content = yield* readFile(configPath).pipe(
          Effect.catchAll(() => Effect.succeed("")),
        );
        const config = content
          ? yield* parseConfig(content).pipe(
              Effect.catchAll(() => Effect.succeed(null)),
            )
          : null;
        if (config) {
          return { root: currentPath, config };
        }
      }

      if (isRootPath(currentPath) || currentPath === options.stopAt) break;
      currentPath = yield* getParentDirectory(currentPath);
    }

    return null;
  });

const resolveProjectPaths = (
  configRoot: string,
  patterns: string[],
): Effect.Effect<string[]> =>
  Effect.gen(function* () {
    const paths: string[] = [];

    for (const pattern of patterns) {
      const isGlob = pattern.includes("*") || pattern.includes("?");

      if (!isGlob) {
        const absPath = joinPath(configRoot, pattern);
        if (yield* fileExists(absPath)) paths.push(absPath);
      } else {
        const matches = yield* glob([joinPath(pattern, "package.json")], {
          cwd: configRoot,
          ignore: ["**/node_modules/**"],
          absolute: true,
        }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
        paths.push(...matches.map(dirname));
      }
    }

    return [...new Set(paths)];
  });

export const analyzeFromConfig = (
  configRoot: ConfigRoot,
): Effect.Effect<ProjectAnalysis> =>
  Effect.gen(function* () {
    const seenPaths = new Set<string>();
    const allWorkspaces: ProjectAnalysis["workspaces"] = [];
    const allErrors: ProjectAnalysis["errors"] = [];

    const projectPaths = yield* resolveProjectPaths(
      configRoot.root,
      configRoot.config.projects,
    );

    for (const projectPath of projectPaths) {
      const monorepo = yield* findMonorepoRoot(projectPath, {
        stopAt: projectPath,
      }).pipe(Effect.either);

      if (monorepo._tag === "Left") {
        allErrors.push({
          path: projectPath,
          message: monorepo.left.message,
        });
        continue;
      }

      const { workspaces, errors } = yield* discoverWorkspaces(
        projectPath,
        monorepo.right.patterns,
      );

      for (const ws of workspaces) {
        if (!seenPaths.has(ws.path)) {
          seenPaths.add(ws.path);
          allWorkspaces.push(ws);
        }
      }
      allErrors.push(...errors);
    }

    return {
      root: configRoot.root,
      workspaces: allWorkspaces,
      errors: allErrors,
    };
  });
