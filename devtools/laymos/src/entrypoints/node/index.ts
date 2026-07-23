import * as NodeServices from '@effect/platform-node/NodeServices';
import { Data, Effect } from 'effect';

import {
  analyzeProject as analyzeProjectOperation,
  type AnalyzeProjectRequest,
} from '../../architecture/analyze-project/index.js';
import type { LaymosError } from '../../architecture/errors.js';
import { loadConfig } from '../../config/load-config/index.js';
import {
  serializeProjectNarrative,
  type ProjectNarrative,
} from '../../config/project-narrative.js';
import type { LaymosReport } from '../../report/index.js';
import type {
  StoryCatalog,
  StoryCollection,
  StoryPath,
} from '../../report/stories.js';
import type { StoryCoverageReport } from '../../report/story-coverage.js';
import { flow, step } from '../../stories/authoring/index.js';
import {
  ejectStories as ejectStoriesOperation,
  planStoryEjection,
  projectStorySource,
  type StoryEjectionError,
  type StoryEjectionResult,
  type StorySourceAnchor,
  type StorySourceProjections,
} from '../../stories/inspect-story-source/index.js';
import { measureProjectStoryCoverage } from '../../stories/measure-story-coverage/index.js';
import {
  discoverStories as discoverStoriesOperation,
  executeStories,
  getStories,
  type StoriesRunResult,
  type StoryDiscoveryError,
  type StoryRunnerError,
  type StoryRunOptions,
} from '../../stories/run-stories/index.js';
import type { TestCatalog, TestsReport } from '../../report/tests.js';
import {
  discoverTests as discoverTestsOperation,
  executeTests,
  type TestDiscoveryError,
  type TestRunnerError,
  type TestsRunOptions,
} from '../../tests/run-tests/index.js';

export {
  ConfigImportError,
  ConfigNotFoundError,
  ConfigValidationError,
} from '../../config/load-config/index.js';
export { ExtractError } from '../../architecture/errors.js';
export {
  StoryAuthoringError,
  StoryEjectionError,
} from '../../stories/inspect-story-source/index.js';
export {
  StoryDiscoveryError,
  StoryRunnerError,
} from '../../stories/run-stories/index.js';
export type {
  StoriesRunResult,
  StoryDiscoveryIssue,
  StoryFailure,
  StoryRunOptions,
} from '../../stories/run-stories/index.js';
export type {
  StoryEjectionResult,
  StorySourceAnchor,
  StorySourceClassification,
  StorySourceProjection,
  StorySourceProjectionRange,
  StorySourceProvenance,
  StorySourceProjections,
} from '../../stories/inspect-story-source/index.js';
export {
  TestDiscoveryError,
  TestRunnerError,
} from '../../tests/run-tests/index.js';
export type { TestsRunOptions } from '../../tests/run-tests/index.js';

export type StorySelector =
  | { readonly _tag: 'Story'; readonly storyPath: StoryPath }
  | { readonly _tag: 'Module'; readonly modulePath: string };

export interface DiscoverStoriesRequest {
  readonly projectDir: string;
}

export interface GetProjectNarrativeRequest {
  readonly projectDir: string;
}

export interface InspectStoriesRequest {
  readonly projectDir: string;
}

export interface RunStoriesRequest extends StoryRunOptions {
  readonly projectDir: string;
  readonly selectors?: readonly StorySelector[];
}

export interface MeasureStoryCoverageRequest {
  readonly projectDir: string;
  readonly stories?: StoryCollection;
}

export interface InspectStorySourceRequest {
  readonly source: string;
  readonly fileName: string;
  readonly anchors: readonly StorySourceAnchor[];
}

export interface EjectStoriesRequest {
  readonly projectDir: string;
  readonly dryRun?: boolean;
}

export interface DiscoverTestsRequest {
  readonly projectDir: string;
}

export interface RunTestsRequest extends TestsRunOptions {
  readonly projectDir: string;
  readonly selectors?: readonly string[];
}

/** Discovers Module-owned Tests without executing them. */
export function discoverTests(
  request: DiscoverTestsRequest,
): Effect.Effect<TestCatalog, TestDiscoveryError> {
  return discoverTestsOperation(request.projectDir);
}

/** Executes selected Tests and returns raw Expected and Actual evidence. */
export function runTests(
  request: RunTestsRequest,
): Effect.Effect<TestsReport, TestRunnerError> {
  return executeTests(
    request.projectDir,
    request.selectors ?? [],
    request.timeout === undefined ? {} : { timeout: request.timeout },
  );
}

export class StoryCoverageError extends Data.TaggedError('StoryCoverageError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class StorySourceError extends Data.TaggedError('StorySourceError')<{
  readonly fileName: string;
  readonly message: string;
  readonly cause: unknown;
}> {}

/** Analyzes one project's declared and actual static architecture. */
export function analyzeProject(
  request: AnalyzeProjectRequest,
): Effect.Effect<LaymosReport, LaymosError> {
  return analyzeProjectOperation(request);
}

/** Loads the project narrative without waiting for project analysis. */
export function getProjectNarrative({
  projectDir,
}: GetProjectNarrativeRequest): Effect.Effect<
  ProjectNarrative | undefined,
  import('../../config/load-config/index.js').LoadConfigError
> {
  return loadConfig({ projectDir }).pipe(
    Effect.map((config) =>
      config.project === undefined
        ? undefined
        : serializeProjectNarrative(config.project),
    ),
  );
}

/** Discovers the Story catalog without tracing or executing its Stories. */
export function discoverStories({
  projectDir,
}: DiscoverStoriesRequest): Effect.Effect<StoryCatalog, StoryDiscoveryError> {
  return discoverStoriesOperation(projectDir);
}

/** Discovers and structurally traces every Story in a project. */
export function inspectStories({
  projectDir,
}: InspectStoriesRequest): Effect.Effect<StoryCollection, StoryDiscoveryError> {
  return getStories(projectDir);
}

/** Executes all Stories selected by Story or Module identity. */
export function runStories({
  projectDir,
  selectors = [],
  timeout,
}: RunStoriesRequest): Effect.Effect<StoriesRunResult, StoryRunnerError> {
  return executeStories(
    projectDir,
    selectors.map((selector) =>
      selector._tag === 'Story' ? selector.storyPath : selector.modulePath,
    ),
    timeout === undefined ? undefined : { timeout },
  );
}

/** Measures narration coverage for every structurally valid Story. */
export function measureStoryCoverage({
  projectDir,
  stories,
}: MeasureStoryCoverageRequest): Effect.Effect<
  StoryCoverageReport,
  StoryDiscoveryError | StoryEjectionError | StoryCoverageError
> {
  const inspected =
    stories === undefined ? getStories(projectDir) : Effect.succeed(stories);
  return inspected.pipe(
    Effect.flatMap((collection) =>
      planStoryEjection(projectDir).pipe(
        Effect.flatMap((ejection) =>
          Effect.try({
            try: () =>
              measureProjectStoryCoverage(projectDir, collection, ejection),
            catch: (cause) =>
              new StoryCoverageError({
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
          }).pipe(Effect.flatten),
        ),
      ),
    ),
    Effect.provide(NodeServices.layer),
  );
}

/** Projects one source file into clean and fully ejected forms. */
export const inspectStorySource = flow(
  'Inspect Story source',
  {
    description:
      'Projects one instrumented source file into readable clean and fully ejected forms while preserving narration anchors.',
    attributes: ({ fileName }: InspectStorySourceRequest) => ({ fileName }),
  },
  ({
    source,
    fileName,
    anchors,
  }: InspectStorySourceRequest): Effect.Effect<
    StorySourceProjections,
    StorySourceError
  > =>
    step(
      'Project instrumented source',
      {
        description:
          'Parses Story authoring calls structurally, validates safe usage, and renders clean and ejected source projections.',
      },
      () =>
        Effect.try({
          try: () => projectStorySource(source, fileName, anchors),
          catch: (cause) =>
            new StorySourceError({
              fileName,
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
    ),
);

/** Removes Story instrumentation from production source. */
export function ejectStories({
  projectDir,
  dryRun,
}: EjectStoriesRequest): Effect.Effect<
  StoryEjectionResult,
  StoryEjectionError
> {
  return ejectStoriesOperation(
    projectDir,
    dryRun === undefined ? {} : { dryRun },
  ).pipe(Effect.provide(NodeServices.layer));
}
