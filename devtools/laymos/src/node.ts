import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Data, Effect, FileSystem, Path } from 'effect';

import { loadConfig } from './config/load-config.js';
import type { LaymosConfig } from './config/types.js';
import { extractFileGraph } from './engine/1-extract/index.js';
import { resolveProject } from './engine/2-resolve/index.js';
import { evaluateRules } from './engine/3-evaluate/index.js';
import { emitReport } from './engine/4-emit/index.js';
import type { LaymosError } from './engine/errors.js';
import type { AnalysisWarning, LaymosReport } from './report/index.js';
import type {
  StoryRun,
  StoryCatalog,
  StoryCollection,
  StoryPath,
} from './report/stories.js';
import { findStorySurfaces } from './story/core/story-surface.js';
import {
  projectStoryCoverage,
  type StoryCoverageReport,
} from './story/coverage/index.js';
import {
  planStoryEjection,
  type StoryEjectionError,
} from './story/eject/index.js';
import {
  discoverStories as discoverStoryCatalog,
  getStories as getStoryCollection,
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
export { projectStorySource } from './story/eject/index.js';
export type {
  StoryDiscoveryIssue,
  StoriesRunResult,
  StoryFailure,
  StoryRunOptions,
} from './story/runner/index.js';
export type {
  StorySourceAnchor,
  StorySourceClassification,
  StorySourceProjection,
  StorySourceProjectionRange,
  StorySourceProvenance,
  StorySourceProjections,
} from './story/eject/index.js';

export class StoryCoverageError extends Data.TaggedError('StoryCoverageError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

/** load config → extract → resolve → evaluate → emit; violations are data, config errors fail. */
export function analyzeProject(
  baseDir: string,
): Effect.Effect<LaymosReport, LaymosError> {
  return Effect.gen(function* () {
    const config = yield* loadConfig(baseDir);
    const warnings = findMissingPathWarnings(baseDir, config);
    const storySurfaces = yield* Effect.promise(() =>
      findStorySurfaces(baseDir, config.modules ?? []),
    );
    const fileGraph = yield* extractFileGraph(
      baseDir,
      config.sourceRoots,
      config.ignore ?? [],
      storySurfaces,
    );
    const resolved = yield* resolveProject(config, fileGraph);
    const evaluation = yield* evaluateRules(resolved);
    return yield* emitReport(resolved, evaluation, warnings);
  });
}

export interface StoryRunResult {
  readonly status: 'passed' | 'failed';
  readonly run: StoryRun;
  readonly failures: readonly StoryFailure[];
}

export type AllStoriesRunResult = StoriesRunResult;

export function discoverStories(
  baseDir: string,
): Effect.Effect<StoryCatalog, StoryDiscoveryError> {
  return discoverStoryCatalog(baseDir);
}

export function getStories(
  baseDir: string,
): Effect.Effect<StoryCollection, StoryDiscoveryError> {
  return getStoryCollection(baseDir);
}

/** Builds the authored narration report used by diagnostics and DevTools. */
export function getStoryCoverage(
  baseDir: string,
  collection?: StoryCollection,
): Effect.Effect<
  StoryCoverageReport,
  StoryDiscoveryError | StoryEjectionError | StoryCoverageError,
  FileSystem.FileSystem | Path.Path
> {
  const stories = collection
    ? Effect.succeed(collection)
    : getStoryCollection(baseDir);
  return stories.pipe(
    Effect.flatMap((resolvedStories) =>
      planStoryEjection(baseDir).pipe(
        Effect.flatMap((ejection) =>
          Effect.try({
            try: () => projectStoryCoverage(baseDir, resolvedStories, ejection),
            catch: (cause) =>
              new StoryCoverageError({
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
          }),
        ),
      ),
    ),
  );
}

export function runStory(
  baseDir: string,
  storyPath: StoryPath,
  options?: StoryRunOptions,
): Effect.Effect<StoryRunResult, StoryRunnerError> {
  return executeStories(baseDir, [storyPath], options).pipe(
    Effect.flatMap((result) => {
      const run = result.runs.stories[storyPath];
      if (run === undefined) {
        const cause = new Error(`Story "${storyPath}" did not run`);
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
        run,
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

export function runModuleStories(
  baseDir: string,
  modulePath: string,
  options?: StoryRunOptions,
): Effect.Effect<StoriesRunResult, StoryRunnerError> {
  return executeStories(baseDir, [modulePath], options);
}

/** Runs the given Story files (all of them when empty) and returns fresh evidence. */
export function runStories(
  baseDir: string,
  selectors: readonly string[],
  options?: StoryRunOptions,
): Effect.Effect<StoriesRunResult, StoryRunnerError> {
  return executeStories(baseDir, selectors, options);
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
