import type { Effect } from 'effect';

export type TestValue = string | number | boolean;
export type TestCaseKind = 'positive' | 'negative';

export interface ExpectedError {
  readonly kind: 'error';
  readonly name: string;
}

export type TestExpectation<Value extends TestValue = TestValue> =
  | { readonly kind: 'value'; readonly value: Value }
  | ExpectedError;

export interface TestCase<
  Inputs extends readonly TestValue[] = readonly TestValue[],
  Output extends TestValue = TestValue,
> {
  readonly kind: TestCaseKind;
  readonly name: string;
  readonly description: string;
  readonly inputs: Inputs;
  readonly expected: Output | ExpectedError;
}

export interface DeclaredTestCase {
  readonly kind: TestCaseKind;
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly TestValue[];
  readonly expected: TestExpectation;
}

export interface TestDeclaration {
  readonly name: string;
  readonly description: string;
  readonly execute: (...inputs: readonly TestValue[]) => unknown;
  readonly cases: readonly DeclaredTestCase[];
}

export interface TestOptions {
  readonly description: string;
}

type TestCollector = (declaration: TestDeclaration) => void;
const collectorKey = Symbol.for('laymos/test-collector');
type CollectorHost = typeof globalThis & { [collectorKey]?: TestCollector };
const collectorHost = globalThis as CollectorHost;

export interface TestExecution<
  Inputs extends readonly TestValue[],
  Output extends TestValue,
> {
  cases(cases: readonly TestCase<Inputs, Output>[]): void;
}

export interface TestBuilder {
  execute<Inputs extends readonly TestValue[], Output extends TestValue, Error>(
    execute: (
      ...inputs: Inputs
    ) => Output | PromiseLike<Output> | Effect.Effect<Output, Error, never>,
  ): TestExecution<Inputs, Output>;
}

/** Declares one Laymos Test. */
export function test(name: string, options: TestOptions): TestBuilder {
  requireName(name, 'Test');
  requireName(options.description, 'Test description');
  return {
    execute(execute) {
      return {
        cases(cases) {
          const normalized = cases.map((testCase) => {
            requireName(testCase.name, 'Test Case');
            requireName(testCase.description, 'Test Case description');
            for (const value of testCase.inputs) requireTestValue(value);
            const expected =
              typeof testCase.expected === 'object'
                ? testCase.expected
                : ({ kind: 'value', value: testCase.expected } as const);
            if (expected.kind === 'error') {
              requireName(expected.name, 'Expected error');
            } else {
              requireTestValue(expected.value);
            }
            return { ...testCase, expected };
          });
          collectorHost[collectorKey]?.({
            name,
            description: options.description,
            execute: execute as (...inputs: readonly TestValue[]) => unknown,
            cases: normalized as readonly DeclaredTestCase[],
          });
        },
      };
    },
  };
}

/** Declares a named error expectation. */
export function error(name: string): ExpectedError {
  requireName(name, 'Expected error');
  return { kind: 'error', name };
}

export async function collectDeclaredTests(
  load: () => Promise<unknown>,
): Promise<TestDeclaration[]> {
  if (collectorHost[collectorKey] !== undefined) {
    throw new Error('Test modules must be loaded sequentially');
  }
  const declarations: TestDeclaration[] = [];
  collectorHost[collectorKey] = (declaration) => declarations.push(declaration);
  try {
    await load();
    return declarations;
  } finally {
    delete collectorHost[collectorKey];
  }
}

function requireName(name: string, subject: string): void {
  if (name.trim().length === 0) {
    throw new TypeError(`${subject} name must not be empty`);
  }
}

function requireTestValue(value: unknown): asserts value is TestValue {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new TypeError('Test Values must be strings, numbers, or booleans');
  }
}
