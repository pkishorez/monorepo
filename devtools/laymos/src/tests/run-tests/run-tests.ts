import { readdir } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

import { Cause, Data, Duration, Effect, Exit, Option } from 'effect';
import { createJiti } from 'jiti';

import { loadConfig } from '../../config/load-config/index.js';
import type {
  TestCatalog,
  TestCatalogModule,
  TestCatalogTest,
  TestExpectation,
  TestReport,
  TestsReport,
  TestValue,
} from '../../report/tests.js';
import { findLaymosSurfaces } from '../../stories/discover-stories/laymos-surface.js';
import type { LaymosSurface } from '../../stories/discover-stories/laymos-surface.js';
import {
  collectDeclaredTests,
  type TestDeclaration,
} from '../authoring/index.js';

export interface TestsRunOptions {
  readonly timeout?: Duration.Input;
}

export interface TestDiscoveryIssue {
  readonly testPath?: string;
  readonly message: string;
}

export class TestDiscoveryError extends Data.TaggedError('TestDiscoveryError')<{
  readonly message: string;
  readonly issues: readonly TestDiscoveryIssue[];
}> {}

export class TestRunnerError extends Data.TaggedError('TestRunnerError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

interface DiscoveredTest {
  readonly testPath: string;
  readonly testKey: string;
  readonly surface: LaymosSurface;
  readonly declaration: TestDeclaration;
}

class TestTimeoutError extends Error {
  override name = 'TestTimeoutError';
}

const testFilePattern = /\.test\.ts$/;
const validTestFile = /^[a-z0-9]+(?:-[a-z0-9]+)*\.test\.ts$/;
const testAuthoringPath = resolve(import.meta.dirname, '../authoring/index.js');

export function discoverTests(
  projectDir: string,
): Effect.Effect<TestCatalog, TestDiscoveryError> {
  return discoverTestDeclarationsEffect(projectDir).pipe(
    Effect.map(({ catalog }) => catalog),
  );
}

export function executeTests(
  projectDir: string,
  selectors: readonly string[],
  options: TestsRunOptions = {},
): Effect.Effect<TestsReport, TestRunnerError> {
  return discoverTestDeclarationsEffect(projectDir).pipe(
    Effect.mapError(
      (cause) => new TestRunnerError({ message: cause.message, cause }),
    ),
    Effect.flatMap(({ declarations }) =>
      Effect.tryPromise({
        try: async () => {
          const selected = selectTests(declarations, selectors);
          const tests: Record<string, TestReport> = {};
          for (const test of selected) {
            const cases = [];
            for (const testCase of test.declaration.cases) {
              const actual = await executeCase(
                test.declaration,
                testCase.inputs,
                options.timeout,
              );
              cases.push({
                kind: testCase.kind,
                name: testCase.name,
                description: testCase.description,
                inputs: testCase.inputs,
                expected: testCase.expected,
                actual,
              });
            }
            tests[test.testPath] = {
              testPath: test.testPath,
              testKey: test.testKey,
              modulePath: test.surface.modulePath,
              name: test.declaration.name,
              description: test.declaration.description,
              cases,
            };
          }
          return { tests };
        },
        catch: (cause) =>
          cause instanceof TestRunnerError
            ? cause
            : new TestRunnerError({
                message: errorMessage(cause),
                cause,
              }),
      }),
    ),
  );
}

function discoverTestDeclarationsEffect(projectDir: string): Effect.Effect<
  {
    readonly catalog: TestCatalog;
    readonly declarations: readonly DiscoveredTest[];
  },
  TestDiscoveryError
> {
  return Effect.tryPromise({
    try: () => discoverTestDeclarations(projectDir),
    catch: (cause) =>
      cause instanceof TestDiscoveryError
        ? cause
        : discoveryError([{ message: errorMessage(cause) }]),
  });
}

async function executeCase(
  declaration: TestDeclaration,
  inputs: readonly TestValue[],
  timeout: Duration.Input | undefined,
): Promise<TestExpectation> {
  try {
    const result = declaration.execute(...inputs);
    if (Effect.isEffect(result)) {
      const operation =
        timeout === undefined
          ? (result as Effect.Effect<unknown, unknown, never>)
          : (result.pipe(Effect.timeout(timeout)) as Effect.Effect<
              unknown,
              unknown,
              never
            >);
      const exit = await Effect.runPromiseExit(operation);
      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
        return {
          kind: 'error',
          name:
            Option.isSome(failure) && Cause.isTimeoutError(failure.value)
              ? 'TestTimeoutError'
              : errorName(
                  Option.isSome(failure)
                    ? failure.value
                    : Cause.squash(exit.cause),
                ),
        };
      }
      return isTestValue(exit.value)
        ? { kind: 'value', value: exit.value }
        : { kind: 'error', name: 'UnsupportedTestValue' };
    }
    const value = await withTimeout(Promise.resolve(result), timeout);
    return isTestValue(value)
      ? { kind: 'value', value }
      : { kind: 'error', name: 'UnsupportedTestValue' };
  } catch (cause) {
    return { kind: 'error', name: errorName(cause) };
  }
}

async function withTimeout<A>(
  promise: Promise<A>,
  timeout: Duration.Input | undefined,
): Promise<A> {
  if (timeout === undefined) return promise;
  const milliseconds = Duration.toMillis(timeout);
  return new Promise<A>((resolvePromise, reject) => {
    const timer = setTimeout(
      () => reject(new TestTimeoutError()),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function selectTests(
  declarations: readonly DiscoveredTest[],
  selectors: readonly string[],
): readonly DiscoveredTest[] {
  if (selectors.length === 0) return declarations;
  const selected = declarations.filter((test) =>
    selectors.some(
      (selector) =>
        selector === test.testPath || selector === test.surface.modulePath,
    ),
  );
  for (const selector of selectors) {
    if (
      !declarations.some(
        (test) =>
          selector === test.testPath || selector === test.surface.modulePath,
      )
    ) {
      throw new TestRunnerError({
        message: `Test or Module "${selector}" was not found`,
        cause: selector,
      });
    }
  }
  return selected;
}

async function discoverTestDeclarations(projectDir: string): Promise<{
  readonly catalog: TestCatalog;
  readonly declarations: readonly DiscoveredTest[];
}> {
  try {
    const config = await Effect.runPromise(loadConfig({ projectDir }));
    const surfaces = await findLaymosSurfaces(projectDir, config.modules ?? []);
    const issues: TestDiscoveryIssue[] = [];
    const declarations: DiscoveredTest[] = [];
    for (const surface of surfaces) {
      const entries = await readdir(resolve(projectDir, surface.path), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (!entry.isFile() || !testFilePattern.test(entry.name)) continue;
        const testPath = relative(
          projectDir,
          join(projectDir, surface.path, entry.name),
        )
          .split(sep)
          .join('/')
          .slice(0, -'.test.ts'.length);
        if (!validTestFile.test(basename(entry.name))) {
          issues.push({
            testPath,
            message: `must use the kebab-case <test-name>.test.ts convention`,
          });
          continue;
        }
        try {
          const found = await collectDeclaredTests(() =>
            loadTestModule(projectDir, testPath),
          );
          if (found.length !== 1) {
            issues.push({
              testPath,
              message: `must declare exactly one Test; found ${found.length}`,
            });
            continue;
          }
          declarations.push({
            testPath,
            testKey: entry.name.slice(0, -'.test.ts'.length),
            surface,
            declaration: found[0]!,
          });
        } catch (cause) {
          issues.push({ testPath, message: errorMessage(cause) });
        }
      }
    }
    if (issues.length > 0) throw discoveryError(issues);
    declarations.sort((left, right) =>
      left.testPath.localeCompare(right.testPath),
    );
    return { catalog: buildCatalog(declarations), declarations };
  } catch (cause) {
    throw cause instanceof TestDiscoveryError
      ? cause
      : discoveryError([{ message: errorMessage(cause) }]);
  }
}

async function loadTestModule(
  projectDir: string,
  testPath: string,
): Promise<void> {
  const jiti = createJiti(import.meta.url, {
    alias: { 'laymos/test': testAuthoringPath },
    interopDefault: true,
    moduleCache: false,
  });
  await jiti.import(resolve(projectDir, `${testPath}.test.ts`));
}

function buildCatalog(declarations: readonly DiscoveredTest[]): TestCatalog {
  const byModule = new Map<string, TestCatalogTest[]>();
  const descriptions = new Map<string, string>();
  for (const test of declarations) {
    const tests = byModule.get(test.surface.modulePath) ?? [];
    byModule.set(test.surface.modulePath, tests);
    descriptions.set(test.surface.modulePath, test.surface.moduleDescription);
    tests.push({
      testPath: test.testPath,
      testKey: test.testKey,
      modulePath: test.surface.modulePath,
      name: test.declaration.name,
      description: test.declaration.description,
      cases: test.declaration.cases.map((testCase) => ({
        kind: testCase.kind,
        name: testCase.name,
        description: testCase.description,
        inputs: testCase.inputs,
        expected: testCase.expected,
      })),
    });
  }
  const modules: TestCatalogModule[] = [...byModule]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modulePath, tests]) => ({
      modulePath,
      description: descriptions.get(modulePath)!,
      tests: tests.sort((left, right) =>
        left.testPath.localeCompare(right.testPath),
      ) as [TestCatalogTest, ...TestCatalogTest[]],
    }));
  return { modules };
}

function discoveryError(
  issues: readonly TestDiscoveryIssue[],
): TestDiscoveryError {
  return new TestDiscoveryError({
    message: `Test catalog is invalid:\n${issues
      .map(({ testPath, message }) =>
        testPath === undefined ? `- ${message}` : `- ${testPath}: ${message}`,
      )
      .join('\n')}`,
    issues,
  });
}

function isTestValue(value: unknown): value is TestValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function errorName(cause: unknown): string {
  if (
    typeof cause === 'object' &&
    cause !== null &&
    '_tag' in cause &&
    typeof cause._tag === 'string'
  ) {
    return cause._tag;
  }
  if (cause instanceof Error) return cause.name || 'Error';
  return 'UnknownError';
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
