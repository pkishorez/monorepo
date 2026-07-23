import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

import {
  Cause,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Ref,
} from 'effect';
import { createJiti } from 'jiti';

import { loadConfig } from '../../config/load-config/index.js';
import type { LaymosConfig } from '../../config/types.js';
import { serializeProjectNarrative } from '../../config/project-narrative.js';
import {
  CurrentTrace,
  ScenarioRecorder,
  StoryBlockRegistry,
  TraceRecorder,
  roundMillis,
  traceValue,
} from '../runtime/artifact-index.js';
import type {
  StoryBlock,
  StoryRun,
  StoryScenario,
  StoryScenarioFailure,
  StoryScenarioFailurePhase,
  StoryTraceResult,
} from '../runtime/artifact-types.js';
import { collectDeclaredStories } from '../runtime/declare.js';
import type {
  ScenarioDeclaration,
  StoryDeclaration,
} from '../runtime/declare.js';
import { findLaymosSurfaces } from '../discover-stories/laymos-surface.js';
import type { LaymosSurface } from '../discover-stories/laymos-surface.js';
import { CurrentRecorder } from '../runtime/recorder.js';
import { CurrentOpaqueOperation } from '../runtime/runtime.js';
import type {
  StoryCatalog,
  StoryCatalogModule,
  StoryCatalogStory,
  StoryCollection,
} from '../../report/stories.js';
import {
  storyDecisionSourceRoles,
  validateStoryAuthoringSource,
} from '../inspect-story-source/index.js';
import {
  decision,
  exhaustive,
  flow,
  forEach,
  step,
  terminal,
  when,
} from '../authoring/index.js';

export interface StoryRunOptions {
  readonly timeout?: Duration.Input;
}

export interface StoryFailure {
  readonly storyId: string;
  readonly scenario?: string;
  readonly phase?: StoryScenarioFailurePhase;
  readonly message: string;
}

export interface StoriesRunResult {
  readonly status: 'passed' | 'failed';
  readonly runs: {
    readonly stories: Readonly<Record<string, StoryRun>>;
  };
  readonly failures: readonly StoryFailure[];
}

export class StoryRunnerError extends Data.TaggedError('StoryRunnerError')<{
  readonly operation: 'discover' | 'execute';
  readonly message: string;
  readonly cause: unknown;
}> {}

export interface StoryDiscoveryIssue {
  readonly storyId?: string;
  readonly message: string;
}

export class StoryDiscoveryError extends Data.TaggedError(
  'StoryDiscoveryError',
)<{
  readonly message: string;
  readonly issues: readonly StoryDiscoveryIssue[];
}> {}

const storyFilePattern = /\.story\.ts$/;
const validStoryFile = /^[a-z0-9]+(?:-[a-z0-9]+)*\.story\.ts$/;
const defaultTimeout: Duration.Input = '60 seconds';
const storyRuntimePath = resolve(import.meta.dirname, '../runtime/index.js');

export function executeStories(
  baseDir: string,
  filters: readonly string[],
  options?: StoryRunOptions,
): Effect.Effect<StoriesRunResult, StoryRunnerError> {
  return Effect.suspend(() => {
    enableSourceMaps();
    return runStoriesGeneration(baseDir, filters, options);
  }).pipe(Effect.mapError((cause) => storyRunnerError('execute', cause)));
}

export const getStories = flow(
  'Inspect project Stories',
  {
    description:
      'Discovers every declaration and traces its complete narrated structure without executing real leaf effects or Scenarios.',
    attributes: (baseDir: string) => ({ baseDir }),
  },
  (baseDir: string): Effect.Effect<StoryCollection, StoryDiscoveryError> =>
    Effect.gen(function* () {
      enableSourceMaps();
      const { catalog, declarations, project, modulePaths } =
        yield* discoverStoryDeclarations(baseDir);
      const inspected = yield* forEach(
        declarations,
        ({ storyId, declaration }) =>
          inspectDeclaredStory(baseDir, storyId, declaration, modulePaths),
        { concurrency: 1 },
      );
      const traces = Object.fromEntries(
        inspected.map(({ storyId, trace }) => [storyId, trace]),
      );
      return storyCollection(catalog, traces, project);
    }).pipe(Effect.mapError(normalizeStoryInspectionFailure)),
);

function storyCollection(
  catalog: StoryCatalog,
  traces: Readonly<Record<string, StoryTraceResult>>,
  project:
    | import('../../config/project-narrative.js').ProjectNarrative
    | undefined,
): StoryCollection {
  return {
    catalog,
    traces,
    ...(project === undefined ? {} : { project }),
  };
}

const inspectDeclaredStory = flow(
  'Trace one discovered Story',
  {
    description:
      'Runs one declaration with isolated trace values and keeps invalid structure as inspectable data.',
    attributes: (
      _baseDir: string,
      storyId: string,
      _declaration: StoryDeclaration,
      _modulePaths: readonly string[],
    ) => ({ storyId }),
  },
  (
    baseDir: string,
    storyId: string,
    declaration: StoryDeclaration,
    modulePaths: readonly string[],
  ): Effect.Effect<{
    readonly storyId: string;
    readonly trace: StoryTraceResult;
  }> =>
    step(
      'Traverse discovered Story in trace mode',
      {
        description:
          'Isolates structural tracing from the inspection Story recorder while skipping every opaque leaf effect.',
      },
      () =>
        traceDeclaredStory(baseDir, declaration, modulePaths).pipe(Effect.exit),
    ).pipe(
      Effect.flatMap((traced) =>
        decision(
          'Story traversal completed',
          {
            description:
              'Distinguishes a returned structural result from an unexpected tracing failure.',
          },
          Exit.isSuccess(traced),
        ).pipe(
          when(
            true,
            {
              name: 'Trace returned',
              description:
                'Keep either the valid structure or the declaration-level invalid trace.',
              completion: { kind: 'success' },
            },
            () =>
              terminal(
                'Discovered Story trace is ready',
                {
                  description:
                    'Completes inspection of this declaration with its returned structural result.',
                  completion: { kind: 'success' },
                },
                () =>
                  Effect.succeed({
                    storyId,
                    trace: successfulTrace(traced),
                  }),
              ),
          ),
          when(
            false,
            {
              name: 'Tracing failed',
              description:
                'Convert unexpected trace execution failure into invalid inspectable evidence.',
              completion: { kind: 'success' },
            },
            () =>
              terminal(
                'Tracing failure was preserved',
                {
                  description:
                    'Completes inspection with invalid evidence instead of failing the whole project catalog.',
                  completion: { kind: 'success' },
                },
                () =>
                  Effect.succeed({
                    storyId,
                    trace: failedTrace(traced),
                  }),
              ),
          ),
          exhaustive,
        ),
      ),
    ),
);

function successfulTrace(
  traced: Exit.Exit<StoryTraceResult, never>,
): StoryTraceResult {
  if (Exit.isSuccess(traced)) return traced.value;
  throw new Error('Expected successful Story trace exit');
}

function failedTrace(
  traced: Exit.Exit<StoryTraceResult, never>,
): StoryTraceResult {
  if (Exit.isFailure(traced)) {
    return {
      status: 'invalid',
      message: describeFailure(Cause.squash(traced.cause)),
      blocks: {},
      execution: [],
    };
  }
  throw new Error('Expected failed Story trace exit');
}

function traceDeclaredStory(
  baseDir: string,
  declaration: StoryDeclaration,
  modulePaths: readonly string[],
): Effect.Effect<StoryTraceResult> {
  if (declaration.execution === undefined) {
    return Effect.succeed({
      status: 'invalid',
      message: `Story "${declaration.name}" must declare one execution`,
      blocks: {},
      execution: [],
    });
  }
  const blocks = new StoryBlockRegistry(baseDir, modulePaths);
  const recorder = new TraceRecorder(blocks);
  const context = { recorder, path: recorder.root };
  return Effect.suspend(
    () =>
      declaration.execution!.execute(traceValue) as Effect.Effect<
        unknown,
        unknown,
        never
      >,
  ).pipe(
    Effect.provideService(CurrentTrace, context),
    Effect.provideService(CurrentOpaqueOperation, undefined),
    Effect.exit,
    Effect.map((exit) => {
      const structure = recorder.finish();
      const common = {
        blocks: blocks.toRecord(),
        execution: structure.execution,
      };
      return Exit.isSuccess(exit)
        ? {
            status: 'valid' as const,
            generatedAt: Date.now(),
            ...common,
            definitions: structure.definitions,
          }
        : {
            status: 'invalid' as const,
            message: describeFailure(Cause.squash(exit.cause)),
            ...common,
          };
    }),
    Effect.flatMap((result) =>
      fromPromise(async () => ({
        ...result,
        blocks: await annotateDecisionRoles(baseDir, result.blocks),
      })).pipe(Effect.orDie),
    ),
  );
}

async function annotateDecisionRoles(
  baseDir: string,
  blocks: Readonly<Record<string, StoryBlock>>,
): Promise<Readonly<Record<string, StoryBlock>>> {
  const rolesByFile = new Map<
    string,
    ReturnType<typeof storyDecisionSourceRoles>
  >();
  const entries = await Promise.all(
    Object.entries(blocks).map(async ([id, block]) => {
      if (block.kind !== 'decision') return [id, block] as const;
      let roles = rolesByFile.get(block.location.file);
      if (roles === undefined) {
        const source = await readFile(
          resolve(baseDir, block.location.file),
          'utf8',
        );
        roles = storyDecisionSourceRoles(source, block.location.file);
        rolesByFile.set(block.location.file, roles);
      }
      const role = roles
        .filter(({ line }) => line === block.location.line)
        .sort(
          (left, right) =>
            Math.abs(left.column - block.location.column) -
            Math.abs(right.column - block.location.column),
        )[0]?.role;
      return [id, role === undefined ? block : { ...block, role }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

const runStoriesGeneration = flow(
  'Run selected Stories',
  {
    description:
      'Discovers the current catalog, resolves selectors, creates fresh traces, and records every selected Scenario.',
    attributes: (
      baseDir: string,
      filters: readonly string[],
      _options: StoryRunOptions | undefined,
    ) => ({ baseDir, selectors: filters.length }),
  },
  (
    baseDir: string,
    filters: readonly string[],
    options: StoryRunOptions | undefined,
  ): Effect.Effect<StoriesRunResult, unknown> =>
    Effect.gen(function* () {
      const discovery = yield* discoverStoryDeclarations(baseDir);
      const files = yield* selectStoryFiles(baseDir, filters, discovery);
      const declarations = yield* forEach(
        files,
        (storyId) => loadSelectedStory(baseDir, storyId),
        { concurrency: 1 },
      );
      const traced = yield* forEach(
        declarations,
        ({ storyId, declaration }) =>
          traceSelectedStory(
            baseDir,
            storyId,
            declaration,
            discovery.modulePaths,
          ),
        { concurrency: 1 },
      );
      const traces = new Map(
        traced.map(({ storyId, trace }) => [storyId, trace]),
      );

      const failures: StoryFailure[] = [];
      const recorded = yield* forEach(
        declarations,
        ({ storyId, declaration }) =>
          recordSelectedStory(
            baseDir,
            storyId,
            declaration,
            traces.get(storyId)!,
            options,
            failures,
            discovery.modulePaths,
          ),
        { concurrency: 1 },
      );
      const stories = Object.fromEntries(
        recorded.map(({ storyId, run }) => [storyId, run]),
      );
      return yield* decision(
        'Any Scenario failed',
        {
          description:
            'Summarizes recorded Scenario evidence without turning behavior failures into runner infrastructure errors.',
          attributes: (failed) => ({
            failed,
            failures: failures.length,
          }),
        },
        failures.length > 0,
      ).pipe(
        when(
          false,
          {
            name: 'All passed',
            description:
              'Return every Story run with a passing aggregate status.',
            completion: { kind: 'success' },
          },
          () =>
            terminal(
              'Selected Stories passed',
              {
                description:
                  'Completes execution with all recorded Story and Scenario evidence.',
                completion: { kind: 'success' },
              },
              () =>
                Effect.succeed({
                  status: 'passed',
                  runs: { stories },
                  failures,
                } as const),
            ),
        ),
        when(
          true,
          {
            name: 'Failures recorded',
            description:
              'Return the evidence with a failed aggregate status instead of losing it through the Effect error channel.',
            completion: { kind: 'success' },
          },
          () =>
            terminal(
              'Selected Stories completed with failures',
              {
                description:
                  'Completes execution successfully while preserving each failed Scenario phase as report data.',
                completion: { kind: 'success' },
              },
              () =>
                Effect.succeed({
                  status: 'failed',
                  runs: { stories },
                  failures,
                } as const),
            ),
        ),
        exhaustive,
      );
    }),
);

interface StorySelection {
  readonly configuredStoryIds: ReadonlySet<string>;
  readonly byModule: ReadonlyMap<string, readonly string[]>;
  readonly allStoryIds: readonly string[];
}

function storySelection(discovery: StoryDiscovery): StorySelection {
  const catalogStories = discovery.catalog.modules.flatMap(
    ({ stories }) => stories,
  );
  const byModule = new Map(
    discovery.modulePaths.map((modulePath) => [
      modulePath,
      [] as readonly string[],
    ]),
  );
  for (const module of discovery.catalog.modules) {
    byModule.set(
      module.modulePath,
      module.stories.map(({ storyPath }) => storyPath),
    );
  }
  return {
    configuredStoryIds: new Set(
      catalogStories.map(({ storyPath }) => storyPath),
    ),
    byModule,
    allStoryIds: catalogStories.map(({ storyPath }) => storyPath),
  };
}

const selectStoryFiles = flow(
  'Resolve Story selection',
  {
    description:
      'Expands Story and Module identities into one deterministic set of configured files and verifies that each file still exists.',
  },
  (
    baseDir: string,
    filters: readonly string[],
    discovery: StoryDiscovery,
  ): Effect.Effect<readonly string[], unknown> => {
    const selection = storySelection(discovery);
    return decision(
      'Selectors were provided',
      {
        description:
          'Chooses between the complete catalog and explicit Story or Module selection.',
      },
      filters.length > 0,
    ).pipe(
      when(
        false,
        {
          name: 'Run all Stories',
          description:
            'Use every Story identity from the freshly discovered catalog.',
        },
        () =>
          validateSelectedStories(baseDir, selection.allStoryIds, selection),
      ),
      when(
        true,
        {
          name: 'Resolve selectors',
          description:
            'Resolve each requested identity as either one Story or all Stories owned by one Module.',
          errors: ['Unknown Story selector'],
        },
        () =>
          forEach(
            filters,
            (selector) => resolveStorySelector(selector, selection),
            { concurrency: 1 },
          ).pipe(
            Effect.map((selected) => [...new Set(selected.flat())].sort()),
            Effect.flatMap((selected) =>
              validateSelectedStories(baseDir, selected, selection),
            ),
          ),
      ),
      exhaustive,
    );
  },
);

const resolveStorySelector = flow(
  'Resolve one Story selector',
  {
    description:
      'Gives exact Story identity precedence, then falls back to configured Module ownership.',
    attributes: (selector: string, _selection: StorySelection) => ({
      selector,
    }),
  },
  (
    selector: string,
    selection: StorySelection,
  ): Effect.Effect<readonly string[], Error> =>
    decision(
      'Selector identifies a Story',
      {
        description:
          'Checks the catalog before interpreting the same string as a Module path.',
      },
      selection.configuredStoryIds.has(selector),
    ).pipe(
      when(
        true,
        {
          name: 'Story',
          description: 'Select only the exact configured Story.',
          completion: { kind: 'success' },
        },
        () => Effect.succeed([selector]),
      ),
      when(
        false,
        {
          name: 'Not a Story',
          description: 'Try the selector against configured Module identities.',
          errors: ['Unknown Story selector'],
        },
        () => resolveModuleSelector(selector, selection),
      ),
      exhaustive,
    ),
);

const resolveModuleSelector = flow(
  'Resolve Module selector',
  {
    description:
      'Expands a configured Module to its owned Stories, including a valid empty result.',
    attributes: (selector: string, _selection: StorySelection) => ({
      selector,
    }),
  },
  (
    selector: string,
    selection: StorySelection,
  ): Effect.Effect<readonly string[], Error> => {
    const stories = selection.byModule.get(selector);
    return decision(
      'Selector identifies a Module',
      {
        description:
          'Distinguishes a configured Module with zero Stories from an unknown selector.',
      },
      stories !== undefined,
    ).pipe(
      when(
        true,
        {
          name: 'Module',
          description:
            'Select every Story owned by the Module; an empty Module remains a successful selection.',
          completion: { kind: 'success' },
        },
        () => Effect.succeed(stories!),
      ),
      when(
        false,
        {
          name: 'Unknown',
          description:
            'Reject the selector before loading or executing any Story.',
          completion: {
            kind: 'error',
            error: 'Unknown Story selector',
          },
        },
        () => Effect.fail(new Error(`Unknown Story selector: ${selector}`)),
      ),
      exhaustive,
    );
  },
);

const validateSelectedStories = flow(
  'Validate selected Story files',
  {
    description:
      'Checks catalog membership, naming, and current file-system presence before module execution begins.',
  },
  (
    baseDir: string,
    storyIds: readonly string[],
    selection: StorySelection,
  ): Effect.Effect<readonly string[], Error> =>
    forEach(
      storyIds,
      (storyId) => validateSelectedStory(baseDir, storyId, selection),
      { concurrency: 1 },
    ),
);

const validateSelectedStory = flow(
  'Validate one selected Story',
  {
    description:
      'Protects execution from stale or malformed Story identities after selection.',
    attributes: (
      _baseDir: string,
      storyId: string,
      _selection: StorySelection,
    ) => ({ storyId }),
  },
  (
    baseDir: string,
    storyId: string,
    selection: StorySelection,
  ): Effect.Effect<string, Error> =>
    decision(
      'Story identity is configured and well formed',
      {
        description:
          'Rejects identities that do not belong to the catalog or violate the kebab-case Story convention.',
      },
      selection.configuredStoryIds.has(storyId) && isValidStoryFile(storyId),
    ).pipe(
      when(
        false,
        {
          name: 'Invalid identity',
          description:
            'Stop before touching the file system because the selected identity is not executable.',
          completion: { kind: 'error', error: 'Invalid Story identity' },
        },
        () =>
          Effect.fail(
            new Error(`Story file is not configured or invalid: ${storyId}`),
          ),
      ),
      when(
        true,
        {
          name: 'Valid identity',
          description:
            'Confirm that the cataloged file has not disappeared since discovery.',
          errors: ['Story file not found'],
        },
        () => confirmSelectedStoryExists(baseDir, storyId),
      ),
      exhaustive,
    ),
);

const confirmSelectedStoryExists = flow(
  'Confirm selected Story exists',
  {
    description:
      'Performs the final file-system check immediately before the Story module is loaded.',
  },
  (baseDir: string, storyId: string): Effect.Effect<string, Error> =>
    step(
      'Check selected Story file',
      {
        description:
          'Asks the file system whether the selected .story.ts file still exists.',
      },
      () =>
        Effect.sync(() => existsSync(resolve(baseDir, `${storyId}.story.ts`))),
    ).pipe(
      Effect.flatMap((exists) =>
        decision(
          'Selected Story file exists',
          {
            description:
              'Chooses whether module loading can continue or selection is stale.',
          },
          exists,
        ).pipe(
          when(
            true,
            {
              name: 'Present',
              description: 'Return the verified Story identity.',
              completion: { kind: 'success' },
            },
            () => Effect.succeed(storyId),
          ),
          when(
            false,
            {
              name: 'Missing',
              description:
                'Stop with the exact file identity that disappeared.',
              completion: {
                kind: 'error',
                error: 'Story file not found',
              },
            },
            () =>
              Effect.fail(
                new Error(`Story file not found: ${storyId}.story.ts`),
              ),
          ),
          exhaustive,
        ),
      ),
    ),
);

const loadSelectedStory = flow(
  'Load selected Story declaration',
  {
    description:
      'Executes one selected Story module and enforces the one-file, one-Story declaration contract.',
    attributes: (_baseDir: string, storyId: string) => ({ storyId }),
  },
  (
    baseDir: string,
    storyId: string,
  ): Effect.Effect<
    { readonly storyId: string; readonly declaration: StoryDeclaration },
    unknown
  > =>
    step(
      'Execute selected Story module with jiti',
      {
        description:
          'Loads the TypeScript Story file with laymos/story aliased to this runtime and collects its declarations.',
      },
      () =>
        fromPromise(() =>
          collectDeclaredStories(() => loadStoryModule(baseDir, storyId)),
        ),
    ).pipe(
      Effect.flatMap((collected) =>
        decision(
          'Story file declares exactly one Story',
          {
            description:
              'Rejects empty or ambiguous Story files before structural tracing.',
            attributes: (valid) => ({
              valid,
              declarations: collected.length,
            }),
          },
          collected.length === 1,
        ).pipe(
          when(
            true,
            {
              name: 'One declaration',
              description:
                'Pair the selected identity with its sole declaration.',
              completion: { kind: 'success' },
            },
            () =>
              Effect.succeed({
                storyId,
                declaration: collected[0]!,
              }),
          ),
          when(
            false,
            {
              name: 'Invalid declaration count',
              description:
                'Reject the file because its ownership and execution identity are ambiguous.',
              completion: {
                kind: 'error',
                error: 'Invalid Story declaration count',
              },
            },
            () =>
              Effect.fail(
                new Error(
                  `Story file "${storyId}" must declare exactly one Story`,
                ),
              ),
          ),
          exhaustive,
        ),
      ),
    ),
);

const traceSelectedStory = flow(
  'Trace selected Story',
  {
    description:
      'Traverses every narrated branch without real leaf effects and rejects structures that cannot produce reliable evidence.',
    attributes: (
      _baseDir: string,
      storyId: string,
      _declaration: StoryDeclaration,
      _modulePaths: readonly string[],
    ) => ({ storyId }),
  },
  (
    baseDir: string,
    storyId: string,
    declaration: StoryDeclaration,
    modulePaths: readonly string[],
  ): Effect.Effect<
    {
      readonly storyId: string;
      readonly trace: Extract<StoryTraceResult, { readonly status: 'valid' }>;
    },
    Error
  > =>
    step(
      'Traverse the Story in trace mode',
      {
        description:
          'Runs the declaration with isolated trace values so leaf effects are skipped while every narrated branch is recorded.',
      },
      () => traceDeclaredStory(baseDir, declaration, modulePaths),
    ).pipe(
      Effect.flatMap((trace) =>
        decision(
          'Structural trace is valid',
          {
            description:
              'Separates a complete narrated structure from a Story that cannot safely be executed or measured.',
          },
          trace.status === 'valid',
        ).pipe(
          when(
            true,
            {
              name: 'Valid trace',
              description:
                'Keep the trace as the structural baseline for Scenario recording.',
              completion: { kind: 'success' },
            },
            () =>
              Effect.succeed({
                storyId,
                trace: trace as Extract<
                  StoryTraceResult,
                  { readonly status: 'valid' }
                >,
              }),
          ),
          when(
            false,
            {
              name: 'Invalid trace',
              description:
                'Stop before Scenarios run because their visits could not be compared with a trustworthy structure.',
              completion: {
                kind: 'error',
                error: 'Invalid Story trace',
              },
            },
            () =>
              Effect.fail(
                new Error(
                  `Story "${storyId}" has an invalid trace: ${
                    (
                      trace as Extract<
                        StoryTraceResult,
                        { readonly status: 'invalid' }
                      >
                    ).message
                  }`,
                ),
              ),
          ),
          exhaustive,
        ),
      ),
    ),
);

const recordSelectedStory = flow(
  'Record selected Story Scenarios',
  {
    description:
      'Runs one Story declaration against its fresh trace and returns all Scenario visits and failures as evidence.',
    attributes: (
      _baseDir: string,
      storyId: string,
      _declaration: StoryDeclaration,
      _trace: Extract<StoryTraceResult, { readonly status: 'valid' }>,
      _options: StoryRunOptions | undefined,
      _failures: StoryFailure[],
      _modulePaths: readonly string[],
    ) => ({ storyId }),
  },
  (
    baseDir: string,
    storyId: string,
    declaration: StoryDeclaration,
    trace: Extract<StoryTraceResult, { readonly status: 'valid' }>,
    options: StoryRunOptions | undefined,
    failures: StoryFailure[],
    modulePaths: readonly string[],
  ): Effect.Effect<
    { readonly storyId: string; readonly run: StoryRun },
    unknown
  > =>
    step(
      'Execute and record Story Scenarios',
      {
        description:
          'Runs the Story lifecycle in an isolated recorder so its own narrated visits become Scenario evidence rather than runner narration.',
      },
      () =>
        runDeclaredStory(
          baseDir,
          storyId,
          declaration,
          trace,
          options,
          failures,
          modulePaths,
        ),
    ).pipe(Effect.map((run) => ({ storyId, run }))),
);

function runDeclaredStory(
  baseDir: string,
  storyId: string,
  declaration: StoryDeclaration,
  trace: Extract<StoryTraceResult, { readonly status: 'valid' }>,
  options: StoryRunOptions | undefined,
  failures: StoryFailure[],
  modulePaths: readonly string[],
): Effect.Effect<StoryRun, unknown> {
  return Effect.scoped(
    Effect.gen(function* () {
      if (declaration.execution === undefined) {
        return yield* Effect.fail(
          new Error(`Story "${declaration.name}" must declare one execution`),
        );
      }
      const environment =
        declaration.execution.layer === undefined
          ? (Context.empty() as unknown as Context.Context<any>)
          : yield* Layer.build(
              declaration.execution.layer as Layer.Layer<any, any, never>,
            );
      const blocks = new StoryBlockRegistry(baseDir, modulePaths);
      const scenarios: StoryScenario[] = [];
      for (const declared of declaration.scenarios) {
        scenarios.push(
          yield* runScenario(
            storyId,
            declaration,
            declared,
            blocks,
            environment,
            options,
            failures,
          ),
        );
      }
      const allBlocks = { ...blocks.toRecord(), ...trace.blocks };
      return {
        generatedAt: Date.now(),
        name: declaration.name,
        description: declaration.description,
        ...(declaration.documentation === undefined
          ? {}
          : { documentation: declaration.documentation }),
        blocks: allBlocks,
        scenarios,
        scenarioNodeCoverage: scenarioNodeCoverage(allBlocks, scenarios),
      };
    }),
  );
}

function scenarioNodeCoverage(
  blocks: StoryRun['blocks'],
  scenarios: readonly StoryScenario[],
): NonNullable<StoryRun['scenarioNodeCoverage']> {
  const visited = new Set<string>();
  const collect = (path: StoryScenario['execution']): void => {
    for (const item of path) {
      if ('parallel' in item) {
        for (const branch of item.parallel) collect(branch);
      } else {
        visited.add(item.blockId);
        collect(item.children);
      }
    }
  };
  for (const scenario of scenarios) collect(scenario.execution);
  const blockIds = new Set(Object.keys(blocks));
  const visitedBlocks = [...visited].filter((blockId) =>
    blockIds.has(blockId),
  ).length;
  const total = blockIds.size;
  return {
    visited: visitedBlocks,
    total,
    percentage:
      total === 0 ? 0 : Math.round((visitedBlocks / total) * 1000) / 10,
  };
}

function runScenario(
  storyId: string,
  story: StoryDeclaration,
  declared: ScenarioDeclaration,
  blocks: StoryBlockRegistry,
  environment: Context.Context<any>,
  options: StoryRunOptions | undefined,
  failures: StoryFailure[],
): Effect.Effect<StoryScenario, unknown> {
  const base = {
    name: declared.name,
    description: declared.description,
    ...(declared.documentation === undefined
      ? {}
      : { documentation: declared.documentation }),
    location: {
      file: `${storyId}.story.ts`,
      line: declared.location.line,
      column: declared.location.column,
    },
  };
  if (declared.mode === 'skip') {
    return Effect.succeed({
      ...base,
      outcome: 'skipped',
      execution: [],
      failures: [],
    });
  }

  const recorder = new ScenarioRecorder(blocks);
  const startedAt = Date.now();
  const startMonotonic = performance.now();
  const scenarioEnvironment = Context.add(
    Context.add(environment, CurrentOpaqueOperation, undefined),
    CurrentRecorder,
    recorder,
  );
  return runScenarioLifecycle(
    story,
    declared,
    recorder,
    scenarioEnvironment,
    options,
  ).pipe(
    Effect.ensuring(Effect.sync(() => recorder.close())),
    Effect.map((result) => {
      const durationMillis = roundMillis(performance.now() - startMonotonic);
      for (const failure of result.failures) {
        failures.push({
          storyId,
          scenario: declared.name,
          phase: failure.phase,
          message: failure.message,
        });
      }
      return {
        ...base,
        outcome: result.outcome,
        startedAt,
        durationMillis,
        execution: recorder.execution(),
        failures: result.failures,
      };
    }),
  );
}

interface ScenarioResult {
  readonly outcome: 'succeeded' | 'failed' | 'interrupted';
  readonly failures: readonly StoryScenarioFailure[];
}

interface ScenarioProgress {
  readonly phase: StoryScenarioFailurePhase;
  readonly failures: readonly StoryScenarioFailure[];
  readonly interrupted: boolean;
}

function runScenarioLifecycle(
  story: StoryDeclaration,
  scenario: Extract<ScenarioDeclaration, { readonly mode: 'run' }>,
  recorder: ScenarioRecorder,
  environment: Context.Context<any>,
  options: StoryRunOptions | undefined,
): Effect.Effect<ScenarioResult, unknown> {
  const execution = story.execution;
  if (execution === undefined) {
    return Effect.fail(new Error(`Story "${story.name}" has no execution`));
  }
  const timeout = (scenario.run.timeout ??
    options?.timeout ??
    defaultTimeout) as Duration.Input;
  return Effect.gen(function* () {
    const progress = yield* Ref.make<ScenarioProgress>({
      phase: 'preparation',
      failures: [],
      interrupted: false,
    });
    const lifecycleExit = yield* runEffectLifecycle(
      execution,
      scenario.run,
      recorder,
      progress,
    ).pipe(Effect.provide(environment), Effect.timeout(timeout), Effect.exit);
    if (Exit.isSuccess(lifecycleExit)) return lifecycleExit.value;
    if (!isTimeoutCause(lifecycleExit.cause)) {
      return yield* Effect.failCause(lifecycleExit.cause);
    }
    const current = yield* Ref.get(progress);
    return {
      outcome: 'interrupted',
      failures: [
        ...current.failures,
        { phase: current.phase, message: timeoutMessage(timeout) },
      ],
    };
  });
}

type EffectRun = Extract<ScenarioDeclaration, { readonly mode: 'run' }>['run'];
type EffectExecution = NonNullable<StoryDeclaration['execution']>;

function runEffectLifecycle(
  execution: EffectExecution,
  run: EffectRun,
  recorder: ScenarioRecorder,
  progress: Ref.Ref<ScenarioProgress>,
): Effect.Effect<ScenarioResult, unknown, any> {
  return Effect.gen(function* () {
    const prepareExit = yield* runEffectPhase(run.prepare).pipe(Effect.exit);
    if (Exit.isFailure(prepareExit)) {
      yield* recordPhaseFailure(progress, 'preparation', prepareExit.cause);
      return yield* scenarioResult(progress);
    }

    const prepared = prepareExit.value;
    const body = Effect.gen(function* () {
      yield* setPhase(progress, 'execution');
      const executionExit = yield* Effect.acquireUseRelease(
        Effect.sync(() => recorder.activate()),
        () =>
          runEffectPhase(() => execution.execute(prepared)).pipe(Effect.exit),
        () => Effect.sync(() => recorder.deactivate()),
      );
      for (const message of recorder.terminalMismatches()) {
        yield* addFailure(progress, { phase: 'execution', message });
      }
      if (
        Exit.isFailure(executionExit) &&
        Cause.hasInterruptsOnly(executionExit.cause)
      ) {
        yield* recordPhaseFailure(
          progress,
          'execution',
          executionExit.cause,
          'Story execution was interrupted',
        );
        return;
      }

      const verification = expectedVerification(
        run.expectation,
        executionExit,
        prepared,
      );
      if (verification.kind === 'mismatch') {
        yield* addFailure(progress, {
          phase: 'execution',
          message: verification.message,
        });
        return;
      }

      yield* setPhase(progress, 'verification');
      const verificationExit = yield* runEffectPhase(verification.verify).pipe(
        Effect.exit,
      );
      if (Exit.isFailure(verificationExit)) {
        yield* recordPhaseFailure(
          progress,
          'verification',
          verificationExit.cause,
        );
      }
    });
    yield* Effect.onExitPrimitive(
      body,
      (bodyExit) => runCleanup(run, prepared, progress, bodyExit),
      true,
    );
    return yield* scenarioResult(progress);
  });
}

function runEffectPhase(
  phase: () => unknown,
): Effect.Effect<unknown, unknown, any> {
  return Effect.suspend(phase as () => Effect.Effect<unknown, unknown, any>);
}

function expectedVerification(
  expectation: EffectRun['expectation'],
  executionExit: Exit.Exit<unknown, unknown>,
  prepared: unknown,
):
  | { readonly kind: 'verify'; readonly verify: () => unknown }
  | { readonly kind: 'mismatch'; readonly message: string } {
  if (expectation.kind === 'success') {
    return Exit.isSuccess(executionExit)
      ? {
          kind: 'verify',
          verify: () => expectation.verify(executionExit.value, prepared),
        }
      : {
          kind: 'mismatch',
          message: `Expected a success value but execution failed: ${describeFailure(Cause.squash(executionExit.cause))}`,
        };
  }
  if (Exit.isSuccess(executionExit)) {
    return {
      kind: 'mismatch',
      message: 'Expected a typed error but execution succeeded',
    };
  }
  if (
    Cause.hasDies(executionExit.cause) ||
    Cause.hasInterrupts(executionExit.cause)
  ) {
    return {
      kind: 'mismatch',
      message: `Expected a typed error but execution terminated unexpectedly: ${describeFailure(Cause.squash(executionExit.cause))}`,
    };
  }
  const error = Cause.findErrorOption(executionExit.cause);
  return Option.isSome(error)
    ? {
        kind: 'verify',
        verify: () => expectation.verify(error.value, prepared),
      }
    : {
        kind: 'mismatch',
        message: 'Expected a typed error but execution produced none',
      };
}

function runCleanup(
  run: EffectRun,
  prepared: unknown,
  progress: Ref.Ref<ScenarioProgress>,
  bodyExit: Exit.Exit<unknown, unknown>,
): Effect.Effect<void, never, any> {
  if (run.cleanup === undefined) return Effect.void;
  return Effect.gen(function* () {
    if (Exit.isSuccess(bodyExit) || !Cause.hasInterruptsOnly(bodyExit.cause)) {
      yield* setPhase(progress, 'cleanup');
    }
    const cleanupExit = yield* runEffectPhase(() =>
      run.cleanup!(prepared),
    ).pipe(Effect.exit);
    if (Exit.isFailure(cleanupExit)) {
      yield* recordPhaseFailure(progress, 'cleanup', cleanupExit.cause);
    }
  });
}

function setPhase(
  progress: Ref.Ref<ScenarioProgress>,
  phase: StoryScenarioFailurePhase,
): Effect.Effect<void> {
  return Ref.update(progress, (current) => ({ ...current, phase }));
}

function addFailure(
  progress: Ref.Ref<ScenarioProgress>,
  failure: StoryScenarioFailure,
  interrupted = false,
): Effect.Effect<void> {
  return Ref.update(progress, (current) => ({
    ...current,
    failures: [...current.failures, failure],
    interrupted: current.interrupted || interrupted,
  }));
}

function recordPhaseFailure(
  progress: Ref.Ref<ScenarioProgress>,
  phase: StoryScenarioFailurePhase,
  cause: Cause.Cause<unknown>,
  interruptionMessage?: string,
): Effect.Effect<void> {
  const interrupted = Cause.hasInterruptsOnly(cause);
  return addFailure(
    progress,
    {
      phase,
      message:
        interrupted && interruptionMessage !== undefined
          ? interruptionMessage
          : describeFailure(Cause.squash(cause)),
    },
    interrupted,
  );
}

function scenarioResult(
  progress: Ref.Ref<ScenarioProgress>,
): Effect.Effect<ScenarioResult> {
  return Ref.get(progress).pipe(
    Effect.map((current) => ({
      outcome: current.interrupted
        ? ('interrupted' as const)
        : current.failures.length === 0
          ? ('succeeded' as const)
          : ('failed' as const),
      failures: current.failures,
    })),
  );
}

function isTimeoutCause(cause: Cause.Cause<unknown>): boolean {
  const error = Cause.findErrorOption(cause);
  return Option.isSome(error) && Cause.isTimeoutError(error.value);
}

async function loadStoryModule(
  baseDir: string,
  storyId: string,
): Promise<void> {
  const path = resolve(baseDir, `${storyId}.story.ts`);
  const jiti = createJiti(import.meta.url, {
    alias: { 'laymos/story': storyRuntimePath },
    interopDefault: true,
    moduleCache: false,
  });
  await jiti.import(path);
}

export function discoverStories(
  baseDir: string,
): Effect.Effect<StoryCatalog, StoryDiscoveryError> {
  return discoverStoryDeclarations(baseDir).pipe(
    Effect.map(({ catalog }) => catalog),
  );
}

interface StoryDiscovery {
  readonly catalog: StoryCatalog;
  readonly declarations: readonly {
    readonly storyId: string;
    readonly declaration: StoryDeclaration;
  }[];
  readonly project?: import('../../config/project-narrative.js').ProjectNarrative;
  readonly modulePaths: readonly string[];
}

const discoverStoryDeclarations = flow(
  'Discover Story declarations',
  {
    description:
      'Turns configured Module ownership into a validated catalog of exactly one declaration per Story file.',
    attributes: (baseDir: string) => ({ baseDir }),
  },
  (baseDir: string): Effect.Effect<StoryDiscovery, StoryDiscoveryError> =>
    Effect.gen(function* () {
      const config = yield* loadConfig({ projectDir: baseDir });
      const surfaces = yield* step(
        'Find Module Laymos surfaces',
        {
          description:
            'Checks each configured folder Module for its flat laymos directory while ignoring file Modules.',
        },
        () =>
          Effect.tryPromise({
            try: () => findLaymosSurfaces(baseDir, config.modules ?? []),
            catch: (cause) =>
              discoveryError([{ message: errorMessage(cause) }]),
          }),
      );
      const attempted = yield* step(
        'Read and load Story files',
        {
          description:
            'Reads each surface, validates authoring syntax, executes Story modules through jiti, and collects declaration issues.',
        },
        () =>
          Effect.tryPromise({
            try: () => buildStoryDiscovery(baseDir, config, surfaces),
            catch: normalizeDiscoveryFailure,
          }),
      );
      return yield* decision(
        'Story discovery found issues',
        {
          description:
            'Chooses whether the catalog is safe to expose or must fail with every source and declaration problem.',
          attributes: (hasIssues) => ({
            hasIssues,
            issues: attempted.issues.length,
          }),
        },
        attempted.issues.length > 0,
      ).pipe(
        when(
          true,
          {
            name: 'Invalid catalog',
            description:
              'Reject all partial results so consumers never receive an ambiguous Story catalog.',
            completion: {
              kind: 'error',
              error: 'StoryDiscoveryError',
            },
          },
          () =>
            terminal(
              'Story catalog is invalid',
              {
                description:
                  'Returns one typed discovery failure containing all file and declaration issues.',
                completion: {
                  kind: 'error',
                  error: 'StoryDiscoveryError',
                },
              },
              () => Effect.fail(discoveryError(attempted.issues)),
            ),
        ),
        when(
          false,
          {
            name: 'Valid catalog',
            description:
              'Expose deterministic Module ownership, declarations, and Project Narrative.',
            completion: { kind: 'success' },
          },
          () =>
            terminal(
              'Story catalog is ready',
              {
                description:
                  'Completes discovery with sorted Story identities and their loaded declarations.',
                completion: { kind: 'success' },
              },
              () => Effect.succeed(attempted.discovery),
            ),
        ),
        exhaustive,
      );
    }).pipe(Effect.mapError(normalizeDiscoveryFailure)),
);

async function buildStoryDiscovery(
  baseDir: string,
  config: LaymosConfig,
  surfaces: readonly LaymosSurface[],
): Promise<{
  readonly discovery: StoryDiscovery;
  readonly issues: readonly StoryDiscoveryIssue[];
}> {
  const { stories, issues } = await discoverStoryFiles(baseDir, surfaces);
  const declarations: Array<{
    readonly storyId: string;
    readonly storyKey: string;
    readonly surface: LaymosSurface;
    readonly declaration: StoryDeclaration;
  }> = [];

  for (const discovered of stories) {
    const { storyId, storyKey, surface } = discovered;
    try {
      const found = await collectDeclaredStories(() =>
        loadStoryModule(baseDir, storyId),
      );
      if (found.length !== 1) {
        issues.push({
          storyId,
          message: `must declare exactly one Story; found ${found.length}`,
        });
        continue;
      }
      declarations.push({
        storyId,
        storyKey,
        surface,
        declaration: found[0]!,
      });
    } catch (cause) {
      issues.push({ storyId, message: errorMessage(cause) });
    }
  }

  const catalog = validateStoryCatalog(declarations);
  return {
    discovery: {
      catalog,
      declarations,
      modulePaths: (config.modules ?? []).map(({ path }) => path),
      ...(config.project === undefined
        ? {}
        : { project: serializeProjectNarrative(config.project) }),
    },
    issues,
  };
}

async function discoverStoryFiles(
  baseDir: string,
  surfaces: readonly LaymosSurface[],
): Promise<{
  readonly stories: {
    readonly storyId: string;
    readonly storyKey: string;
    readonly surface: LaymosSurface;
  }[];
  readonly issues: StoryDiscoveryIssue[];
}> {
  const stories: {
    readonly storyId: string;
    readonly storyKey: string;
    readonly surface: LaymosSurface;
  }[] = [];
  const issues: StoryDiscoveryIssue[] = [];
  for (const surface of surfaces) {
    const directory = resolve(baseDir, surface.path);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        issues.push({
          message: `Module "${surface.modulePath}" Laymos surface contains nested path "${surface.path}/${entry.name}"`,
        });
        continue;
      }
      if (!entry.isFile()) continue;
      const filePath = relative(baseDir, join(directory, entry.name))
        .split(sep)
        .join('/');
      if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        const source = await readFile(join(directory, entry.name), 'utf8');
        for (const message of validateStoryAuthoringSource(source, filePath)) {
          issues.push({ message });
        }
      }
      if (!storyFilePattern.test(entry.name)) continue;
      try {
        validateStoryFile(filePath);
        stories.push({
          storyId: filePath.slice(0, -'.story.ts'.length),
          storyKey: entry.name.slice(0, -'.story.ts'.length),
          surface,
        });
      } catch (cause) {
        issues.push({ storyId: filePath, message: errorMessage(cause) });
      }
    }
  }
  stories.sort((left, right) => left.storyId.localeCompare(right.storyId));
  return { stories, issues };
}

function validateStoryCatalog(
  declarations: readonly {
    readonly storyId: string;
    readonly storyKey: string;
    readonly surface: LaymosSurface;
    readonly declaration: StoryDeclaration;
  }[],
): StoryCatalog {
  const byModule = new Map<string, StoryCatalogStory[]>();
  const descriptions = new Map<string, string>();
  for (const { storyId, storyKey, surface, declaration } of declarations) {
    const stories = byModule.get(surface.modulePath) ?? [];
    byModule.set(surface.modulePath, stories);
    descriptions.set(surface.modulePath, surface.moduleDescription);
    stories.push({
      storyPath: storyId,
      storyKey,
      modulePath: surface.modulePath,
      name: declaration.name,
      description: declaration.description,
      ...(declaration.documentation === undefined
        ? {}
        : { documentation: declaration.documentation }),
      ...(declaration.scenarios.length === 0
        ? {}
        : {
            scenarios: declaration.scenarios.map((scenario) => ({
              name: scenario.name,
              description: scenario.description,
              ...(scenario.documentation === undefined
                ? {}
                : { documentation: scenario.documentation }),
            })),
          }),
    });
  }
  const modules: StoryCatalogModule[] = [...byModule]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modulePath, stories]) => ({
      modulePath,
      description: descriptions.get(modulePath)!,
      stories: stories.sort((left, right) =>
        left.storyPath.localeCompare(right.storyPath),
      ) as [StoryCatalogStory, ...StoryCatalogStory[]],
    }));
  return { modules };
}

function discoveryError(
  issues: readonly StoryDiscoveryIssue[],
): StoryDiscoveryError {
  const details = issues.map(
    ({ storyId, message }) =>
      `- ${storyId === undefined ? message : `${storyId}: ${message}`}`,
  );
  return new StoryDiscoveryError({
    message: `Story catalog is invalid:\n${details.join('\n')}`,
    issues,
  });
}

function normalizeDiscoveryFailure(cause: unknown): StoryDiscoveryError {
  return cause instanceof StoryDiscoveryError
    ? cause
    : discoveryError([{ message: errorMessage(cause) }]);
}

function normalizeStoryInspectionFailure(cause: unknown): StoryDiscoveryError {
  return cause instanceof StoryDiscoveryError
    ? cause
    : new StoryDiscoveryError({
        message: 'Story tracing failed',
        issues: [{ message: describeFailure(cause) }],
      });
}

function validateStoryFile(storyId: string): void {
  const filePath = storyId.endsWith('.story.ts')
    ? storyId
    : `${storyId}.story.ts`;
  if (!validStoryFile.test(basename(filePath))) {
    throw new Error(
      `Story file "${filePath}" must use the kebab-case <story-name>.story.ts convention`,
    );
  }
}

function isValidStoryFile(storyId: string): boolean {
  const filePath = storyId.endsWith('.story.ts')
    ? storyId
    : `${storyId}.story.ts`;
  return validStoryFile.test(basename(filePath));
}

function timeoutMessage(timeout: Duration.Input | number): string {
  const millis =
    typeof timeout === 'number' ? timeout : Duration.toMillis(timeout);
  return `Scenario timed out after ${millis}ms`;
}

function describeFailure(failure: unknown): string {
  if (failure instanceof Error) return failure.message;
  if (typeof failure === 'string') return failure;
  return String(failure);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function enableSourceMaps(): void {
  try {
    process.setSourceMapsEnabled(true);
  } catch {
    // best-effort; some runtimes do not implement it
  }
}

function fromPromise<A>(
  body: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, unknown> {
  return Effect.tryPromise({ try: body, catch: (cause) => cause });
}

function storyRunnerError(
  operation: StoryRunnerError['operation'],
  cause: unknown,
): StoryRunnerError {
  if (cause instanceof StoryRunnerError) return cause;
  return new StoryRunnerError({
    operation,
    message: describeFailure(cause),
    cause,
  });
}
