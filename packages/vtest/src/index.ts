import type { TestContext } from 'vitest';
import { describe, test } from 'vitest';
import { getCurrentSuite } from 'vitest/suite';

type Awaitable<T> = T | Promise<T>;
type TestFn = (ctx: TestContext) => Awaitable<void>;

const VDOC_KEY = 'vdoc';

const setMeta = (
  target: { meta: Record<string, unknown> },
  doc: string,
): void => {
  target.meta[VDOC_KEY] = doc;
};

export const vdescribe = (name: string, doc: string, fn: () => void): void => {
  describe(name, () => {
    const suite = getCurrentSuite() as unknown as {
      meta?: Record<string, unknown>;
    };
    if (suite && !suite.meta) suite.meta = {};
    if (suite?.meta) setMeta(suite as { meta: Record<string, unknown> }, doc);
    fn();
  });
};

export const vtest = (name: string, doc: string, fn: TestFn): void => {
  test(name, async (ctx) => {
    setMeta(ctx.task as unknown as { meta: Record<string, unknown> }, doc);
    await fn(ctx);
  });
};
