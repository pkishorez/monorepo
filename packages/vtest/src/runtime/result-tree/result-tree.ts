import type { SuiteNode, TestNode, TestStatus } from '../../analysis/index.js';

/**
 * The minimal shape of a Vitest reported test case this module reads. Kept
 * structural so the runtime never depends on Vitest's class identities.
 */
export interface ReportedTest {
  readonly type: 'test';
  readonly name: string;
  meta(): Record<string, unknown>;
  result(): {
    readonly state: string;
    readonly errors?: ReadonlyArray<unknown>;
  };
  diagnostic(): { readonly duration: number } | undefined;
}

/** The minimal shape of a Vitest reported suite this module reads. */
export interface ReportedSuite {
  readonly type: 'suite';
  readonly name: string;
  readonly children: Iterable<ReportedTest | ReportedSuite>;
  meta(): Record<string, unknown>;
}

/** The minimal shape of a Vitest reported test module this module reads. */
export interface ReportedModule {
  readonly type: 'module';
  readonly children: Iterable<ReportedTest | ReportedSuite>;
}

const VDOC_KEY = 'vdoc';

const vdocOf = (meta: Record<string, unknown>): string | null => {
  const value = meta[VDOC_KEY];
  return typeof value === 'string' ? value : null;
};

const mapStatus = (state: string): TestStatus => {
  switch (state) {
    case 'passed':
      return 'pass';
    case 'failed':
      return 'fail';
    case 'skipped':
      return 'skip';
    default:
      return 'pending';
  }
};

const errorOf = (
  result: { readonly errors?: ReadonlyArray<unknown> } | undefined,
): string | undefined => {
  const first = result?.errors?.[0] as { message?: string } | undefined;
  return first?.message;
};

const testNode = (test: ReportedTest): TestNode => {
  const result = test.result();
  const status = mapStatus(result.state);
  const duration = test.diagnostic()?.duration;
  const error = status === 'fail' ? errorOf(result) : undefined;
  return {
    kind: 'test',
    name: test.name,
    vdoc: vdocOf(test.meta()),
    status,
    ...(duration !== undefined ? { durationMs: duration } : {}),
    ...(error !== undefined ? { error } : {}),
  };
};

const rollUp = (children: ReadonlyArray<SuiteNode | TestNode>): TestStatus => {
  if (children.some((c) => c.status === 'fail')) return 'fail';
  if (children.some((c) => c.status === 'running')) return 'running';
  if (children.some((c) => c.status === 'pending')) return 'pending';
  if (children.length > 0 && children.every((c) => c.status === 'skip')) {
    return 'skip';
  }
  return 'pass';
};

const childNodes = (
  entries: Iterable<ReportedTest | ReportedSuite>,
): ReadonlyArray<SuiteNode | TestNode> => {
  const out: Array<SuiteNode | TestNode> = [];
  for (const entry of entries) {
    out.push(entry.type === 'suite' ? suiteNode(entry) : testNode(entry));
  }
  return out;
};

const suiteNode = (suite: ReportedSuite): SuiteNode => {
  const children = childNodes(suite.children);
  return {
    kind: 'suite',
    name: suite.name,
    vdoc: vdocOf(suite.meta()),
    status: rollUp(children),
    children,
  };
};

/**
 * Fold Vitest reported test modules into a documented-suite result tree: a
 * synthetic root {@link SuiteNode} whose children are the per-module suites and
 * tests, each leaf carrying its `meta.vdoc`, status, duration, and error.
 */
export const toResultTree = (
  name: string,
  modules: ReadonlyArray<ReportedModule>,
): SuiteNode => {
  const children: Array<SuiteNode | TestNode> = [];
  for (const module of modules) {
    children.push(...childNodes(module.children));
  }
  return {
    kind: 'suite',
    name,
    vdoc: null,
    status: rollUp(children),
    children,
  };
};
