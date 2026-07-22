import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { discoverStories, runAllStories, runStory } from 'laymos/node';

const baseDir = join(import.meta.dirname, '..');
const checkoutStoryId = 'stories/checkout.story.ts';
const accessStoryId = 'stories/access-control.story.ts';
const failureStoryId = 'stories/failure-evidence.story.ts';

describe('Laymos Stories consumer integration', () => {
  it('returns every artifact through a complete programmatic run', async () => {
    const generation = await Effect.runPromise(runAllStories(baseDir));
    expect(generation.status).toBe('passed');
    expect(Object.keys(generation.report.stories).sort()).toEqual([
      accessStoryId,
      checkoutStoryId,
      failureStoryId,
    ]);
    for (const artifact of Object.values(generation.report.stories)) {
      expect(artifact.schemaVersion).toBe(3);
      expect(artifact.generatedAt).toBeTypeOf('number');
    }
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('records Decisions, attributes, skipped Scenarios, and parallel paths', async () => {
    const report = (await Effect.runPromise(runAllStories(baseDir))).report;
    const checkout = report.stories[checkoutStoryId]!;
    const access = report.stories[accessStoryId]!;

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
        { kind: 'literal', value: 'review', name: 'Review order' },
        { kind: 'otherwise', name: 'Decline order' },
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
    expect(catalog.stories.map(({ storyId }) => storyId)).toEqual([
      accessStoryId,
      checkoutStoryId,
      failureStoryId,
    ]);
    const focused = await Effect.runPromise(runStory(baseDir, checkoutStoryId));
    const complete = await Effect.runPromise(runAllStories(baseDir));

    expect(focused.status).toBe('passed');
    expect(focused.artifact.name).toBe('Checkout routing');
    expect(complete.status).toBe('passed');
    expect(Object.keys(complete.report.stories)).toHaveLength(3);
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('returns failed status while preserving partial Scenario evidence', async () => {
    process.env['LAYMOS_TEST_FORCE_FAILURE'] = '1';
    try {
      const result = await Effect.runPromise(runStory(baseDir, failureStoryId));

      expect(result.status).toBe('failed');
      expect(result.artifact.scenarios[0]).toMatchObject({
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
