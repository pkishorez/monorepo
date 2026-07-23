import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { discoverStories, runStories } from 'laymos/node';

const baseDir = join(import.meta.dirname, '..');
const checkoutStoryPath = 'src/laymos/checkout';
const accessStoryPath = 'src/laymos/access-control';
const failureStoryPath = 'src/laymos/failure-evidence';

describe('Laymos Stories consumer integration', () => {
  it('returns every artifact through a complete programmatic run', async () => {
    const generation = await Effect.runPromise(
      runStories({ projectDir: baseDir }),
    );
    expect(generation.status).toBe('passed');
    expect(Object.keys(generation.runs.stories).sort()).toEqual([
      accessStoryPath,
      checkoutStoryPath,
      failureStoryPath,
    ]);
    for (const artifact of Object.values(generation.runs.stories)) {
      expect(artifact.generatedAt).toBeTypeOf('number');
    }
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('records Decisions, attributes, skipped Scenarios, and parallel paths', async () => {
    const runs = (await Effect.runPromise(runStories({ projectDir: baseDir })))
      .runs;
    const checkout = runs.stories[checkoutStoryPath]!;
    const access = runs.stories[accessStoryPath]!;

    expect(checkout.scenarios.map(({ outcome }) => outcome)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
      'skipped',
    ]);
    expect(checkout.scenarios[0]?.execution[0]).toMatchObject({
      attributes: { orderId: 'order-approved', route: 'approved' },
      outcome: 'succeeded',
    });
    expect(hasParallelPath(checkout)).toBe(true);
    expect(hasParallelPath(access)).toBe(true);

    const checkoutDecision = Object.values(checkout.blocks).find(
      (block) => block.kind === 'decision',
    );
    expect(checkoutDecision).toMatchObject({
      kind: 'decision',
      arms: [
        { kind: 'literal', value: 'approved', name: 'Charge order' },
        { kind: 'literal', value: 'rejected', name: 'Decline order' },
        { kind: 'literal', value: 'review', name: 'Review order' },
      ],
    });

    const accessDecision = Object.values(access.blocks).find(
      (block) => block.kind === 'decision',
    );
    expect(accessDecision).toMatchObject({
      kind: 'decision',
      arms: [
        { kind: 'literal', value: 'allow' },
        { kind: 'literal', value: 'challenge' },
        { kind: 'literal', value: 'deny' },
      ],
    });
  });

  it('supports discovery, focused, and complete programmatic generation', async () => {
    const catalog = await Effect.runPromise(
      discoverStories({ projectDir: baseDir }),
    );
    expect(catalog.modules).toEqual([
      expect.objectContaining({
        modulePath: 'src',
        stories: [
          expect.objectContaining({ storyPath: accessStoryPath }),
          expect.objectContaining({ storyPath: checkoutStoryPath }),
          expect.objectContaining({ storyPath: failureStoryPath }),
        ],
      }),
    ]);
    const focused = await Effect.runPromise(
      runStories({
        projectDir: baseDir,
        selectors: [{ _tag: 'Story', storyPath: checkoutStoryPath }],
      }),
    );
    const complete = await Effect.runPromise(
      runStories({ projectDir: baseDir }),
    );

    expect(focused.status).toBe('passed');
    expect(focused.runs.stories[checkoutStoryPath]?.name).toBe(
      'Checkout routing',
    );
    expect(complete.status).toBe('passed');
    expect(Object.keys(complete.runs.stories)).toHaveLength(3);
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('returns failed status while preserving partial Scenario evidence', async () => {
    process.env['LAYMOS_TEST_FORCE_FAILURE'] = '1';
    try {
      const result = await Effect.runPromise(
        runStories({
          projectDir: baseDir,
          selectors: [{ _tag: 'Story', storyPath: failureStoryPath }],
        }),
      );

      expect(result.status).toBe('failed');
      expect(result.runs.stories[failureStoryPath]?.scenarios[0]).toMatchObject(
        {
          outcome: 'failed',
          execution: [{ outcome: 'succeeded' }],
        },
      );
    } finally {
      delete process.env['LAYMOS_TEST_FORCE_FAILURE'];
    }
  });
});

function hasParallelPath(artifact: {
  readonly scenarios: readonly {
    readonly execution: readonly unknown[];
  }[];
}): boolean {
  return JSON.stringify(artifact.scenarios).includes('"parallel"');
}
