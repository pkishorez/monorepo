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
  ScenarioRecorder,
  StoryBlockRegistry,
  roundMillis,
} from '../artifact/index.js';
import type {
  StoryArtifact,
  StoryScenario,
  StoryScenarioFailure,
  StoryScenarioFailurePhase,
} from '../artifact/types.js';
import { collectDeclaredStories } from '../core/declare.js';
import type { ScenarioDeclaration, StoryDeclaration } from '../core/declare.js';
import { CurrentRecorder } from '../core/recorder.js';

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
  readonly report: {
    readonly stories: Readonly<Record<string, StoryArtifact>>;
  };
  readonly failures: readonly StoryFailure[];
}

export class StoryRunnerError extends Data.TaggedError('StoryRunnerError')<{
  readonly operation: 'discover' | 'execute';
  readonly message: string;
  readonly cause: unknown;
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

function runStoriesGeneration(
  baseDir: string,
  filters: readonly string[],
  options: StoryRunOptions | undefined,
): Effect.Effect<StoriesRunResult, unknown> {
  return Effect.gen(function* () {
    const files =
      filters.length > 0
        ? [...filters].sort()
        : yield* discoverStoryIds(baseDir);
    yield* attempt(() => {
      for (const storyId of files) {
        validateStoryFile(storyId);
        if (!existsSync(resolve(baseDir, storyId))) {
          throw new Error(`Story file not found: ${storyId}`);
        }
      }
    });

    const failures: StoryFailure[] = [];
    const stories: Record<string, StoryArtifact> = {};
    for (const storyId of files) {
      const declarations = yield* fromPromise(() =>
        collectDeclaredStories(() => loadStoryModule(baseDir, storyId)),
      );
      if (declarations.length !== 1) {
        return yield* Effect.fail(
          new Error(`Story file "${storyId}" must declare exactly one Story`),
        );
      }
      stories[storyId] = yield* runDeclaredStory(
        baseDir,
        storyId,
        declarations[0]!,
        options,
        failures,
      );
    }

    return {
      status: failures.length === 0 ? 'passed' : 'failed',
      report: { stories },
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
): Effect.Effect<StoryArtifact, unknown> {
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
        schemaVersion: 3,
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

export function discoverStoryIds(
  baseDir: string,
): Effect.Effect<string[], StoryRunnerError> {
  return Effect.tryPromise({
    try: async () => {
      const files: string[] = [];
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
          const id = relative(baseDir, join(directory, entry.name))
            .split(sep)
            .join('/');
          files.push(id);
        }
      }
      files.sort();
      for (const storyId of files) validateStoryFile(storyId);
      return files;
    },
    catch: (cause) => storyRunnerError('discover', cause),
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
