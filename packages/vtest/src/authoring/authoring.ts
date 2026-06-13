import type { TestContext } from 'vitest';
import { describe, test, TestRunner } from 'vitest';

type Awaitable<T> = T | Promise<T>;
type TestFn = (ctx: TestContext) => Awaitable<void>;

export const VDOC_KEY = 'vdoc';

const setMeta = (
  target: { meta: Record<string, unknown> },
  doc: string,
): void => {
  target.meta[VDOC_KEY] = doc;
};

/**
 * Declare a documented test suite. The `doc` string is the human-readable
 * vdoc stored on the suite's `meta.vdoc`.
 */
export const vdescribe = (name: string, doc: string, fn: () => void): void => {
  describe(name, () => {
    const suite = TestRunner.getCurrentSuite() as unknown as {
      meta?: Record<string, unknown>;
    };
    if (suite && !suite.meta) suite.meta = {};
    if (suite?.meta) setMeta(suite as { meta: Record<string, unknown> }, doc);
    fn();
  });
};

/**
 * Declare a documented test. The `doc` string is the human-readable vdoc
 * stored on the task's `meta.vdoc`.
 */
export const vtest = (name: string, doc: string, fn: TestFn): void => {
  test(name, async (ctx) => {
    setMeta(ctx.task as unknown as { meta: Record<string, unknown> }, doc);
    await fn(ctx);
  });
};
