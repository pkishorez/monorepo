import { createRequire } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { Data, Effect, Option, Schema } from 'effect';
import type {
  TestCase,
  TestModule,
  TestRunResult,
  TestSuite,
  Vitest,
  createVitest,
} from 'vitest/node';

import {
  LaymosTestEvidenceSchema,
  type TestCaseReport,
  type TestErrorReport,
  type TestModuleReport,
  type TestStatus,
  type TestSuiteReport,
  type TestsReport,
} from '../../report/tests.js';

export interface TestsRunOptions {
  readonly files?: readonly string[];
  readonly testNamePattern?: string | RegExp;
}

export class TestRunInProgress extends Data.TaggedError('TestRunInProgress')<{
  readonly projectDir: string;
  readonly message: string;
}> {}

export class TestRunnerError extends Data.TaggedError('TestRunnerError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const activeProjects = new Set<string>();
let activeRunCount = 0;
let originalExitCode: number | string | null | undefined;
const minimumVitestVersion = [4, 1, 10] as const;
const silentOutput = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});
const PackageMetadataSchema = Schema.Struct({ version: Schema.String });
const ErrorInputSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  message: Schema.String,
  stack: Schema.optional(Schema.String),
  expected: Schema.optional(Schema.String),
  actual: Schema.optional(Schema.String),
  diff: Schema.optional(Schema.String),
});
const LaymosTestArtifactSchema = Schema.Struct({
  type: Schema.Literal('laymos:test-evidence'),
  evidence: LaymosTestEvidenceSchema,
});
const LaymosTaskMetaSchema = Schema.Struct({
  laymosTest: Schema.Struct({
    description: Schema.String,
    documentation: Schema.optional(Schema.String),
  }),
});
const LaymosSuiteMetaSchema = Schema.Struct({
  laymosSuite: Schema.Struct({
    description: Schema.String,
    documentation: Schema.optional(Schema.String),
  }),
});

export function executeTests(
  projectDir: string,
  options: TestsRunOptions = {},
): Effect.Effect<TestsReport, TestRunInProgress | TestRunnerError> {
  const root = resolve(projectDir);
  return Effect.tryPromise({
    try: async () => {
      if (activeProjects.has(root)) {
        throw new TestRunInProgress({
          projectDir: root,
          message: `A Vitest run is already active for "${root}"`,
        });
      }
      activeProjects.add(root);
      enterVitestRun();
      try {
        return await runVitest(root, options);
      } finally {
        activeProjects.delete(root);
        leaveVitestRun();
      }
    },
    catch: (cause) =>
      cause instanceof TestRunInProgress || cause instanceof TestRunnerError
        ? cause
        : new TestRunnerError({ message: errorMessage(cause), cause }),
  });
}

async function runVitest(
  projectDir: string,
  options: TestsRunOptions,
): Promise<TestsReport> {
  const vitestNode = await loadProjectVitest(projectDir);
  const startedAt = performance.now();
  let vitest: Vitest | undefined;

  try {
    vitest = await vitestNode.createVitest(
      'test',
      {
        root: projectDir,
        watch: false,
        changed: false,
        passWithNoTests: true,
        includeTaskLocation: true,
        ...(options.testNamePattern === undefined
          ? {}
          : { testNamePattern: options.testNamePattern }),
      },
      {},
      { stdout: silentOutput, stderr: silentOutput },
    );
    delete vitest.config.related;
    const result = await vitest.start(options.files ? [...options.files] : []);
    return mapRunResult(projectDir, result, performance.now() - startedAt);
  } finally {
    await vitest?.close();
  }
}

function enterVitestRun(): void {
  if (activeRunCount === 0) originalExitCode = process.exitCode;
  activeRunCount += 1;
}

function leaveVitestRun(): void {
  activeRunCount -= 1;
  if (activeRunCount === 0) process.exitCode = originalExitCode;
}

async function loadProjectVitest(projectDir: string): Promise<{
  readonly createVitest: typeof createVitest;
}> {
  const require = createRequire(resolve(projectDir, 'package.json'));
  let entrypoint: string;
  let packageJson: string;
  try {
    entrypoint = require.resolve('vitest/node');
    packageJson = require.resolve('vitest/package.json');
  } catch (cause) {
    throw new TestRunnerError({
      message: `Vitest is not installed in "${projectDir}"`,
      cause,
    });
  }

  const metadata = Schema.decodeUnknownOption(PackageMetadataSchema)(
    require(packageJson),
  );
  if (
    Option.isNone(metadata) ||
    !isSupportedVitestVersion(metadata.value.version)
  ) {
    throw new TestRunnerError({
      message: `Laymos requires Vitest >=4.1.10 <5`,
      cause: Option.getOrUndefined(metadata)?.version,
    });
  }

  return import(pathToFileURL(entrypoint).href) as Promise<{
    readonly createVitest: typeof createVitest;
  }>;
}

function isSupportedVitestVersion(version: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version
    .split('.', 3)
    .map((part) => Number.parseInt(part, 10));
  if (major !== 4) return false;
  const [requiredMajor, requiredMinor, requiredPatch] = minimumVitestVersion;
  return (
    major > requiredMajor ||
    (major === requiredMajor &&
      (minor > requiredMinor ||
        (minor === requiredMinor && patch >= requiredPatch)))
  );
}

function mapRunResult(
  projectDir: string,
  result: TestRunResult,
  duration: number,
): TestsReport {
  const modules = result.testModules.map((module) =>
    mapModule(projectDir, module),
  );
  const unhandledErrors = result.unhandledErrors.map(mapError);
  return {
    status:
      unhandledErrors.length === 0 &&
      modules.every(({ status }) => status !== 'failed')
        ? 'passed'
        : 'failed',
    duration,
    modules,
    unhandledErrors,
  };
}

function mapModule(projectDir: string, module: TestModule): TestModuleReport {
  const children = module.children.array();
  const diagnostic = module.diagnostic();
  return {
    id: module.id,
    name: module.relativeModuleId,
    path: normalizePath(relative(projectDir, module.moduleId)),
    projectName: module.project.name,
    status: normalizeStatus(module.state()),
    duration:
      diagnostic.environmentSetupDuration +
      diagnostic.prepareDuration +
      diagnostic.collectDuration +
      diagnostic.setupDuration +
      diagnostic.duration,
    suites: children
      .filter((child): child is TestSuite => child.type === 'suite')
      .map(mapSuite),
    cases: children
      .filter((child): child is TestCase => child.type === 'test')
      .map(mapCase),
    errors: module.errors().map(mapError),
  };
}

function mapSuite(suite: TestSuite): TestSuiteReport {
  const children = suite.children.array();
  const suites = children
    .filter((child): child is TestSuite => child.type === 'suite')
    .map(mapSuite);
  const cases = children
    .filter((child): child is TestCase => child.type === 'test')
    .map(mapCase);
  return {
    id: suite.id,
    name: suite.name,
    ...suiteMetadata(suite),
    status: normalizeStatus(suite.state()),
    suites,
    cases,
    errors: suite.errors().map(mapError),
  };
}

function suiteMetadata(suite: TestSuite): {
  readonly description?: string;
  readonly documentation?: string;
} {
  const metadata = Schema.decodeUnknownOption(LaymosSuiteMetaSchema)(
    suite.meta(),
  );
  if (Option.isNone(metadata)) return {};
  return {
    description: metadata.value.laymosSuite.description,
    ...(metadata.value.laymosSuite.documentation === undefined
      ? {}
      : { documentation: metadata.value.laymosSuite.documentation }),
  };
}

function mapCase(testCase: TestCase): TestCaseReport {
  const result = testCase.result();
  const diagnostic = testCase.diagnostic();
  const metadata = Schema.decodeUnknownOption(LaymosTaskMetaSchema)(
    testCase.meta(),
  );
  const evidence = evidenceProperty(testCase.artifacts(), metadata);
  const authored = Option.isSome(metadata) || evidence.evidence !== undefined;
  const assertionFailed =
    evidence.evidence?.assertions.some(({ status }) => status === 'failed') ??
    false;
  const errors = (result.errors ?? [])
    .map(mapError)
    .filter(
      ({ name }) => !assertionFailed || name !== 'LaymosAssertionFailures',
    );
  return {
    id: testCase.id,
    name: testCase.name,
    fullName: testCase.fullName,
    status: normalizeStatus(result.state),
    duration: diagnostic?.duration ?? 0,
    errors,
    ...(testCase.location === undefined
      ? {}
      : {
          location: {
            line: testCase.location.line,
            column: testCase.location.column,
          },
        }),
    ...(authored ? { authoredBy: 'laymos' as const } : {}),
    ...evidence,
  };
}

function evidenceProperty(
  artifacts: ReadonlyArray<{ readonly type: string }>,
  metadata: Option.Option<{
    readonly laymosTest: {
      readonly description: string;
      readonly documentation?: string | undefined;
    };
  }>,
): { readonly evidence?: import('../../report/tests.js').LaymosTestEvidence } {
  const artifact = artifacts
    .map((artifact) =>
      Schema.decodeUnknownOption(LaymosTestArtifactSchema)(artifact),
    )
    .reverse()
    .find(Option.isSome);
  if (artifact !== undefined) {
    return { evidence: artifact.value.evidence };
  }
  if (Option.isSome(metadata)) {
    return {
      evidence: {
        description: metadata.value.laymosTest.description,
        ...(metadata.value.laymosTest.documentation === undefined
          ? {}
          : { documentation: metadata.value.laymosTest.documentation }),
        assertions: [],
      },
    };
  }
  return {};
}

function normalizeStatus(status: TestStatus | 'queued'): TestStatus {
  return status === 'queued' ? 'pending' : status;
}

export function mapError(error: unknown): TestErrorReport {
  const decoded = Schema.decodeUnknownOption(ErrorInputSchema)(error);
  if (Option.isSome(decoded)) {
    return {
      name: decoded.value.name ?? 'Error',
      message: decoded.value.message,
      ...(decoded.value.stack === undefined
        ? {}
        : { stack: decoded.value.stack }),
      ...(decoded.value.expected === undefined
        ? {}
        : { expected: decoded.value.expected }),
      ...(decoded.value.actual === undefined
        ? {}
        : { actual: decoded.value.actual }),
      ...(decoded.value.diff === undefined ? {} : { diff: decoded.value.diff }),
    };
  }
  return { name: 'Error', message: String(error) };
}

function normalizePath(path: string): string {
  return path.split(sep).join('/');
}

function errorMessage(cause: unknown): string {
  const decoded = Schema.decodeUnknownOption(ErrorInputSchema)(cause);
  return Option.isSome(decoded) ? decoded.value.message : String(cause);
}
