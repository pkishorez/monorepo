import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
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

import {
  CurrentTrace,
  ScenarioRecorder,
  StoryBlockRegistry,
  TraceRecorder,
  roundMillis,
  traceValue,
} from '../artifact/index.js';
import type {
  StoryRun,
  StoryScenario,
  StoryScenarioFailure,
  StoryScenarioFailurePhase,
  StoryTraceResult,
} from '../artifact/types.js';
import { collectDeclaredStories } from '../core/declare.js';
import type {
  ScenarioDeclaration,
  StoryDeclaration,
  StoryGroupDeclaration,
} from '../core/declare.js';
import { CurrentRecorder } from '../core/recorder.js';
import type {
  StoryCatalog,
  StoryCatalogGroup,
  StoryCatalogStory,
  StoryCollection,
} from '../../report/stories.js';

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

const storyFilePattern = /\.story\.[cm]?[jt]sx?$/;
const validStoryFile = /^[a-z0-9]+(?:-[a-z0-9]+)*\.story\.(?:[cm]?[jt]sx?)$/;
const skippedSegments = new Set(['node_modules', 'dist']);
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
    const { catalog, declarations } = yield* discoverStoryDeclarations(baseDir);
    const traces: Record<string, StoryTraceResult> = {};
    for (const { storyId, declaration } of declarations) {
      const traced = yield* traceDeclaredStory(baseDir, declaration).pipe(
        Effect.exit,
      );
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
    return { catalog, traces };
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
): Effect.Effect<StoryTraceResult> {
  if (declaration.execution === undefined) {
    return Effect.succeed({
      status: 'invalid',
      message: `Story "${declaration.name}" must declare one execution`,
      blocks: {},
      execution: [],
    });
  }
  const blocks = new StoryBlockRegistry(baseDir);
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
  );
}

function runStoriesGeneration(
  baseDir: string,
  filters: readonly string[],
  options: StoryRunOptions | undefined,
): Effect.Effect<StoriesRunResult, unknown> {
  return Effect.gen(function* () {
    const files =
      filters.length > 0
        ? [...filters].sort()
        : yield* discoverStories(baseDir).pipe(
            Effect.map(({ stories }) => stories.map(({ storyId }) => storyId)),
          );
    yield* attempt(() => {
      for (const storyId of files) {
        validateStoryFile(storyId);
        if (!existsSync(resolve(baseDir, storyId))) {
          throw new Error(`Story file not found: ${storyId}`);
        }
      }
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
    for (const { storyId, declaration } of declarations) {
      const trace = yield* traceDeclaredStory(baseDir, declaration);
      if (trace.status === 'invalid') {
        return yield* Effect.fail(
          new Error(
            `Story "${storyId}" has an invalid trace: ${trace.message}`,
          ),
        );
      }
    }

    const failures: StoryFailure[] = [];
    const stories: Record<string, StoryRun> = {};
    for (const { storyId, declaration } of declarations) {
      const run = yield* runDeclaredStory(
        baseDir,
        storyId,
        declaration,
        options,
        failures,
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
  options: StoryRunOptions | undefined,
  failures: StoryFailure[],
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
      const blocks = new StoryBlockRegistry(baseDir);
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
      return {
        schemaVersion: 4,
        generatedAt: Date.now(),
        name: declaration.name,
        description: declaration.description,
        blocks: blocks.toRecord(),
        scenarios,
      };
    }),
  );
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
    location: {
      file: storyId,
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
  const path = resolve(baseDir, storyId);
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
}

function discoverStoryDeclarations(
  baseDir: string,
): Effect.Effect<StoryDiscovery, StoryDiscoveryError> {
  return Effect.tryPromise({
    try: () => buildStoryDiscovery(baseDir),
    catch: (cause) =>
      cause instanceof StoryDiscoveryError
        ? cause
        : discoveryError([{ message: errorMessage(cause) }]),
  });
}

async function buildStoryDiscovery(baseDir: string): Promise<StoryDiscovery> {
  const { storyIds, issues } = await discoverStoryFileIds(baseDir);
  const declarations: Array<{
    readonly storyId: string;
    readonly declaration: StoryDeclaration;
  }> = [];

  for (const storyId of storyIds) {
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
      declarations.push({ storyId, declaration: found[0]! });
    } catch (cause) {
      issues.push({ storyId, message: errorMessage(cause) });
    }
  }

  const catalog = validateStoryCatalog(declarations, issues);
  if (issues.length > 0) throw discoveryError(issues);
  return { catalog, declarations };
}

async function discoverStoryFileIds(baseDir: string): Promise<{
  readonly storyIds: string[];
  readonly issues: StoryDiscoveryIssue[];
}> {
  const storyIds: string[] = [];
  const issues: StoryDiscoveryIssue[] = [];
  const directories = [baseDir];
  while (directories.length > 0) {
    const directory = directories.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skippedSegments.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        directories.push(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || !storyFilePattern.test(entry.name)) continue;
      const storyId = relative(baseDir, join(directory, entry.name))
        .split(sep)
        .join('/');
      storyIds.push(storyId);
      try {
        validateStoryFile(storyId);
      } catch (cause) {
        issues.push({ storyId, message: errorMessage(cause) });
      }
    }
  }
  storyIds.sort();
  return { storyIds, issues };
}

function validateStoryCatalog(
  declarations: readonly {
    readonly storyId: string;
    readonly declaration: StoryDeclaration;
  }[],
  issues: StoryDiscoveryIssue[],
): StoryCatalog {
  const groups = new Map<
    string,
    StoryCatalogGroup & { readonly storyId: string }
  >();
  const stories: StoryCatalogStory[] = [];
  const destinations = new Map<
    string,
    Map<string, { readonly kind: 'Group' | 'Story'; readonly storyId: string }>
  >();

  const registerDestination = (
    parentPath: readonly string[],
    name: string,
    kind: 'Group' | 'Story',
    storyId: string,
  ): void => {
    const siblings = destinations.get(pathKey(parentPath)) ?? new Map();
    destinations.set(pathKey(parentPath), siblings);
    const existing = siblings.get(name);
    if (existing === undefined) {
      siblings.set(name, { kind, storyId });
      return;
    }
    if (kind === 'Group' && existing.kind === 'Group') return;
    issues.push({
      storyId,
      message: `${kind} "${displayPath([...parentPath, name])}" conflicts with ${existing.kind} declared by "${existing.storyId}"`,
    });
  };

  for (const { storyId, declaration } of declarations) {
    const lineage = storyGroupLineage(declaration.group, storyId, issues);
    const groupPath: string[] = [];
    for (const group of lineage) {
      const parentPath = [...groupPath];
      groupPath.push(group.name);
      const key = pathKey(groupPath);
      const existing = groups.get(key);
      if (existing === undefined) {
        groups.set(key, {
          path: [...groupPath],
          name: group.name,
          description: group.description,
          storyId,
        });
      } else if (existing.description !== group.description) {
        issues.push({
          storyId,
          message: `Story Group "${displayPath(groupPath)}" conflicts with metadata declared by "${existing.storyId}"`,
        });
      }
      registerDestination(parentPath, group.name, 'Group', storyId);
    }
    registerDestination(groupPath, declaration.name, 'Story', storyId);
    stories.push({
      storyId,
      name: declaration.name,
      description: declaration.description,
      groupPath,
    });
  }

  return {
    groups: [...groups.values()]
      .map(({ storyId: _storyId, ...group }) => group)
      .sort((left, right) => comparePaths(left.path, right.path)),
    stories: stories.sort(
      (left, right) =>
        comparePaths(left.groupPath, right.groupPath) ||
        left.name.localeCompare(right.name) ||
        left.storyId.localeCompare(right.storyId),
    ),
  };
}

function storyGroupLineage(
  leaf: StoryGroupDeclaration | undefined,
  storyId: string,
  issues: StoryDiscoveryIssue[],
): StoryGroupDeclaration[] {
  const reversed: StoryGroupDeclaration[] = [];
  const seen = new Set<StoryGroupDeclaration>();
  let current = leaf;
  while (current !== undefined) {
    if (seen.has(current)) {
      issues.push({
        storyId,
        message: 'Story Group ancestry contains a cycle',
      });
      return [];
    }
    seen.add(current);
    reversed.push(current);
    current = current.parent;
  }
  return reversed.reverse();
}

const pathKey = (path: readonly string[]): string => JSON.stringify(path);
const displayPath = (path: readonly string[]): string => path.join(' / ');

function comparePaths(
  left: readonly string[],
  right: readonly string[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const compared = left[index]!.localeCompare(right[index]!);
    if (compared !== 0) return compared;
  }
  return left.length - right.length;
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
  if (!validStoryFile.test(basename(storyId))) {
    throw new Error(
      `Story file "${storyId}" must use the kebab-case <story-name>.story.ts convention`,
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
