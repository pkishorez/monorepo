import type {
  TestCaseKind,
  TestExpectation,
  TestValue,
} from '../tests/authoring/index.js';

export type TestPath = string;

export interface TestCatalogCase {
  readonly kind: TestCaseKind;
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly TestValue[];
  readonly expected: TestExpectation;
}

export interface TestCatalogTest {
  readonly testPath: TestPath;
  readonly testKey: string;
  readonly modulePath: string;
  readonly name: string;
  readonly description: string;
  readonly cases: readonly TestCatalogCase[];
}

export interface TestCatalogModule {
  readonly modulePath: string;
  readonly description: string;
  readonly tests: readonly [TestCatalogTest, ...TestCatalogTest[]];
}

export interface TestCatalog {
  readonly modules: readonly TestCatalogModule[];
}

export interface TestCaseReport extends TestCatalogCase {
  readonly actual: TestExpectation;
}

export interface TestReport {
  readonly testPath: TestPath;
  readonly testKey: string;
  readonly modulePath: string;
  readonly name: string;
  readonly description: string;
  readonly cases: readonly TestCaseReport[];
}

export interface TestsReport {
  readonly tests: Readonly<Record<TestPath, TestReport>>;
}

export type {
  ExpectedError,
  TestCaseKind,
  TestExpectation,
  TestValue,
} from '../tests/authoring/index.js';
