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

import { loadConfig } from '../../config/load-config.js';
import type { LaymosConfig } from '../../config/types.js';
import { serializeProjectNarrative } from '../core/project-narrative.js';
import {
  CurrentTrace,
  ScenarioRecorder,
  StoryBlockRegistry,
  TraceRecorder,
  roundMillis,
  traceValue,
} from '../artifact/index.js';
import type {
  StoryBlock,
  StoryRun,
  StoryScenario,
  StoryScenarioFailure,
  StoryScenarioFailurePhase,
  StoryTraceResult,
} from '../artifact/types.js';
import { collectDeclaredStories } from '../core/declare.js';
import type { ScenarioDeclaration, StoryDeclaration } from '../core/declare.js';
import { findStorySurfaces } from '../core/story-surface.js';
import type { StorySurface } from '../core/story-surface.js';
import { CurrentRecorder } from '../core/recorder.js';
import type {
  StoryCatalog,
  StoryCatalogModule,
  StoryCatalogStory,
  StoryCollection,
} from '../../report/stories.js';
import {
  storyDecisionSourceRoles,
  validateStoryAuthoringSource,
} from '../eject/index.js';

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
const storyRuntimePath = resolve(
  import.meta.dirname,
  '../story-runtime/index.js',
);

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

export function getStories(
  baseDir: string,
): Effect.Effect<StoryCollection, StoryDiscoveryError> {
  return Effect.gen(function* () {
    enableSourceMaps();
    const { catalog, declarations, project, modulePaths } =
      yield* discoverStoryDeclarations(baseDir);
    const traces: Record<string, StoryTraceResult> = {};
    for (const { storyId, declaration } of declarations) {
      const traced = yield* traceDeclaredStory(
        baseDir,
        declaration,
        modulePaths,
      ).pipe(Effect.exit);
      if (Exit.isFailure(traced)) {
        traces[storyId] = {
          status: 'invalid',
          message: describeFailure(Cause.squash(traced.cause)),
          blocks: {},
          execution: [],
        };
      } else {
        traces[storyId] = traced.value;
      }
    }
    return {
      catalog,
      traces,
      ...(project === undefined ? {} : { project }),
    };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof StoryDiscoveryError
        ? cause
        : new StoryDiscoveryError({
            message: 'Story tracing failed',
            issues: [{ message: describeFailure(cause) }],
          }),
    ),
  );
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

function runStoriesGeneration(
  baseDir: string,
  filters: readonly string[],
  options: StoryRunOptions | undefined,
): Effect.Effect<StoriesRunResult, unknown> {
  return Effect.gen(function* () {
    const discovery = yield* discoverStoryDeclarations(baseDir);
    const catalogStories = discovery.catalog.modules.flatMap(
      ({ stories }) => stories,
    );
    const configuredStoryIds = new Set(
      catalogStories.map(({ storyPath }) => storyPath),
    );
    const byModule = new Map(
      discovery.modulePaths.map((modulePath) => [modulePath, [] as string[]]),
    );
    for (const module of discovery.catalog.modules) {
      byModule.set(
        module.modulePath,
        module.stories.map(({ storyPath }) => storyPath),
      );
    }
    const files = yield* attempt(() => {
      const selected =
        filters.length > 0
          ? [
              ...new Set(
                filters.flatMap((selector) => {
                  if (configuredStoryIds.has(selector)) return [selector];
                  const moduleStories = byModule.get(selector);
                  if (moduleStories !== undefined) return moduleStories;
                  throw new Error(`Unknown Story selector: ${selector}`);
                }),
              ),
            ].sort()
          : catalogStories.map(({ storyPath }) => storyPath);
      for (const storyId of selected) {
        validateStoryFile(storyId);
        if (!configuredStoryIds.has(storyId)) {
          throw new Error(`Story file is not configured: ${storyId}`);
        }
        if (!existsSync(resolve(baseDir, `${storyId}.story.ts`))) {
          throw new Error(`Story file not found: ${storyId}.story.ts`);
        }
      }
      return selected;
    });

    const declarations: Array<{
      readonly storyId: string;
      readonly declaration: StoryDeclaration;
    }> = [];
    for (const storyId of files) {
      const collected = yield* fromPromise(() =>
        collectDeclaredStories(() => loadStoryModule(baseDir, storyId)),
      );
      if (collected.length !== 1) {
        return yield* Effect.fail(
          new Error(`Story file "${storyId}" must declare exactly one Story`),
        );
      }
      declarations.push({ storyId, declaration: collected[0]! });
    }
    const traces = new Map<
      string,
      Extract<StoryTraceResult, { readonly status: 'valid' }>
    >();
    for (const { storyId, declaration } of declarations) {
      const trace = yield* traceDeclaredStory(
        baseDir,
        declaration,
        discovery.modulePaths,
      );
      if (trace.status === 'invalid') {
        return yield* Effect.fail(
          new Error(
            `Story "${storyId}" has an invalid trace: ${trace.message}`,
          ),
        );
      }
      traces.set(storyId, trace);
    }

    const failures: StoryFailure[] = [];
    const stories: Record<string, StoryRun> = {};
    for (const { storyId, declaration } of declarations) {
      const run = yield* runDeclaredStory(
        baseDir,
        storyId,
        declaration,
        traces.get(storyId)!,
        options,
        failures,
        discovery.modulePaths,
      );
      stories[storyId] = run;
    }

    return {
      status: failures.length === 0 ? 'passed' : 'failed',
      runs: { stories },
      failures,
    };
  });
}

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
  const total = Object.keys(blocks).length;
  return {
    visited: visited.size,
    total,
    percentage:
      total === 0 ? 0 : Math.round((visited.size / total) * 1000) / 10,
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
    environment,
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
  readonly project?: import('../core/project-narrative.js').ProjectNarrative;
  readonly modulePaths: readonly string[];
}

function discoverStoryDeclarations(
  baseDir: string,
): Effect.Effect<StoryDiscovery, StoryDiscoveryError> {
  return loadConfig(baseDir).pipe(
    Effect.flatMap((config) =>
      Effect.tryPromise({
        try: () => buildStoryDiscovery(baseDir, config),
        catch: (cause) =>
          cause instanceof StoryDiscoveryError
            ? cause
            : discoveryError([{ message: errorMessage(cause) }]),
      }),
    ),
    Effect.mapError((cause) =>
      cause instanceof StoryDiscoveryError
        ? cause
        : discoveryError([{ message: errorMessage(cause) }]),
    ),
  );
}

async function buildStoryDiscovery(
  baseDir: string,
  config: LaymosConfig,
): Promise<StoryDiscovery> {
  const surfaces = await findStorySurfaces(baseDir, config.modules ?? []);
  const { stories, issues } = await discoverStoryFiles(baseDir, surfaces);
  const declarations: Array<{
    readonly storyId: string;
    readonly storyKey: string;
    readonly surface: StorySurface;
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
  if (issues.length > 0) throw discoveryError(issues);
  return {
    catalog,
    declarations,
    modulePaths: (config.modules ?? []).map(({ path }) => path),
    ...(config.project === undefined
      ? {}
      : { project: serializeProjectNarrative(config.project) }),
  };
}

async function discoverStoryFiles(
  baseDir: string,
  surfaces: readonly StorySurface[],
): Promise<{
  readonly stories: {
    readonly storyId: string;
    readonly storyKey: string;
    readonly surface: StorySurface;
  }[];
  readonly issues: StoryDiscoveryIssue[];
}> {
  const stories: {
    readonly storyId: string;
    readonly storyKey: string;
    readonly surface: StorySurface;
  }[] = [];
  const issues: StoryDiscoveryIssue[] = [];
  for (const surface of surfaces) {
    const directory = resolve(baseDir, surface.path);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        issues.push({
          message: `Module "${surface.modulePath}" Story surface contains nested path "${surface.path}/${entry.name}"`,
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
    readonly surface: StorySurface;
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

function attempt<A>(body: () => A): Effect.Effect<A, unknown> {
  return Effect.try({ try: body, catch: (cause) => cause });
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
