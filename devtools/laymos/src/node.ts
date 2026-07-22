import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Effect } from 'effect';
import { createJiti } from 'jiti';

import { defineConfig } from './config/define-config.js';
import type { LaymosConfig } from './config/types.js';
import { extractFileGraph } from './engine/1-extract/index.js';
import { resolveProject } from './engine/2-resolve/index.js';
import { evaluateRules } from './engine/3-evaluate/index.js';
import { emitReport } from './engine/4-emit/index.js';
import { ConfigLoadError } from './engine/errors.js';
import type { LaymosError } from './engine/errors.js';
import type { AnalysisWarning, LaymosReport } from './report/index.js';
import type {
  StoryArtifact,
  StoryCatalog,
  StoryGroupPath,
} from './report/stories.js';
import {
  discoverStories as discoverStoryCatalog,
  StoryDiscoveryError,
  StoryRunnerError,
  executeStories,
} from './story/runner/index.js';
import type {
  StoryFailure,
  StoriesRunResult,
  StoryRunOptions,
} from './story/runner/index.js';

export { ConfigLoadError, ExtractError } from './engine/errors.js';
export { StoryDiscoveryError, StoryRunnerError } from './story/runner/index.js';
export type {
  StoryDiscoveryIssue,
  StoriesRunResult,
  StoryFailure,
  StoryRunOptions,
} from './story/runner/index.js';

/** load config → extract → resolve → evaluate → emit; violations are data, config errors fail. */
export function analyzeProject(
  baseDir: string,
): Effect.Effect<LaymosReport, LaymosError> {
  return Effect.gen(function* () {
    const config = yield* loadConfig(baseDir);
    const warnings = findMissingPathWarnings(baseDir, config);
    const fileGraph = yield* extractFileGraph(
      baseDir,
      config.sourceRoots,
      config.ignore ?? [],
    );
    const resolved = yield* resolveProject(config, fileGraph);
    const evaluation = yield* evaluateRules(resolved);
    return yield* emitReport(resolved, evaluation, warnings);
  });
}

export interface StoryRunResult {
  readonly status: 'passed' | 'failed';
  readonly artifact: StoryArtifact;
  readonly failures: readonly StoryFailure[];
}

export type AllStoriesRunResult = StoriesRunResult;

export function discoverStories(
  baseDir: string,
): Effect.Effect<StoryCatalog, StoryDiscoveryError> {
  return discoverStoryCatalog(baseDir);
}

export function runStory(
  baseDir: string,
  storyId: string,
  options?: StoryRunOptions,
): Effect.Effect<StoryRunResult, StoryRunnerError> {
  return executeStories(baseDir, [storyId], options).pipe(
    Effect.flatMap((result) => {
      const artifact = result.report.stories[storyId];
      if (artifact === undefined) {
        const cause = new Error(`Story "${storyId}" did not run`);
        return Effect.fail(
          new StoryRunnerError({
            operation: 'execute',
            message: cause.message,
            cause,
          }),
        );
      }
      return Effect.succeed({
        status: result.status,
        artifact,
        failures: result.failures,
      });
    }),
  );
}

export function runAllStories(
  baseDir: string,
  options?: StoryRunOptions,
): Effect.Effect<AllStoriesRunResult, StoryRunnerError> {
  return executeStories(baseDir, [], options);
}

export function runStoryGroup(
  baseDir: string,
  groupPath: StoryGroupPath,
  options?: StoryRunOptions,
): Effect.Effect<StoriesRunResult, StoryDiscoveryError | StoryRunnerError> {
  return discoverStories(baseDir).pipe(
    Effect.flatMap((catalog) => {
      const groupExists = catalog.groups.some(({ path }) =>
        samePath(path, groupPath),
      );
      if (!groupExists) {
        const cause = new Error(
          `Story Group "${groupPath.join(' / ')}" was not found`,
        );
        return Effect.fail(
          new StoryRunnerError({
            operation: 'execute',
            message: cause.message,
            cause,
          }),
        );
      }
      const storyIds = catalog.stories
        .filter(({ groupPath: storyGroupPath }) =>
          startsWithPath(storyGroupPath, groupPath),
        )
        .map(({ storyId }) => storyId);
      return executeStories(baseDir, storyIds, options);
    }),
  );
}

/** Runs the given Story files (all of them when empty) and returns fresh evidence. */
export function runStories(
  baseDir: string,
  storyIds: readonly string[],
  options?: StoryRunOptions,
): Effect.Effect<StoriesRunResult, StoryRunnerError> {
  return executeStories(baseDir, storyIds, options);
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function startsWithPath(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

function loadConfig(
  baseDir: string,
): Effect.Effect<LaymosConfig, ConfigLoadError> {
  const path = resolve(baseDir, 'laymos.config.ts');
  return Effect.tryPromise({
    try: async () => {
      if (!existsSync(path)) {
        throw new Error(`Config file not found: ${path}`);
      }
      const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        moduleCache: false,
      });
      const imported = (await jiti.import(path)) as { default?: unknown };
      const config = imported.default;
      if (!isLaymosConfig(config)) {
        throw new Error(
          `Config at "${path}" must default-export a value created with defineConfig()`,
        );
      }
      return defineConfig(config);
    },
    catch: (cause) => new ConfigLoadError({ path, cause }),
  });
}

function isLaymosConfig(value: unknown): value is LaymosConfig {
  if (typeof value !== 'object' || value === null || !('graphs' in value)) {
    return false;
  }
  const config = value as Partial<LaymosConfig>;
  return (
    Array.isArray(config.graphs) &&
    config.graphs.every((graph) => graph?.kind === 'layer-graph') &&
    Array.isArray(config.sourceRoots) &&
    (config.modules === undefined || Array.isArray(config.modules)) &&
    (config.moduleRules === undefined || Array.isArray(config.moduleRules)) &&
    (config.ignore === undefined || Array.isArray(config.ignore))
  );
}

function findMissingPathWarnings(
  baseDir: string,
  config: LaymosConfig,
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];
  for (const path of config.sourceRoots) {
    if (!existsSync(resolve(baseDir, path))) {
      warnings.push({ kind: 'missing-source-root', path });
    }
  }
  const layers = new Set(config.graphs.flatMap((graph) => [...graph.layers]));
  for (const layer of layers) {
    for (const path of layer.paths) {
      if (!existsSync(resolve(baseDir, path))) {
        warnings.push({
          kind: 'missing-layer-path',
          layer: layer.name,
          path,
        });
      }
    }
  }
  for (const module of config.modules ?? []) {
    if (!existsSync(resolve(baseDir, module.path))) {
      warnings.push({
        kind: 'missing-module-path',
        module: module.path,
        path: module.path,
      });
    }
  }
  return warnings;
}
