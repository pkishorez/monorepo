import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Cause, Effect, Exit } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { discoverStoryIds, runAllStories, runStory } from '../src/node.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete (
    globalThis as typeof globalThis & { __laymosCleanupStarted?: unknown }
  ).__laymosCleanupStarted;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeBaseDir(): Promise<string> {
  const baseDir = await mkdtemp(join(import.meta.dirname, 'tmp-story-'));
  temporaryDirectories.push(baseDir);
  return baseDir;
}

describe('Story integration', () => {
  it('returns Effect Scenarios and timing without writing generated state', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'checkout.story.ts';
    await writeFile(join(baseDir, storyId), checkoutStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));
    const artifact = result.artifact;

    expect(result.status).toBe('passed');
    expect(artifact.schemaVersion).toBe(3);
    expect(artifact.scenarios).toHaveLength(2);
    expect(artifact.scenarios.map((scenario) => scenario.outcome)).toEqual([
      'succeeded',
      'succeeded',
    ]);
    for (const scenario of artifact.scenarios) {
      expect(scenario.location.file).toBe(storyId);
      expect(scenario.startedAt).toBeTypeOf('number');
      expect(scenario.durationMillis).toBeTypeOf('number');
      const visit = scenario.execution[0];
      expect(visit).toMatchObject({ outcome: 'succeeded' });
      if (visit !== undefined && 'blockId' in visit) {
        expect(visit.startOffsetMillis).toBeTypeOf('number');
        expect(visit.durationMillis).toBeTypeOf('number');
      }
    }
    expect(
      Object.values(artifact.blocks).some(
        (block) => block.kind === 'decision' && block.arms.length === 2,
      ),
    ).toBe(true);
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('runs Effect Scenarios and interrupts on timeout', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'access.story.ts';
    await writeFile(join(baseDir, storyId), effectStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(result.status).toBe('failed');
    expect(
      result.artifact.scenarios.map((scenario) => scenario.outcome),
    ).toEqual(['succeeded', 'interrupted', 'skipped']);
    const interrupted = result.artifact.scenarios[1];
    expect(interrupted?.durationMillis).toBeLessThan(5_000);
    expect(interrupted?.failures).toEqual([
      {
        phase: 'execution',
        message: 'Scenario timed out after 30ms',
      },
    ]);
  });

  it('attempts cleanup without allowing it to outlive the Scenario timeout', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'cleanup-timeout.story.ts';
    await writeFile(join(baseDir, storyId), cleanupTimeoutStorySource());
    const cleanupState = globalThis as typeof globalThis & {
      __laymosCleanupStarted?: boolean | (() => void);
    };
    cleanupState.__laymosCleanupStarted = false;

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(cleanupState.__laymosCleanupStarted).toBe(true);
    expect(result.artifact.scenarios[0]).toMatchObject({
      outcome: 'interrupted',
      failures: [
        {
          phase: 'cleanup',
          message: 'Scenario timed out after 30ms',
        },
      ],
    });
    expect(result.artifact.scenarios[0]?.durationMillis).toBeLessThan(5_000);
  });

  it('lets Effect interruption cancel cleanup', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'cleanup-interruption.story.ts';
    await writeFile(
      join(baseDir, storyId),
      cleanupTimeoutStorySource('5 seconds'),
    );
    const cleanupStarted = new Promise<void>((resolve) => {
      (
        globalThis as typeof globalThis & {
          __laymosCleanupStarted?: () => void;
        }
      ).__laymosCleanupStarted = resolve;
    });
    const abort = new AbortController();
    const running = Effect.runPromiseExit(runStory(baseDir, storyId), {
      signal: abort.signal,
    });

    await cleanupStarted;
    abort.abort();
    const exit = await running;

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
  });

  it('records only shared execution and preserves lifecycle failures by phase', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'lifecycle.story.ts';
    await writeFile(join(baseDir, storyId), lifecycleStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(result.status).toBe('failed');
    expect(result.artifact.scenarios.map(({ outcome }) => outcome)).toEqual([
      'succeeded',
      'failed',
    ]);
    expect(result.artifact.scenarios[0]?.failures).toEqual([]);
    expect(result.artifact.scenarios[1]?.failures).toEqual([
      { phase: 'cleanup', message: 'cleanup failed' },
    ]);
    expect(blockNames(result.artifact)).toEqual(['shared execution']);
  });

  it('declares nothing and runs nothing outside a generation', async () => {
    const { story } = await import('../src/story/effect/index.js');
    let ran = false;

    story('outside runner', { description: 'Declared outside the runner' })
      .execute(() =>
        Effect.sync(() => {
          ran = true;
        }),
      )
      .scenario(
        'never runs',
        { description: 'Body must not execute' },
        (scenario) =>
          scenario.prepare(() => Effect.void).verify(() => Effect.void),
      );

    expect(ran).toBe(false);
    expect(existsSync(join(import.meta.dirname, '.laymos'))).toBe(false);
  });

  it('treats a complete generation with no Stories as passed and empty', async () => {
    const baseDir = await makeBaseDir();

    const result = await Effect.runPromise(runAllStories(baseDir));

    expect(result).toEqual({
      status: 'passed',
      report: { stories: {} },
      failures: [],
    });
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('discovers Story IDs without loading their modules', async () => {
    const baseDir = await makeBaseDir();
    await writeFile(
      join(baseDir, 'side-effect.story.ts'),
      `globalThis.__laymosDiscoveryLoaded = true;`,
    );

    await expect(Effect.runPromise(discoverStoryIds(baseDir))).resolves.toEqual(
      ['side-effect.story.ts'],
    );
    expect(
      (globalThis as typeof globalThis & { __laymosDiscoveryLoaded?: boolean })
        .__laymosDiscoveryLoaded,
    ).toBeUndefined();

    await writeFile(join(baseDir, 'InvalidName.story.ts'), '');
    await expect(Effect.runPromise(discoverStoryIds(baseDir))).rejects.toThrow(
      'kebab-case',
    );
  });

  it('does not discover Stories in skipped directories', async () => {
    const baseDir = await makeBaseDir();
    for (const directory of ['node_modules', 'dist', '.hidden']) {
      await mkdir(join(baseDir, directory));
      await writeFile(join(baseDir, directory, 'ignored.story.ts'), '');
    }
    await writeFile(join(baseDir, 'included.story.ts'), '');

    await expect(Effect.runPromise(discoverStoryIds(baseDir))).resolves.toEqual(
      ['included.story.ts'],
    );
  });
});

function checkoutStorySource(): string {
  return `
import { Effect } from 'effect';
import { decision, functionBlock, step, story } from '../../src/story/effect/index.ts';
import { strict as assert } from 'node:assert';

const checkout = functionBlock(
  'checkout',
  { description: 'Routes a prepared checkout to its payment or rejection outcome.', attributes: (outcome) => ({ outcome }) },
  (outcome) => step('prepare order', { description: 'Evaluates the prepared order before taking its terminal action.' },
    decision('fraud gate', { description: 'Chooses whether the fraud outcome permits payment.' }, outcome)
      .when('approved', { description: 'Allows payment because fraud checks approved the order.' }, () => step('charge card', { description: 'Charges the approved order to complete payment.' }, Effect.succeed('paid')))
      .when('rejected', { description: 'Stops payment because fraud checks rejected the order.' }, () => step('reject order', { description: 'Records the rejected checkout without charging the customer.' }, Effect.succeed('stopped')))
      .exhaustive(),
  ),
);

story('checkout', { description: 'Routes checkout by fraud outcome' })
  .execute((outcome: 'approved' | 'rejected') => checkout(outcome))
  .scenario('approved', { description: 'Charges an approved order' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('approved' as const)).verify((result) => Effect.sync(() => assert.equal(result, 'paid'))),
  )
  .scenario('rejected', { description: 'Stops a rejected order' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('rejected' as const)).verify((result) => Effect.sync(() => assert.equal(result, 'stopped'))),
  );
`;
}

function effectStorySource(): string {
  return `
import { Context, Effect, Layer } from 'effect';
import { step, story } from '../../src/story/effect/index.ts';

const SharedValue = Context.Reference<number>('story/shared-value', {
  defaultValue: () => 0,
});

story('access', { description: 'Grants and audits access' })
  .provide(Layer.succeed(SharedValue, 42))
  .execute((hang: boolean) => Effect.gen(function* () {
    yield* SharedValue;
    if (hang) return yield* step('call dead service', { description: 'Waits for an unavailable dependency to demonstrate execution interruption.' }, Effect.sleep('5 seconds'));
    return yield* step('issue session', { description: 'Completes the successful access path by issuing an authenticated session.' }, Effect.void);
  }))
  .scenario('grants access', { description: 'Issues a session' }, (scenario) =>
    scenario
      .prepare(() => Effect.gen(function* () {
        yield* SharedValue;
        return false;
      }))
      .verify(() => Effect.gen(function* () {
        yield* SharedValue;
      })),
  )
  .scenario(
    'hangs on a dead dependency',
    { description: 'Times out against an unresponsive integration', timeout: '30 millis' },
    (scenario) => scenario.prepare(() => Effect.succeed(true)).verify(() => Effect.void),
  )
  .skip('future outage path', {
    description: 'Documents a planned Scenario',
  });
`;
}

function lifecycleStorySource(): string {
  return `
import { strict as assert } from 'node:assert';
import { Effect } from 'effect';
import { step, story } from '../../src/story/effect/index.ts';

story('lifecycle', { description: 'Separates operational phases from narrative' })
  .execute((prepared: 'expected-error' | 'cleanup-error') =>
    step('shared execution', { description: 'Produces the execution result selected by the prepared lifecycle condition.' }, prepared === 'expected-error' ? Effect.fail(new Error('expected')) : Effect.succeed('done')),
  )
  .scenario('expected error', { description: 'Accepts an intentional execution error' }, (scenario) =>
    scenario
      .prepare(() => step('unrecorded preparation', { description: 'Prepares the expected-error condition outside narrated execution.' }, Effect.succeed('expected-error' as const)))
      .verifyError((error) => step('unrecorded verification', { description: 'Verifies the intentional execution error outside narrated execution.' }, Effect.sync(() => assert.equal(error.message, 'expected'))))
      .cleanup(() => step('unrecorded cleanup', { description: 'Releases lifecycle resources outside narrated execution.' }, Effect.void)),
  )
  .scenario('cleanup failure', { description: 'Preserves a cleanup failure separately' }, (scenario) =>
    scenario
      .prepare(() => Effect.succeed('cleanup-error' as const))
      .verify((result) => Effect.sync(() => assert.equal(result, 'done')))
      .cleanup(() => Effect.fail(new Error('cleanup failed'))),
  );
`;
}

function cleanupTimeoutStorySource(timeout = '30 millis'): string {
  return `
import { Effect } from 'effect';
import { story } from '../../src/story/effect/index.ts';

story('cleanup timeout', { description: 'Bounds cleanup within the Scenario deadline' })
  .execute(() => Effect.void)
  .scenario(
    'hanging cleanup',
    { description: 'Attempts cleanup without waiting forever', timeout: '${timeout}' },
    (scenario) => scenario
      .prepare(() => Effect.void)
      .verify(() => Effect.void)
      .cleanup(() => Effect.sync(() => {
        if (typeof globalThis.__laymosCleanupStarted === 'function') {
          globalThis.__laymosCleanupStarted();
        } else {
          globalThis.__laymosCleanupStarted = true;
        }
      }).pipe(Effect.andThen(Effect.never))),
  );
`;
}

function blockNames(artifact: {
  readonly blocks: Readonly<Record<string, { readonly name: string }>>;
}): string[] {
  return Object.values(artifact.blocks)
    .map(({ name }) => name)
    .sort();
}
