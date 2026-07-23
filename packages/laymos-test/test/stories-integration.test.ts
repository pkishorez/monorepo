import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { discoverStories, runAllStories, runStory } from 'laymos/node';

const baseDir = join(import.meta.dirname, '..');
const checkoutStoryPath = 'src/stories/checkout';
const accessStoryPath = 'src/stories/access-control';
const failureStoryPath = 'src/stories/failure-evidence';

describe('Laymos Stories consumer integration', () => {
  it('returns every artifact through a complete programmatic run', async () => {
    const generation = await Effect.runPromise(runAllStories(baseDir));
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
    const runs = (await Effect.runPromise(runAllStories(baseDir))).runs;
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
    const catalog = await Effect.runPromise(discoverStories(baseDir));
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
      runStory(baseDir, checkoutStoryPath),
    );
    const complete = await Effect.runPromise(runAllStories(baseDir));

    expect(focused.status).toBe('passed');
    expect(focused.run.name).toBe('Checkout routing');
    expect(complete.status).toBe('passed');
    expect(Object.keys(complete.runs.stories)).toHaveLength(3);
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('returns failed status while preserving partial Scenario evidence', async () => {
    process.env['LAYMOS_TEST_FORCE_FAILURE'] = '1';
    try {
      const result = await Effect.runPromise(
        runStory(baseDir, failureStoryPath),
      );

      expect(result.status).toBe('failed');
      expect(result.run.scenarios[0]).toMatchObject({
        outcome: 'failed',
        execution: [{ outcome: 'succeeded' }],
      });
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
