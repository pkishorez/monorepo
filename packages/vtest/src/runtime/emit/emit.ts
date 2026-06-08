import type { TestEvent, TestStatus } from '../../analysis/index.js';
import type {
  ReportedModule,
  ReportedSuite,
  ReportedTest,
} from '../result-tree/index.js';

/**
 * A reported test module that also exposes the source file path it ran. Vitest
 * test modules carry this as `moduleId`; kept structural so the runtime never
 * depends on Vitest's class identities.
 */
export interface ReportedModuleWithId extends ReportedModule {
  readonly moduleId: string;
}

const FEATURE_RE =
  /vtest[/\\]features[/\\]([^/\\]+)[/\\]tests[/\\]([^/\\]+)[/\\]/;

/** Derive the documented `feature`/`groupId` identity from a test file path. */
export const identityFromModuleId = (
  moduleId: string,
): { feature: string; groupId: string } | undefined => {
  const match = FEATURE_RE.exec(moduleId);
  if (!match) return undefined;
  return { feature: match[1] as string, groupId: match[2] as string };
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

const flattenTests = (
  entries: Iterable<ReportedTest | ReportedSuite>,
): ReadonlyArray<ReportedTest> => {
  const out: Array<ReportedTest> = [];
  for (const entry of entries) {
    if (entry.type === 'suite') out.push(...flattenTests(entry.children));
    else out.push(entry);
  }
  return out;
};

/**
 * Fold reported test modules into ordered `test-updated` {@link TestEvent}s,
 * one per leaf test, each tagged with the `feature`/`groupId` derived from its
 * module path so a client can route it. Modules whose path does not match the
 * documented-suite layout are skipped.
 */
export const testUpdatesFor = (
  pkg: string,
  modules: ReadonlyArray<ReportedModuleWithId>,
): ReadonlyArray<TestEvent> => {
  const events: Array<TestEvent> = [];
  for (const mod of modules) {
    const identity = identityFromModuleId(mod.moduleId);
    if (!identity) continue;
    for (const test of flattenTests(mod.children)) {
      const result = test.result();
      const status = mapStatus(result.state);
      const duration = test.diagnostic()?.duration;
      const first = result.errors?.[0] as { message?: string } | undefined;
      const error = status === 'fail' ? first?.message : undefined;
      events.push({
        type: 'test-updated',
        pkg,
        feature: identity.feature,
        groupId: identity.groupId,
        name: test.name,
        status,
        ...(duration !== undefined ? { durationMs: duration } : {}),
        ...(error !== undefined ? { error } : {}),
      });
    }
  }
  return events;
};
