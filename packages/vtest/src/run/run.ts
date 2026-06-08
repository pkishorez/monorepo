import { Effect } from 'effect';
import type { TestStatus } from '../analysis/index.js';
import { makeManager } from '../runtime/manager/index.js';
import { RunError } from '../runtime/run/index.js';
import {
  testUpdatesFor,
  type ReportedModuleWithId,
} from '../runtime/emit/index.js';

export { RunError };

/**
 * A single test's outcome from a one-shot package run, keyed by its documented
 * identity (`feature`/`groupId`/`name`). `error` is present (and non-empty)
 * only when `status` is `'fail'`.
 */
export interface TestRunRecord {
  readonly feature: string;
  readonly groupId: string;
  readonly name: string;
  readonly status: TestStatus;
  readonly durationMs?: number;
  readonly error?: string;
}

/**
 * Boot a Vitest for `packageDir`, run its documented suite
 * (`vtest/features/**​/tests/**​/*.test.ts`) exactly once, close the instance,
 * and return one {@link TestRunRecord} per leaf test derived from the run.
 */
export const runPackageOnce = (
  packageDir: string,
): Effect.Effect<ReadonlyArray<TestRunRecord>, RunError> =>
  Effect.gen(function* () {
    const manager = yield* makeManager(Infinity);
    const runtime = yield* manager.get(packageDir);
    const modules = yield* Effect.tryPromise({
      try: async () => {
        runtime.vitest.resetGlobalTestNamePattern();
        const specs = await runtime.vitest.globTestSpecifications([]);
        const result = await runtime.vitest.runTestSpecifications(specs, false);
        return result.testModules as unknown as ReadonlyArray<ReportedModuleWithId>;
      },
      catch: (cause) => new RunError(`run failed: ${String(cause)}`),
    });
    return testUpdatesFor(packageDir, modules).flatMap((event) =>
      event.type === 'test-updated'
        ? [
            {
              feature: event.feature,
              groupId: event.groupId,
              name: event.name,
              status: event.status,
              ...(event.durationMs !== undefined
                ? { durationMs: event.durationMs }
                : {}),
              ...(event.error !== undefined ? { error: event.error } : {}),
            } satisfies TestRunRecord,
          ]
        : [],
    ) as ReadonlyArray<TestRunRecord>;
  }).pipe(Effect.scoped);
